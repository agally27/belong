import { z } from "zod";
import { getDb, inDays, json, now, uid } from "../db";
import { MEMORY_CATEGORIES, type MemoryCategory } from "../config";
import { extractTopics } from "../matching/topics";
import { AppError, audit, forbidden } from "./core";
import { syncSignals } from "./signals";
import { getLimits } from "./subscriptions";

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  topics: string[];
  source: "conversation" | "onboarding" | "manual";
  status: "proposed" | "active";
  shareForMatching: boolean;
  createdAt: string;
  updatedAt: string;
}

type MemoryRow = {
  id: string;
  user_id: string;
  category: string;
  content: string;
  topics: string;
  source: string;
  status: string;
  share_for_matching: number;
  created_at: string;
  updated_at: string;
};

const toMemory = (r: MemoryRow): Memory => ({
  id: r.id,
  category: r.category as MemoryCategory,
  content: r.content,
  topics: json<string[]>(r.topics, []),
  source: r.source as Memory["source"],
  status: r.status as Memory["status"],
  shareForMatching: Boolean(r.share_for_matching),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const categoryIds = MEMORY_CATEGORIES.map((c) => c.id) as [MemoryCategory, ...MemoryCategory[]];
export const isShareableCategory = (c: string) => MEMORY_CATEGORIES.some((m) => m.id === c && m.shareable);

export const memorySchema = z.object({
  category: z.enum(categoryIds),
  content: z.string().trim().min(3, "Write a few words to remember.").max(500, "Please keep memories under 500 characters."),
  shareForMatching: z.boolean().default(false),
});

/** Every query here is scoped by user_id: a member can only ever reach their own memories. */
export async function listMemories(userId: string, status?: Memory["status"]): Promise<Memory[]> {
  const db = await getDb();
  const rows = status
    ? await db.all<MemoryRow>("SELECT * FROM memories WHERE user_id = ? AND status = ? ORDER BY created_at DESC", [userId, status])
    : await db.all<MemoryRow>("SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  return rows.map(toMemory);
}

async function ownMemory(userId: string, id: string): Promise<MemoryRow> {
  const db = await getDb();
  const row = await db.get<MemoryRow>("SELECT * FROM memories WHERE id = ?", [id]);
  if (!row || row.user_id !== userId) throw forbidden("That memory isn't yours to change.");
  return row;
}

export async function createMemory(
  userId: string,
  input: z.input<typeof memorySchema>,
  opts: { source?: Memory["source"]; status?: Memory["status"] } = {},
): Promise<Memory> {
  const d = memorySchema.parse(input);
  const db = await getDb();
  const id = uid();
  const ts = now();
  const share = d.shareForMatching && isShareableCategory(d.category);
  await db.run(
    "INSERT INTO memories (id, user_id, category, content, topics, source, status, share_for_matching, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, userId, d.category, d.content, JSON.stringify(extractTopics(d.content)), opts.source ?? "manual", opts.status ?? "active", share ? 1 : 0, ts, ts],
  );
  if ((opts.status ?? "active") === "active") await syncSignals(userId);
  return toMemory((await db.get<MemoryRow>("SELECT * FROM memories WHERE id = ?", [id]))!);
}

export async function approveMemory(userId: string, id: string, share = false) {
  const row = await ownMemory(userId, id);
  const db = await getDb();
  await db.run("UPDATE memories SET status = 'active', share_for_matching = ?, updated_at = ? WHERE id = ?", [
    share && isShareableCategory(row.category) ? 1 : 0,
    now(),
    id,
  ]);
  await syncSignals(userId);
}

export async function updateMemory(userId: string, id: string, input: z.input<typeof memorySchema>) {
  await ownMemory(userId, id);
  const d = memorySchema.parse(input);
  const db = await getDb();
  await db.run(
    "UPDATE memories SET category = ?, content = ?, topics = ?, share_for_matching = ?, updated_at = ? WHERE id = ?",
    [d.category, d.content, JSON.stringify(extractTopics(d.content)), d.shareForMatching && isShareableCategory(d.category) ? 1 : 0, now(), id],
  );
  await syncSignals(userId);
}

export async function setMemorySharing(userId: string, id: string, share: boolean) {
  const row = await ownMemory(userId, id);
  if (share && !isShareableCategory(row.category)) {
    throw new AppError("Memories in this category always stay private.");
  }
  const db = await getDb();
  await db.run("UPDATE memories SET share_for_matching = ?, updated_at = ? WHERE id = ?", [share ? 1 : 0, now(), id]);
  await syncSignals(userId);
}

export async function deleteMemory(userId: string, id: string) {
  await ownMemory(userId, id);
  const db = await getDb();
  await db.run("DELETE FROM memories WHERE id = ?", [id]);
  await audit(userId, "memory.deleted", "memory", id);
  await syncSignals(userId);
}

export async function deleteAllMemories(userId: string) {
  const db = await getDb();
  await db.run("DELETE FROM memories WHERE user_id = ?", [userId]);
  await audit(userId, "memory.deleted_all", "user", userId);
  await syncSignals(userId);
}

/* ------------------------------ Intentions ------------------------------ */

export interface Intention {
  id: string;
  title: string;
  topics: string[];
  mode: "moment" | "intention" | "collaboration";
  status: "proposed" | "active" | "ended" | "expired";
  shared: boolean;
  expiresAt: string;
  createdAt: string;
}

type IntentionRow = {
  id: string;
  user_id: string;
  title: string;
  topics: string;
  mode: string;
  status: string;
  shared: number;
  expires_at: string;
  created_at: string;
};

const toIntention = (r: IntentionRow): Intention => ({
  id: r.id,
  title: r.title,
  topics: json<string[]>(r.topics, []),
  mode: r.mode as Intention["mode"],
  status: r.status as Intention["status"],
  shared: Boolean(r.shared),
  expiresAt: r.expires_at,
  createdAt: r.created_at,
});

export const intentionSchema = z.object({
  title: z.string().trim().min(5, "Describe what you're hoping for.").max(160),
  mode: z.enum(["moment", "intention", "collaboration"]).default("intention"),
  days: z.coerce.number().int().min(1).max(30).default(7),
  shared: z.boolean().default(true),
});

export async function listIntentions(userId: string, includeEnded = false): Promise<Intention[]> {
  const db = await getDb();
  const rows = await db.all<IntentionRow>("SELECT * FROM intentions WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  const ts = now();
  return rows
    .map(toIntention)
    .map((i) => (i.status === "active" && i.expiresAt <= ts ? { ...i, status: "expired" as const } : i))
    .filter((i) => includeEnded || i.status === "active" || i.status === "proposed");
}

async function assertIntentionCapacity(userId: string) {
  const limits = await getLimits(userId);
  if (limits.activeIntentions < 0) return;
  const db = await getDb();
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM intentions WHERE user_id = ? AND status = 'active' AND shared = 1 AND expires_at > ?",
    [userId, now()],
  );
  if (Number(row?.n) >= limits.activeIntentions) {
    throw new AppError(
      `Your membership allows ${limits.activeIntentions} shared intentions at a time. End one first, or upgrade for more.`,
      "limit",
    );
  }
}

export async function createIntention(
  userId: string,
  input: z.input<typeof intentionSchema>,
  opts: { status?: "proposed" | "active" } = {},
): Promise<Intention> {
  const d = intentionSchema.parse(input);
  const status = opts.status ?? "active";
  if (status === "active" && d.shared) await assertIntentionCapacity(userId);
  const db = await getDb();
  const id = uid();
  await db.run(
    "INSERT INTO intentions (id, user_id, title, topics, mode, status, shared, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, userId, d.title, JSON.stringify(extractTopics(d.title)), d.mode, status, d.shared ? 1 : 0, inDays(d.days), now()],
  );
  if (status === "active") await syncSignals(userId);
  return toIntention((await db.get<IntentionRow>("SELECT * FROM intentions WHERE id = ?", [id]))!);
}

async function ownIntention(userId: string, id: string): Promise<IntentionRow> {
  const db = await getDb();
  const row = await db.get<IntentionRow>("SELECT * FROM intentions WHERE id = ?", [id]);
  if (!row || row.user_id !== userId) throw forbidden("That intention isn't yours to change.");
  return row;
}

/** Approve a companion-proposed intention, choosing whether to share it as a signal. */
export async function approveIntention(userId: string, id: string, share: boolean, days = 7) {
  await ownIntention(userId, id);
  if (share) await assertIntentionCapacity(userId);
  const db = await getDb();
  await db.run("UPDATE intentions SET status = 'active', shared = ?, expires_at = ? WHERE id = ?", [
    share ? 1 : 0,
    inDays(Math.min(30, Math.max(1, days))),
    id,
  ]);
  await audit(userId, "intention.approved", "intention", id, { shared: share });
  await syncSignals(userId);
}

export async function endIntention(userId: string, id: string) {
  await ownIntention(userId, id);
  const db = await getDb();
  await db.run("UPDATE intentions SET status = 'ended', shared = 0 WHERE id = ?", [id]);
  await syncSignals(userId);
}
