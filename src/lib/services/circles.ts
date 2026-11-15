import { z } from "zod";
import { getDb, json, now, uid } from "../db";
import { TOPICS, topicLabel } from "../matching/topics";
import { taxonomyMatcher } from "../matching/semantic";
import { AppError, audit, flag, forbidden, notFound, notify } from "./core";
import { previewsById, type MemberPreview } from "./members";
import { getLimits } from "./subscriptions";

/** BELONG Circles: small groups (4–8 people) around a shared interest. */
export const CIRCLE_MIN = 4;
export const CIRCLE_MAX = 8;

export interface CircleView {
  id: string;
  name: string;
  description: string;
  topic: string;
  topicLabel: string;
  area: string | null;
  capacity: number;
  memberCount: number;
  isMember: boolean;
  isHost: boolean;
  /** Why this circle is suggested to the viewer (their own signals only). */
  fit: string | null;
  conversationId: string | null;
}

type CircleRow = { id: string; name: string; description: string; topic: string; area: string | null; capacity: number; status: string; created_by: string | null };

async function myTopics(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.all<{ topic: string }>("SELECT DISTINCT topic FROM signals WHERE user_id = ? AND status = 'active'", [userId]);
  const profile = await db.get<{ interests: string }>("SELECT interests FROM profiles WHERE user_id = ?", [userId]);
  return [...new Set([...rows.map((r) => r.topic), ...json<string[]>(profile?.interests, [])])];
}

async function view(userId: string, rows: CircleRow[]): Promise<CircleView[]> {
  const db = await getDb();
  const topics = await myTopics(userId);
  const out: CircleView[] = [];
  for (const r of rows) {
    const members = await db.all<{ user_id: string; role: string }>("SELECT user_id, role FROM circle_members WHERE circle_id = ?", [r.id]);
    const me = members.find((m) => m.user_id === userId);
    const conv = me ? await db.get<{ id: string }>("SELECT id FROM conversations WHERE circle_id = ?", [r.id]) : undefined;
    const best = topics.map((t) => ({ t, s: taxonomyMatcher.similarity(t, r.topic) })).sort((a, b) => b.s - a.s)[0];
    out.push({
      id: r.id,
      name: r.name,
      description: r.description,
      topic: r.topic,
      topicLabel: topicLabel(r.topic),
      area: r.area,
      capacity: Number(r.capacity),
      memberCount: members.length,
      isMember: Boolean(me),
      isHost: me?.role === "host",
      fit: best && best.s >= 1 ? `Matches your interest in ${topicLabel(best.t)}` : best && best.s >= 0.5 ? `Close to your interest in ${topicLabel(best.t)}` : null,
      conversationId: conv?.id ?? null,
    });
  }
  return out;
}

export async function listCircles(userId: string): Promise<{ mine: CircleView[]; suggested: CircleView[]; others: CircleView[] }> {
  const db = await getDb();
  const rows = await db.all<CircleRow>("SELECT * FROM circles WHERE status = 'open' ORDER BY created_at DESC");
  const all = await view(userId, rows);
  const open = all.filter((c) => !c.isMember && c.memberCount < c.capacity);
  return {
    mine: all.filter((c) => c.isMember),
    suggested: open.filter((c) => c.fit),
    others: open.filter((c) => !c.fit),
  };
}

export async function getCircle(userId: string, circleId: string): Promise<(CircleView & { members: (MemberPreview & { host: boolean })[] }) | null> {
  const db = await getDb();
  const row = await db.get<CircleRow>("SELECT * FROM circles WHERE id = ?", [circleId]);
  if (!row) return null;
  const [c] = await view(userId, [row]);
  const memberRows = await db.all<{ user_id: string; role: string }>("SELECT user_id, role FROM circle_members WHERE circle_id = ? ORDER BY joined_at", [circleId]);
  // Member names are visible to members; non-members see only the count.
  let members: (MemberPreview & { host: boolean })[] = [];
  if (c.isMember) {
    const blocked = new Set(
      (
        await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId])
      ).map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)),
    );
    const previews = await previewsById(memberRows.map((m) => m.user_id));
    members = memberRows
      .filter((m) => previews.has(m.user_id) && !blocked.has(m.user_id))
      .map((m) => ({ ...previews.get(m.user_id)!, host: m.role === "host" }));
  }
  return { ...c, members };
}

async function assertCircleCapacity(userId: string) {
  const limits = await getLimits(userId);
  if (limits.circles < 0) return;
  const db = await getDb();
  const n = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM circle_members WHERE user_id = ?", [userId]);
  if (Number(n?.n) >= limits.circles) {
    throw new AppError(`Your membership includes ${limits.circles} Circle${limits.circles === 1 ? "" : "s"} at a time. Leave one first, or upgrade for more.`, "limit");
  }
}

export const circleSchema = z.object({
  name: z.string().trim().min(3, "Give your Circle a name.").max(60),
  description: z.string().trim().max(400).default(""),
  topic: z.string().refine((t) => Boolean(TOPICS[t]), "Choose a topic."),
  area: z.string().trim().max(60).optional(),
  capacity: z.coerce.number().int().min(CIRCLE_MIN, `Circles have ${CIRCLE_MIN}–${CIRCLE_MAX} people.`).max(CIRCLE_MAX, `Circles have ${CIRCLE_MIN}–${CIRCLE_MAX} people.`),
});

export async function createCircle(userId: string, input: z.input<typeof circleSchema>): Promise<string> {
  if (!(await flag("circles"))) throw forbidden("Circles are paused right now.");
  const d = circleSchema.parse(input);
  await assertCircleCapacity(userId);
  const db = await getDb();
  const id = uid();
  const ts = now();
  await db.tx(async () => {
    await db.run("INSERT INTO circles (id, name, description, topic, area, capacity, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)", [
      id,
      d.name,
      d.description,
      d.topic,
      d.area || null,
      d.capacity,
      userId,
      ts,
    ]);
    await db.run("INSERT INTO circle_members (circle_id, user_id, role, joined_at) VALUES (?, ?, 'host', ?)", [id, userId, ts]);
    await db.run("INSERT INTO conversations (id, kind, circle_id, created_at) VALUES (?, 'circle', ?, ?)", [uid(), id, ts]);
  });
  await audit(userId, "circle.created", "circle", id);
  return id;
}

export async function joinCircle(userId: string, circleId: string) {
  if (!(await flag("circles"))) throw forbidden("Circles are paused right now.");
  const db = await getDb();
  await db.tx(async () => {
    const circle = await db.get<CircleRow>("SELECT * FROM circles WHERE id = ?", [circleId]);
    if (!circle || circle.status !== "open") throw notFound("That Circle isn't available.");
    const members = await db.all<{ user_id: string; role: string }>("SELECT user_id, role FROM circle_members WHERE circle_id = ?", [circleId]);
    if (members.some((m) => m.user_id === userId)) return;
    if (await db.get("SELECT 1 AS x FROM circle_removals WHERE circle_id = ? AND user_id = ?", [circleId, userId])) {
      throw new AppError("This Circle isn't available to join.", "forbidden");
    }
    if (members.length >= Number(circle.capacity)) throw new AppError("This Circle is full.", "conflict");
    const blocks = await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId]);
    const blocked = new Set(blocks.map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)));
    if (members.some((m) => blocked.has(m.user_id))) throw new AppError("This Circle isn't available to join.", "forbidden");
    await assertCircleCapacity(userId);
    await db.run("INSERT INTO circle_members (circle_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", [circleId, userId, now()]);
    // Earlier chat is visible to the newcomer but shouldn't count as unread.
    const conv = await db.get<{ id: string }>("SELECT id FROM conversations WHERE circle_id = ?", [circleId]);
    if (conv) {
      await db.run(
        "INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at",
        [conv.id, userId, now()],
      );
    }
    const host = members.find((m) => m.role === "host");
    if (host) await notify(host.user_id, "circle", `Someone new joined ${circle.name}`, "Say hello and make them feel welcome.", `/circles/${circleId}`);
  });
}

export async function leaveCircle(userId: string, circleId: string) {
  const db = await getDb();
  await db.tx(async () => {
    const me = await db.get<{ role: string }>("SELECT role FROM circle_members WHERE circle_id = ? AND user_id = ?", [circleId, userId]);
    if (!me) return;
    await db.run("DELETE FROM circle_members WHERE circle_id = ? AND user_id = ?", [circleId, userId]);
    const rest = await db.all<{ user_id: string }>("SELECT user_id FROM circle_members WHERE circle_id = ? ORDER BY joined_at", [circleId]);
    if (!rest.length) {
      await db.run("UPDATE circles SET status = 'closed' WHERE id = ?", [circleId]);
    } else if (me.role === "host") {
      await db.run("UPDATE circle_members SET role = 'host' WHERE circle_id = ? AND user_id = ?", [circleId, rest[0].user_id]);
    }
  });
}

/**
 * Host removes someone (for example after a falling-out or repeated no-shows).
 * Quiet and final: they're told kindly, can't rejoin, and anything serious should
 * also be reported so the BELONG team can look at it.
 */
export async function removeMember(hostId: string, circleId: string, memberId: string) {
  if (hostId === memberId) throw new AppError("To step away yourself, leave the Circle instead.");
  const db = await getDb();
  const me = await db.get<{ role: string }>("SELECT role FROM circle_members WHERE circle_id = ? AND user_id = ?", [circleId, hostId]);
  if (me?.role !== "host") throw forbidden("Only the host can remove someone.");
  const them = await db.get("SELECT 1 AS x FROM circle_members WHERE circle_id = ? AND user_id = ?", [circleId, memberId]);
  if (!them) throw notFound("They're not in this Circle.");
  const circle = await db.get<{ name: string }>("SELECT name FROM circles WHERE id = ?", [circleId]);
  await db.tx(async () => {
    await db.run("DELETE FROM circle_members WHERE circle_id = ? AND user_id = ?", [circleId, memberId]);
    await db.run("INSERT INTO circle_removals (circle_id, user_id, removed_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (circle_id, user_id) DO NOTHING", [circleId, memberId, hostId, now()]);
    await db.run("DELETE FROM event_rsvps WHERE user_id = ? AND event_id IN (SELECT id FROM events WHERE circle_id = ?)", [memberId, circleId]);
  });
  await audit(hostId, "circle.member_removed", "circle", circleId);
  await notify(memberId, "circle", `You're no longer part of ${circle?.name ?? "a Circle"}`, "The host has made a change to the group. Your companion will keep looking for other Circles that suit you.", "/circles");
}
