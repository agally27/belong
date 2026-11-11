import { getDb, now, uid } from "../db";
import { topicLabel } from "../matching/topics";
import { AppError, audit, flag, getConsents } from "./core";
import { verifyPassword } from "./auth";
import { listCircles } from "./circles";
import { listConnections } from "./messaging";
import { getLimits } from "./subscriptions";

/* ------------------------------ Notifications ----------------------------- */

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function listNotifications(userId: string, limit = 60): Promise<Notification[]> {
  const db = await getDb();
  const rows = await db.all<{ id: string; type: string; title: string; body: string; href: string | null; read_at: string | null; created_at: string }>(
    "SELECT id, type, title, body, href, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit],
  );
  return rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, href: r.href, readAt: r.read_at, createdAt: r.created_at }));
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", [userId]);
  return Number(row?.n ?? 0);
}

export async function markNotificationRead(userId: string, id: string) {
  const db = await getDb();
  await db.run("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL", [now(), id, userId]);
}

export async function markAllNotificationsRead(userId: string) {
  const db = await getDb();
  await db.run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", [now(), userId]);
}

/* ----------------------------- Connection Graph --------------------------- */

export interface GraphNode {
  id: string;
  kind: "me" | "person" | "circle";
  label: string;
  hue: number;
  href: string | null;
  isDemo: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  insights: string[] | null;
  topTopics: { topic: string; label: string; count: number }[];
}

/** The member's own constellation: themselves, their connections and their circles. Nobody else's graph is ever exposed. */
export async function getGraph(userId: string): Promise<GraphView | null> {
  if (!(await flag("connection_graph"))) return null;
  const db = await getDb();
  const me = await db.get<{ display_name: string; hue: number }>("SELECT display_name, hue FROM profiles WHERE user_id = ?", [userId]);
  const connections = await listConnections(userId);
  const circles = (await listCircles(userId)).mine;
  const nodes: GraphNode[] = [{ id: "me", kind: "me", label: "You", hue: Number(me?.hue ?? 260), href: "/profile", isDemo: false }];
  const edges: GraphEdge[] = [];
  const counts = new Map<string, number>();
  for (const c of connections) {
    nodes.push({ id: c.member.id, kind: "person", label: c.member.name, hue: c.member.hue, href: c.conversationId ? `/messages/${c.conversationId}` : null, isDemo: c.member.isDemo });
    edges.push({ from: "me", to: c.member.id, label: c.sharedTopics.slice(0, 2).map(topicLabel).join(" · ") });
    for (const t of c.sharedTopics) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const connectedIds = new Set(connections.map((c) => c.member.id));
  for (const c of circles) {
    const nodeId = `circle:${c.id}`;
    nodes.push({ id: nodeId, kind: "circle", label: c.name, hue: 150, href: `/circles/${c.id}`, isDemo: false });
    edges.push({ from: "me", to: nodeId, label: c.topicLabel });
    counts.set(c.topic, (counts.get(c.topic) ?? 0) + 1);
    // Link connections who share this circle with me.
    const members = await db.all<{ user_id: string }>("SELECT user_id FROM circle_members WHERE circle_id = ?", [c.id]);
    for (const m of members) if (connectedIds.has(m.user_id)) edges.push({ from: m.user_id, to: nodeId, label: "" });
  }
  const topTopics = [...counts.entries()]
    .map(([topic, count]) => ({ topic, label: topicLabel(topic), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  let insights: string[] | null = null;
  if ((await getLimits(userId)).graphInsights) {
    insights = [];
    if (topTopics[0]) insights.push(`${topTopics[0].label[0].toUpperCase()}${topTopics[0].label.slice(1)} is the thread running through most of your connections.`);
    if (connections.length && !circles.length) insights.push("All your connections are one-to-one so far. A Circle could introduce a few of them to each other.");
    if (circles.length && connections.length < 2) insights.push("Your Circles are a natural place to turn familiar faces into friends.");
    const recent = connections.filter((c) => Date.now() - Date.parse(c.since) < 30 * 86400000).length;
    insights.push(recent ? `You've made ${recent} new connection${recent === 1 ? "" : "s"} in the last 30 days.` : "No new connections in the last 30 days — your companion can help if you'd like to change that.");
  }
  return { nodes, edges, insights, topTopics };
}

/* --------------------------- Data export & deletion ------------------------ */

/** UK GDPR Art. 15/20: everything BELONG holds about the member, in a portable format. */
export async function exportUserData(userId: string) {
  const db = await getDb();
  const one = <T>(sql: string) => db.get<T>(sql, [userId]);
  const many = <T>(sql: string, params: string[] = [userId]) => db.all<T>(sql, params);
  const account = await one<Record<string, unknown>>("SELECT id, email, role, status, created_at, onboarded_at, last_active_at FROM users WHERE id = ?");
  const data = {
    exportedAt: now(),
    format: "belong-export-v1",
    account,
    profile: await one("SELECT * FROM profiles WHERE user_id = ?"),
    companion: await one("SELECT name, tone, style, proactivity, created_at FROM companions WHERE user_id = ?"),
    consents: await getConsents(userId),
    companionConversation: await many("SELECT role, content, created_at FROM companion_messages WHERE user_id = ? ORDER BY created_at"),
    memories: await many("SELECT category, content, source, status, share_for_matching, created_at, updated_at FROM memories WHERE user_id = ?"),
    intentions: await many("SELECT title, mode, status, shared, expires_at, created_at FROM intentions WHERE user_id = ?"),
    signalsShared: await many("SELECT kind, topic, label, temporary, expires_at, status, created_at FROM signals WHERE user_id = ?"),
    introductions: await many(
      "SELECT id, status, requested_by = ? AS requested_by_me, created_at, decided_at FROM introductions WHERE user_a = ? OR user_b = ?",
      [userId, userId, userId],
    ),
    connections: await many("SELECT id, status, shared_topics, created_at FROM connections WHERE user_a = ? OR user_b = ?", [userId, userId]),
    // Only messages the member wrote themselves — other people's words are their data.
    messagesSent: await many("SELECT conversation_id, content, created_at FROM messages WHERE sender_id = ? ORDER BY created_at"),
    circles: await many("SELECT c.name, c.topic, m.role, m.joined_at FROM circle_members m JOIN circles c ON c.id = m.circle_id WHERE m.user_id = ?"),
    eventRsvps: await many("SELECT e.title, e.starts_at, r.status FROM event_rsvps r JOIN events e ON e.id = r.event_id WHERE r.user_id = ?"),
    blocks: await many("SELECT blocked_id, created_at FROM blocks WHERE blocker_id = ?"),
    reportsMade: await many("SELECT reason, detail, status, created_at FROM reports WHERE reporter_id = ?"),
    subscription: await one("SELECT plan_id, status, started_at, renews_at FROM subscriptions WHERE user_id = ?"),
    notifications: await many("SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = ?"),
    supportTickets: await many("SELECT subject, body, status, created_at FROM support_tickets WHERE user_id = ?"),
  };
  await audit(userId, "user.data_exported", "user", userId);
  return data;
}

/** UK GDPR Art. 17: permanent erasure. Cascades through every table that references the member. */
export async function deleteAccount(userId: string, password: string) {
  const db = await getDb();
  const row = await db.get<{ password_hash: string; role: string }>("SELECT password_hash, role FROM users WHERE id = ?", [userId]);
  if (!row) return;
  if (!(await verifyPassword(password, row.password_hash))) throw new AppError("That password isn't right.", "forbidden");
  if (row.role === "admin") {
    const admins = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'");
    if (Number(admins?.n) <= 1) throw new AppError("You're the only administrator. Add another before deleting this account.", "conflict");
  }
  await eraseUser(userId);
  // The audit entry keeps no personal data — only that an erasure happened.
  await audit(null, "user.erased", "user", "redacted");
}

export async function eraseUser(userId: string) {
  const db = await getDb();
  await db.tx(async () => {
    await db.run("DELETE FROM analytics_events WHERE user_id = ?", [userId]);
    await db.run("UPDATE audit_log SET actor_id = NULL WHERE actor_id = ?", [userId]);
    await db.run("UPDATE audit_log SET target_id = 'redacted' WHERE target_id = ?", [userId]);
    // Their sent messages are removed; the other person keeps their own side of the conversation.
    await db.run("DELETE FROM messages WHERE sender_id = ?", [userId]);
    await db.run("DELETE FROM users WHERE id = ?", [userId]);
    // Circles left with nobody are closed.
    await db.run("UPDATE circles SET status = 'closed' WHERE id NOT IN (SELECT DISTINCT circle_id FROM circle_members)");
  });
}

/* --------------------------------- Support -------------------------------- */

export async function createSupportTicket(userId: string, subject: string, body: string) {
  const s = subject.trim();
  const b = body.trim();
  if (s.length < 3 || b.length < 10) throw new AppError("Please add a subject and a few words about what's happening.");
  const db = await getDb();
  await db.run("INSERT INTO support_tickets (id, user_id, subject, body, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)", [uid(), userId, s.slice(0, 120), b.slice(0, 2000), now()]);
}
