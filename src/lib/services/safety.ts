import { z } from "zod";
import { getDb, now, uid } from "../db";
import { AppError, audit, notFound } from "./core";
import { previewsById, relationship, type MemberPreview } from "./members";

export const REPORT_REASONS = {
  harassment: "Harassment or unkindness",
  inappropriate: "Inappropriate content",
  fake: "Fake or misleading profile",
  safety: "I'm worried about someone's safety",
  spam: "Spam or selling",
  other: "Something else",
} as const;

/** Blocking is immediate, silent and total: connection ended, suggestions and pending introductions removed. */
export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new AppError("You can't block yourself.");
  const db = await getDb();
  const target = await db.get("SELECT id FROM users WHERE id = ?", [targetId]);
  if (!target) throw notFound();
  const ts = now();
  await db.tx(async () => {
    await db.run("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?) ON CONFLICT (blocker_id, blocked_id) DO NOTHING", [userId, targetId, ts]);
    const both = [userId, targetId, targetId, userId];
    await db.run("UPDATE connections SET status = 'ended' WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)", both);
    await db.run("UPDATE matches SET status = 'blocked', updated_at = ? WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)", [ts, ...both]);
    await db.run(
      "UPDATE introductions SET status = 'withdrawn', decided_at = ? WHERE status = 'pending' AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))",
      [ts, ...both],
    );
  });
  await audit(userId, "user.blocked", "user", targetId);
}

export async function unblockUser(userId: string, targetId: string) {
  const db = await getDb();
  await db.run("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?", [userId, targetId]);
  await audit(userId, "user.unblocked", "user", targetId);
}

export async function listBlocked(userId: string): Promise<MemberPreview[]> {
  const db = await getDb();
  const rows = await db.all<{ blocked_id: string }>("SELECT blocked_id FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC", [userId]);
  const previews = await previewsById(rows.map((r) => r.blocked_id));
  return rows.map((r) => previews.get(r.blocked_id)).filter(Boolean) as MemberPreview[];
}

export const reportSchema = z.object({
  targetId: z.string().min(1),
  reason: z.enum(Object.keys(REPORT_REASONS) as [string, ...string[]]),
  detail: z.string().trim().max(1000).optional(),
  contextType: z.enum(["profile", "message", "circle", "event"]).default("profile"),
  contextId: z.string().optional(),
  alsoBlock: z.boolean().default(false),
});

export async function reportUser(userId: string, input: z.input<typeof reportSchema>): Promise<string> {
  const d = reportSchema.parse(input);
  if (d.targetId === userId) throw new AppError("You can't report yourself.");
  // You can only report someone you have actually encountered.
  if ((await relationship(userId, d.targetId)) === "none") {
    const db0 = await getDb();
    const had = await db0.get(
      "SELECT 1 AS x FROM introductions WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)",
      [userId, d.targetId, d.targetId, userId],
    );
    const conn = await db0.get("SELECT 1 AS x FROM connections WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)", [userId, d.targetId, d.targetId, userId]);
    if (!had && !conn) throw notFound("We couldn't find that member.");
  }
  const db = await getDb();
  const id = uid();
  await db.run(
    "INSERT INTO reports (id, reporter_id, reported_user_id, context_type, context_id, reason, detail, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    [id, userId, d.targetId, d.contextType, d.contextId ?? null, d.reason, d.detail || null, now()],
  );
  await audit(userId, "report.created", "report", id, { reason: d.reason });
  if (d.alsoBlock) await blockUser(userId, d.targetId);
  return id;
}
