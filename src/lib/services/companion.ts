import { getDb, json, now, uid } from "../db";
import { getAIProvider } from "../ai";
import { topicLabel } from "../matching/topics";
import { AppError, hasConsent, track } from "./core";
import { createIntention, createMemory, listIntentions, listMemories, type Intention, type Memory } from "./memory";
import { getCompanion, getProfile } from "./profile";

export interface CompanionMessage {
  id: string;
  role: "member" | "companion";
  content: string;
  createdAt: string;
  simulated: boolean;
  suggestions: string[];
  /** Proposals attached to this message that still await the member's decision. */
  memories: Memory[];
  intention: Intention | null;
}

type Meta = { memoryIds?: string[]; intentionId?: string | null; suggestions?: string[]; simulated?: boolean };

/** A member's private conversation with their companion. Scoped strictly to that member. */
export async function getThread(userId: string, limit = 80): Promise<CompanionMessage[]> {
  const db = await getDb();
  const rows = (
    await db.all<{ id: string; role: string; content: string; meta: string; created_at: string }>(
      "SELECT id, role, content, meta, created_at FROM companion_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      [userId, limit],
    )
  ).reverse();
  const proposedMemories = new Map((await listMemories(userId, "proposed")).map((m) => [m.id, m]));
  const proposedIntentions = new Map((await listIntentions(userId)).filter((i) => i.status === "proposed").map((i) => [i.id, i]));
  return rows.map((r) => {
    const meta = json<Meta>(r.meta, {});
    return {
      id: r.id,
      role: r.role as CompanionMessage["role"],
      content: r.content,
      createdAt: r.created_at,
      simulated: Boolean(meta.simulated),
      suggestions: meta.suggestions ?? [],
      memories: (meta.memoryIds ?? []).map((id) => proposedMemories.get(id)).filter(Boolean) as Memory[],
      intention: meta.intentionId ? (proposedIntentions.get(meta.intentionId) ?? null) : null,
    };
  });
}

async function save(userId: string, role: "member" | "companion", content: string, meta: Meta = {}, at = now()) {
  const db = await getDb();
  await db.run("INSERT INTO companion_messages (id, user_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)", [uid(), userId, role, content, JSON.stringify(meta), at]);
}

/** Ensures a new member is greeted once. */
export async function ensureWelcome(userId: string) {
  const db = await getDb();
  const any = await db.get("SELECT 1 AS x FROM companion_messages WHERE user_id = ? LIMIT 1", [userId]);
  if (any) return;
  const [companion, profile, ai] = [await getCompanion(userId), await getProfile(userId), await getAIProvider()];
  const name = profile?.displayName.split(" ")[0] ?? "there";
  const interests = (profile?.interests ?? []).slice(0, 2).map(topicLabel);
  await save(
    userId,
    "companion",
    `Hello ${name}, I'm ${companion.name} — your companion here on BELONG. I'm an AI, and my whole purpose is to help you find real people you'll genuinely get along with.${
      interests.length ? ` I can see you're into ${interests.join(" and ")}, which is a lovely place to start.` : ""
    } Tell me what you've been enjoying lately, or what you'd love company for — I'll only remember what you approve.`,
    { simulated: ai.simulated, suggestions: ["Something I love doing is…", "I'd like to meet people who…", "How do you find people for me?"] },
  );
}

export async function sendToCompanion(userId: string, textRaw: string): Promise<void> {
  const text = textRaw.trim();
  if (!text) throw new AppError("Say something to your companion first.");
  if (text.length > 2000) throw new AppError("Please keep messages under 2,000 characters.");
  const db = await getDb();
  const [companion, profile, memories, intentions, canPropose] = [
    await getCompanion(userId),
    await getProfile(userId),
    await listMemories(userId, "active"),
    await listIntentions(userId),
    await hasConsent(userId, "companion_memory"),
  ];
  const history = (await getThread(userId, 20)).map((m) => ({ role: m.role, content: m.content }));
  const suggestions = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM matches WHERE status = 'suggested' AND ((user_a = ? AND a_state = 'new') OR (user_b = ? AND b_state = 'new'))",
    [userId, userId],
  );
  const intros = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM introductions WHERE status = 'pending' AND ((user_a = ? AND a_decision = 'pending') OR (user_b = ? AND b_decision = 'pending'))",
    [userId, userId],
  );
  const ts = now();
  await save(userId, "member", text, {}, ts);

  const ai = await getAIProvider();
  const reply = await ai.companionReply({
    companionName: companion.name,
    tone: companion.tone,
    proactivity: companion.proactivity,
    memberName: profile?.displayName ?? "there",
    interests: profile?.interests ?? [],
    memories: memories.map((m) => ({ category: m.category, content: m.content })),
    intentions: intentions.filter((i) => i.status === "active").map((i) => i.title),
    history,
    message: text,
    waitingSuggestions: Number(suggestions?.n ?? 0),
    waitingIntroductions: Number(intros?.n ?? 0),
    canProposeMemories: canPropose,
  });

  // Proposals are stored as "proposed" — inert until the member approves them.
  const memoryIds: string[] = [];
  for (const m of reply.memories) {
    try {
      const created = await createMemory(userId, { category: m.category, content: m.content, shareForMatching: false }, { source: "conversation", status: "proposed" });
      memoryIds.push(created.id);
    } catch {
      /* invalid proposal from the model — skip */
    }
  }
  let intentionId: string | null = null;
  if (reply.intention) {
    try {
      const created = await createIntention(
        userId,
        { title: reply.intention.title, mode: reply.intention.mode, days: reply.intention.days, shared: false },
        { status: "proposed" },
      );
      if (created.topics.length) intentionId = created.id;
      else await db.run("DELETE FROM intentions WHERE id = ?", [created.id]);
    } catch {
      /* skip */
    }
  }
  await save(userId, "companion", reply.text, { memoryIds, intentionId, suggestions: reply.suggestions, simulated: ai.simulated }, new Date(Date.parse(ts) + 5).toISOString());
  await track(null, "companion_message");
}

export async function dismissProposedMemory(userId: string, memoryId: string) {
  const db = await getDb();
  await db.run("DELETE FROM memories WHERE id = ? AND user_id = ? AND status = 'proposed'", [memoryId, userId]);
}

export async function dismissProposedIntention(userId: string, intentionId: string) {
  const db = await getDb();
  await db.run("DELETE FROM intentions WHERE id = ? AND user_id = ? AND status = 'proposed'", [intentionId, userId]);
}

export async function clearThread(userId: string) {
  const db = await getDb();
  await db.run("DELETE FROM companion_messages WHERE user_id = ?", [userId]);
  await db.run("DELETE FROM memories WHERE user_id = ? AND status = 'proposed'", [userId]);
  await db.run("DELETE FROM intentions WHERE user_id = ? AND status = 'proposed'", [userId]);
}

export async function aiStatus() {
  const ai = await getAIProvider();
  return { provider: ai.name, simulated: ai.simulated };
}
