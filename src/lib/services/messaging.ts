import { getDb, json, now, uid } from "../db";
import { getAIProvider } from "../ai";
import { topicLabel } from "../matching/topics";
import { reasonTexts, type MatchReason } from "../matching/engine";
import { AppError, flag, forbidden, isBlockedPair, notify, track } from "./core";
import { previewsById, type MemberPreview } from "./members";

/**
 * Private messaging. Access rule, enforced on every read and write:
 *  - direct conversations: only the two connected members, while the
 *    connection is active and neither has blocked the other;
 *  - circle conversations: only current members of that circle.
 * Nobody else — including administrators and the AI — can read messages.
 */
export interface ConversationSummary {
  id: string;
  kind: "direct" | "circle" | "gathering";
  title: string;
  member: MemberPreview | null;
  circleId: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
}

export interface Message {
  id: string;
  senderId: string | null;
  senderName: string;
  mine: boolean;
  content: string;
  simulated: boolean;
  createdAt: string;
}

type Access = {
  id: string;
  kind: "direct" | "circle" | "gathering";
  gatheringId?: string;
  connectionId: string | null;
  circleId: string | null;
  otherId: string | null;
  sharedTopics: string[];
  introductionId: string | null;
};

/** Central permission check. Throws unless the member may use this conversation. */
export async function assertConversationAccess(userId: string, conversationId: string): Promise<Access> {
  const db = await getDb();
  const c = await db.get<{ id: string; kind: string; connection_id: string | null; circle_id: string | null; gathering_id: string | null }>(
    "SELECT id, kind, connection_id, circle_id, gathering_id FROM conversations WHERE id = ?",
    [conversationId],
  );
  if (!c) throw forbidden("That conversation isn't available.");
  if (c.kind === "gathering") {
    // Only people who said yes to a confirmed gathering.
    const ok = await db.get(
      "SELECT 1 AS x FROM gathering_invites i JOIN gatherings g ON g.id = i.gathering_id WHERE i.gathering_id = ? AND i.user_id = ? AND i.status = 'accepted' AND g.status IN ('confirmed', 'completed')",
      [c.gathering_id, userId],
    );
    if (!ok) throw forbidden("That conversation isn't available.");
    return { id: c.id, kind: "gathering", gatheringId: c.gathering_id!, connectionId: null, circleId: null, otherId: null, sharedTopics: [], introductionId: null };
  }
  if (c.kind === "direct") {
    const conn = await db.get<{ user_a: string; user_b: string; status: string; shared_topics: string; introduction_id: string | null }>(
      "SELECT user_a, user_b, status, shared_topics, introduction_id FROM connections WHERE id = ?",
      [c.connection_id],
    );
    if (!conn || conn.status !== "active" || (conn.user_a !== userId && conn.user_b !== userId)) throw forbidden("That conversation isn't available.");
    const otherId = conn.user_a === userId ? conn.user_b : conn.user_a;
    if (await isBlockedPair(userId, otherId)) throw forbidden("That conversation isn't available.");
    return { id: c.id, kind: "direct", connectionId: c.connection_id, circleId: null, otherId, sharedTopics: json<string[]>(conn.shared_topics, []), introductionId: conn.introduction_id };
  }
  const member = await db.get("SELECT 1 AS x FROM circle_members WHERE circle_id = ? AND user_id = ?", [c.circle_id, userId]);
  if (!member) throw forbidden("That conversation isn't available.");
  return { id: c.id, kind: "circle", connectionId: null, circleId: c.circle_id, otherId: null, sharedTopics: [], introductionId: null };
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const db = await getDb();
  const direct = await db.all<{ id: string; user_a: string; user_b: string }>(
    "SELECT cv.id, c.user_a, c.user_b FROM conversations cv JOIN connections c ON c.id = cv.connection_id WHERE c.status = 'active' AND (c.user_a = ? OR c.user_b = ?)",
    [userId, userId],
  );
  const circles = await db.all<{ id: string; circle_id: string; name: string }>(
    "SELECT cv.id, cv.circle_id, ci.name FROM conversations cv JOIN circles ci ON ci.id = cv.circle_id JOIN circle_members m ON m.circle_id = ci.id WHERE m.user_id = ?",
    [userId],
  );
  const blocked = new Set(
    (
      await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId])
    ).map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)),
  );
  const previews = await previewsById(direct.map((d) => (d.user_a === userId ? d.user_b : d.user_a)));
  const out: ConversationSummary[] = [];
  const stats = async (id: string) => {
    const last = await db.get<{ content: string; created_at: string }>("SELECT content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1", [id]);
    const read = await db.get<{ last_read_at: string }>("SELECT last_read_at FROM conversation_reads WHERE conversation_id = ? AND user_id = ?", [id, userId]);
    const unread = await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND created_at > ? AND (sender_id IS NULL OR sender_id != ?)",
      [id, read?.last_read_at ?? "", userId],
    );
    return { lastMessage: last?.content ?? null, lastAt: last?.created_at ?? null, unread: Number(unread?.n ?? 0) };
  };
  for (const d of direct) {
    const otherId = d.user_a === userId ? d.user_b : d.user_a;
    const member = previews.get(otherId);
    if (!member || blocked.has(otherId)) continue;
    out.push({ id: d.id, kind: "direct", title: member.name, member, circleId: null, ...(await stats(d.id)) });
  }
  for (const c of circles) {
    out.push({ id: c.id, kind: "circle", title: c.name, member: null, circleId: c.circle_id, ...(await stats(c.id)) });
  }
  const gatherings = await db.all<{ id: string; title: string }>(
    "SELECT cv.id, g.title FROM conversations cv JOIN gatherings g ON g.id = cv.gathering_id JOIN gathering_invites i ON i.gathering_id = g.id WHERE i.user_id = ? AND i.status = 'accepted' AND g.status IN ('confirmed', 'completed')",
    [userId],
  );
  for (const g of gatherings) out.push({ id: g.id, kind: "gathering", title: g.title, member: null, circleId: null, ...(await stats(g.id)) });
  return out.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

export async function unreadMessageCount(userId: string): Promise<number> {
  return (await listConversations(userId)).reduce((n, c) => n + c.unread, 0);
}

export async function getMessages(userId: string, conversationId: string, limit = 200): Promise<{ access: Access; messages: Message[] }> {
  const access = await assertConversationAccess(userId, conversationId);
  const db = await getDb();
  const rows = (
    await db.all<{ id: string; sender_id: string | null; content: string; simulated: number; created_at: string }>(
      "SELECT id, sender_id, content, simulated, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?",
      [conversationId, limit],
    )
  ).reverse();
  const names = await previewsById(rows.map((r) => r.sender_id).filter(Boolean) as string[]);
  return {
    access,
    messages: rows.map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_id ? (names.get(r.sender_id)?.name ?? "Former member") : "BELONG",
      mine: r.sender_id === userId,
      content: r.content,
      simulated: Boolean(r.simulated),
      createdAt: r.created_at,
    })),
  };
}

export async function markRead(userId: string, conversationId: string) {
  await assertConversationAccess(userId, conversationId);
  const db = await getDb();
  await db.run(
    "INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at",
    [conversationId, userId, now()],
  );
}

const DEMO_REPLIES = [
  "That sounds great — I'd be up for that. When suits you?",
  "Ha, yes! I was hoping you'd say something like that.",
  "Really good to hear from you. I'm fairly free at the weekend if you fancy it?",
  "I like the sound of that. Somewhere easy to get to for both of us?",
  "Honestly this is the nicest way to meet someone new. Tell me more!",
];

export async function sendMessage(userId: string, conversationId: string, contentRaw: string): Promise<void> {
  const content = contentRaw.trim();
  if (!content) throw new AppError("Write a message first.");
  if (content.length > 2000) throw new AppError("Please keep messages under 2,000 characters.");
  const access = await assertConversationAccess(userId, conversationId);
  const db = await getDb();
  const ts = now();
  await db.run("INSERT INTO messages (id, conversation_id, sender_id, content, simulated, created_at) VALUES (?, ?, ?, ?, 0, ?)", [uid(), conversationId, userId, content, ts]);
  await db.run(
    "INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES (?, ?, ?) ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at",
    [conversationId, userId, ts],
  );
  await track(null, "message_sent", { kind: access.kind });
  if (access.kind === "direct" && access.otherId) {
    // Notification carries no message content.
    await notify(access.otherId, "message", "New message", "You have a new message from a connection.", `/messages/${conversationId}`);
    const other = await db.get<{ is_demo: number }>("SELECT is_demo FROM users WHERE id = ?", [access.otherId]);
    if (other?.is_demo && process.env.BELONG_DEMO_MODE !== "false" && (await flag("demo_simulation"))) {
      const n = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?", [conversationId]);
      const topic = access.sharedTopics[0];
      const reply =
        Number(n?.n) <= 2 && topic
          ? `So glad we were introduced! I hear you're into ${topicLabel(topic)} too — how did you get started?`
          : DEMO_REPLIES[Number(n?.n ?? 0) % DEMO_REPLIES.length];
      await db.run("INSERT INTO messages (id, conversation_id, sender_id, content, simulated, created_at) VALUES (?, ?, ?, ?, 1, ?)", [
        uid(),
        conversationId,
        access.otherId,
        reply,
        new Date(Date.now() + 1000).toISOString(),
      ]);
    }
  }
}

/** Connection assistant: starters and activity ideas from what the two members share. Uses no message content. */
export async function connectionAssistant(userId: string, conversationId: string) {
  if (!(await flag("connection_assistant"))) return null;
  const access = await assertConversationAccess(userId, conversationId);
  if (access.kind !== "direct" || !access.otherId) return null;
  const db = await getDb();
  let reasons: string[] = [];
  if (access.introductionId) {
    const intro = await db.get<{ reasons: string; user_a: string }>("SELECT reasons, user_a FROM introductions WHERE id = ?", [access.introductionId]);
    if (intro) reasons = reasonTexts(json<MatchReason[]>(intro.reasons, []), intro.user_a === userId);
  }
  const other = (await previewsById([access.otherId])).get(access.otherId);
  const ai = await getAIProvider();
  const ideas = await ai.connectionIdeas({ theirFirstName: other?.name ?? "them", sharedTopics: access.sharedTopics, reasons });
  return { ...ideas, reasons, sharedTopics: access.sharedTopics, simulated: ai.simulated };
}

/* ------------------------------ Connections ------------------------------ */

export interface ConnectionView {
  id: string;
  member: MemberPreview;
  sharedTopics: string[];
  since: string;
  conversationId: string | null;
}

export async function listConnections(userId: string): Promise<ConnectionView[]> {
  const db = await getDb();
  const rows = await db.all<{ id: string; user_a: string; user_b: string; shared_topics: string; created_at: string; conv_id: string | null }>(
    "SELECT c.id, c.user_a, c.user_b, c.shared_topics, c.created_at, cv.id AS conv_id FROM connections c LEFT JOIN conversations cv ON cv.connection_id = c.id WHERE c.status = 'active' AND (c.user_a = ? OR c.user_b = ?) ORDER BY c.created_at DESC",
    [userId, userId],
  );
  const blocked = new Set(
    (
      await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId])
    ).map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)),
  );
  const previews = await previewsById(rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a)));
  const out: ConnectionView[] = [];
  for (const r of rows) {
    const otherId = r.user_a === userId ? r.user_b : r.user_a;
    const member = previews.get(otherId);
    if (!member || blocked.has(otherId)) continue;
    out.push({ id: r.id, member, sharedTopics: json<string[]>(r.shared_topics, []), since: r.created_at, conversationId: r.conv_id });
  }
  return out;
}

export async function endConnection(userId: string, connectionId: string) {
  const db = await getDb();
  const c = await db.get<{ user_a: string; user_b: string }>("SELECT user_a, user_b FROM connections WHERE id = ?", [connectionId]);
  if (!c || (c.user_a !== userId && c.user_b !== userId)) throw forbidden();
  await db.run("UPDATE connections SET status = 'ended' WHERE id = ?", [connectionId]);
}
