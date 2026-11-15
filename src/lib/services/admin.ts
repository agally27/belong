import { getDb, json, now, pageOf, pageParams, type Paged } from "../db";
import { DEFAULT_WEIGHTS, type MatchWeights } from "../matching/engine";
import { AppError, audit, forbidden, notFound, notify } from "./core";
import { runNetwork } from "./network";
import { signalTopicLabel } from "./signals";

/**
 * Administration. Every function takes the acting admin's id and re-checks
 * their role server-side. By design there is NO function here that returns
 * companion conversations, memories or private messages.
 */
export async function assertAdmin(actorId: string) {
  const db = await getDb();
  const row = await db.get<{ role: string; status: string }>("SELECT role, status FROM users WHERE id = ?", [actorId]);
  if (!row || row.role !== "admin" || row.status !== "active") throw forbidden("Administrator access is required.");
}

const count = async (sql: string, params: (string | number)[] = []) => {
  const db = await getDb();
  return Number((await db.get<{ n: number }>(sql, params))?.n ?? 0);
};

export async function overview(actorId: string) {
  await assertAdmin(actorId);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  return {
    members: await count("SELECT COUNT(*) AS n FROM users WHERE role = 'member'"),
    demoMembers: await count("SELECT COUNT(*) AS n FROM users WHERE is_demo = 1"),
    activeThisWeek: await count("SELECT COUNT(*) AS n FROM users WHERE last_active_at >= ?", [weekAgo]),
    onboarded: await count("SELECT COUNT(*) AS n FROM users WHERE onboarded_at IS NOT NULL AND role = 'member'"),
    activeSignals: await count("SELECT COUNT(*) AS n FROM signals WHERE status = 'active'"),
    liveSignals: await count("SELECT COUNT(*) AS n FROM signals WHERE status = 'active' AND temporary = 1"),
    suggestions: await count("SELECT COUNT(*) AS n FROM matches WHERE status = 'suggested'"),
    pendingIntros: await count("SELECT COUNT(*) AS n FROM introductions WHERE status = 'pending'"),
    connections: await count("SELECT COUNT(*) AS n FROM connections WHERE status = 'active'"),
    circles: await count("SELECT COUNT(*) AS n FROM circles WHERE status = 'open'"),
    openReports: await count("SELECT COUNT(*) AS n FROM reports WHERE status IN ('open', 'reviewing')"),
    paidMembers: await count("SELECT COUNT(*) AS n FROM subscriptions WHERE plan_id != 'free' AND status = 'active'"),
    openTickets: await count("SELECT COUNT(*) AS n FROM support_tickets WHERE status = 'open'"),
  };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  isDemo: boolean;
  area: string | null;
  plan: string;
  companion: string | null;
  companionMessages: number;
  memories: number;
  signals: number;
  connections: number;
  onboarded: boolean;
  createdAt: string;
  lastActiveAt: string | null;
}

export async function listUsers(actorId: string, q = "", page = 1): Promise<Paged<AdminUser>> {
  await assertAdmin(actorId);
  const db = await getDb();
  const like = `%${q.trim().toLowerCase()}%`;
  const rows = await db.all<Record<string, string | number | null>>(
    `SELECT u.id, u.email, u.role, u.status, u.is_demo, u.created_at, u.last_active_at, u.onboarded_at,
            p.display_name, p.area, c.name AS companion, COALESCE(s.plan_id, 'free') AS plan,
            (SELECT COUNT(*) FROM companion_messages m WHERE m.user_id = u.id) AS companion_messages,
            (SELECT COUNT(*) FROM memories m WHERE m.user_id = u.id AND m.status = 'active') AS memories,
            (SELECT COUNT(*) FROM signals g WHERE g.user_id = u.id AND g.status = 'active') AS signals,
            (SELECT COUNT(*) FROM connections x WHERE x.status = 'active' AND (x.user_a = u.id OR x.user_b = u.id)) AS connections
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     LEFT JOIN companions c ON c.user_id = u.id
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE LOWER(u.email) LIKE ? OR LOWER(COALESCE(p.display_name, '')) LIKE ?
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [like, like, ...pageParams(page)],
  );
  return pageOf(rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: String(r.display_name ?? "—"),
    role: String(r.role),
    status: String(r.status),
    isDemo: Boolean(r.is_demo),
    area: r.area as string | null,
    plan: String(r.plan),
    companion: r.companion as string | null,
    companionMessages: Number(r.companion_messages),
    memories: Number(r.memories),
    signals: Number(r.signals),
    connections: Number(r.connections),
    onboarded: Boolean(r.onboarded_at),
    createdAt: String(r.created_at),
    lastActiveAt: r.last_active_at as string | null,
  })), page);
}

export async function setUserStatus(actorId: string, userId: string, status: "active" | "suspended") {
  await assertAdmin(actorId);
  if (actorId === userId) throw new AppError("You can't change your own status.");
  const db = await getDb();
  const u = await db.get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!u) throw notFound();
  await db.run("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
  if (status === "suspended") await db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  await audit(actorId, `admin.user_${status}`, "user", userId);
  await runNetwork({ forUserId: userId, actorId, quiet: true });
}

export async function setUserRole(actorId: string, userId: string, role: "member" | "admin") {
  await assertAdmin(actorId);
  if (actorId === userId) throw new AppError("You can't change your own role.");
  const db = await getDb();
  await db.run("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  await audit(actorId, "admin.user_role", "user", userId, { role });
}

export async function setUserPlan(actorId: string, userId: string, planId: string) {
  await assertAdmin(actorId);
  const { applyPlan } = await import("./subscriptions");
  await applyPlan(userId, planId, "admin", null);
  await audit(actorId, "admin.user_plan", "user", userId, { planId });
}

/** Signals are the network-visible layer, so administrators may inspect them (never their sources). */
export async function listSignalsAdmin(actorId: string, page = 1) {
  await assertAdmin(actorId);
  const db = await getDb();
  const rows = await db.all<{ id: string; kind: string; topic: string; temporary: number; expires_at: string | null; status: string; created_at: string; display_name: string; source_type: string }>(
    "SELECT s.id, s.kind, s.topic, s.temporary, s.expires_at, s.status, s.created_at, s.source_type, p.display_name FROM signals s JOIN profiles p ON p.user_id = s.user_id ORDER BY s.created_at DESC LIMIT ? OFFSET ?",
    pageParams(page),
  );
  const byTopic = await db.all<{ topic: string; n: number }>("SELECT topic, COUNT(*) AS n FROM signals WHERE status = 'active' GROUP BY topic ORDER BY COUNT(*) DESC, topic LIMIT 12");
  const byKind = await db.all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM signals WHERE status = 'active' GROUP BY kind ORDER BY COUNT(*) DESC");
  return {
    signals: pageOf(
      rows.map((r) => ({ id: r.id, member: r.display_name, kind: r.kind, label: signalTopicLabel(r.topic), temporary: Boolean(r.temporary), expiresAt: r.expires_at, status: r.status, source: r.source_type, createdAt: r.created_at })),
      page,
    ),
    byTopic: byTopic.map((r) => ({ label: signalTopicLabel(r.topic), n: Number(r.n) })),
    byKind: byKind.map((r) => ({ label: r.kind, n: Number(r.n) })),
  };
}

export async function listMatchesAdmin(actorId: string, page = 1) {
  await assertAdmin(actorId);
  const db = await getDb();
  const rows = await db.all<{ id: string; score: number; dimensions: string; reasons: string; status: string; updated_at: string; a: string; b: string }>(
    "SELECT m.id, m.score, m.dimensions, m.reasons, m.status, m.updated_at, pa.display_name AS a, pb.display_name AS b FROM matches m JOIN profiles pa ON pa.user_id = m.user_a JOIN profiles pb ON pb.user_id = m.user_b ORDER BY m.score DESC, m.id LIMIT ? OFFSET ?",
    pageParams(page),
  );
  return pageOf(rows.map((r) => ({
    id: r.id,
    a: r.a,
    b: r.b,
    score: Number(r.score),
    status: r.status,
    dimensions: json(r.dimensions, { shared: 0, moments: 0, complementary: 0 }),
    topReason: json<{ text: string }[]>(r.reasons, [])[0]?.text ?? "",
    updatedAt: r.updated_at,
  })), page);
}

export async function getWeightsAdmin(actorId: string): Promise<MatchWeights> {
  await assertAdmin(actorId);
  const { getWeights } = await import("./core");
  return getWeights();
}

export async function setWeights(actorId: string, w: MatchWeights) {
  await assertAdmin(actorId);
  const ok = [w.shared, w.moments, w.complementary].every((x) => Number.isFinite(x) && x >= 0 && x <= 1) && Number.isFinite(w.threshold) && w.threshold >= 0 && w.threshold <= 100;
  if (!ok || w.shared + w.moments + w.complementary <= 0) throw new AppError("Weights must be between 0 and 1, and the threshold between 0 and 100.");
  if (Object.values(w.factors ?? {}).some((x) => !Number.isFinite(x) || x < 0 || x > 2)) throw new AppError("Factor strengths must be between 0 (off) and 2 (double).");
  const db = await getDb();
  await db.run(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('matching_weights', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [JSON.stringify({ ...DEFAULT_WEIGHTS, ...w, factors: { ...DEFAULT_WEIGHTS.factors, ...(w.factors ?? {}) } }), now()],
  );
  await audit(actorId, "admin.weights_updated", "settings", "matching_weights", { ...w });
}

export async function runNetworkAdmin(actorId: string) {
  await assertAdmin(actorId);
  return runNetwork({ actorId });
}

export async function listIntroductionsAdmin(actorId: string, page = 1) {
  await assertAdmin(actorId);
  const db = await getDb();
  const rows = await db.all<{ id: string; a: string; b: string; a_decision: string; b_decision: string; status: string; created_at: string; decided_at: string | null }>(
    "SELECT i.id, pa.display_name AS a, pb.display_name AS b, i.a_decision, i.b_decision, i.status, i.created_at, i.decided_at FROM introductions i JOIN profiles pa ON pa.user_id = i.user_a JOIN profiles pb ON pb.user_id = i.user_b ORDER BY i.created_at DESC, i.id LIMIT ? OFFSET ?",
    pageParams(page),
  );
  return pageOf(rows, page);
}

/** Counts by outcome across all introductions (not just the current page). */
export async function introductionStats(actorId: string): Promise<Record<string, number>> {
  await assertAdmin(actorId);
  const db = await getDb();
  const rows = await db.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM introductions GROUP BY status");
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

export async function listCirclesAdmin(actorId: string) {
  await assertAdmin(actorId);
  const db = await getDb();
  return db.all<{ id: string; name: string; topic: string; area: string | null; capacity: number; status: string; created_at: string; members: number }>(
    "SELECT c.id, c.name, c.topic, c.area, c.capacity, c.status, c.created_at, (SELECT COUNT(*) FROM circle_members m WHERE m.circle_id = c.id) AS members FROM circles c ORDER BY c.created_at DESC",
  );
}

export async function setCircleStatus(actorId: string, circleId: string, status: "open" | "closed") {
  await assertAdmin(actorId);
  const db = await getDb();
  await db.run("UPDATE circles SET status = ? WHERE id = ?", [status, circleId]);
  await audit(actorId, `admin.circle_${status}`, "circle", circleId);
}

export async function listReports(actorId: string) {
  await assertAdmin(actorId);
  const db = await getDb();
  return db.all<{
    id: string;
    reason: string;
    detail: string | null;
    context_type: string;
    status: string;
    resolution: string | null;
    created_at: string;
    resolved_at: string | null;
    reported_user_id: string;
    reported: string | null;
    reported_status: string | null;
    reporter: string | null;
    prior: number;
  }>(
    `SELECT r.id, r.reason, r.detail, r.context_type, r.status, r.resolution, r.created_at, r.resolved_at, r.reported_user_id,
            pt.display_name AS reported, ut.status AS reported_status, pr.display_name AS reporter,
            (SELECT COUNT(*) FROM reports r2 WHERE r2.reported_user_id = r.reported_user_id) AS prior
     FROM reports r
     LEFT JOIN profiles pt ON pt.user_id = r.reported_user_id
     LEFT JOIN users ut ON ut.id = r.reported_user_id
     LEFT JOIN profiles pr ON pr.user_id = r.reporter_id
     ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at DESC`,
  );
}

export async function resolveReport(actorId: string, reportId: string, action: "reviewing" | "dismiss" | "warn" | "suspend", note = "") {
  await assertAdmin(actorId);
  const db = await getDb();
  const report = await db.get<{ id: string; reported_user_id: string; reporter_id: string | null }>("SELECT id, reported_user_id, reporter_id FROM reports WHERE id = ?", [reportId]);
  if (!report) throw notFound();
  if (action === "reviewing") {
    await db.run("UPDATE reports SET status = 'reviewing' WHERE id = ?", [reportId]);
  } else {
    const resolution = { dismiss: "No action needed", warn: "Member warned", suspend: "Member suspended" }[action] + (note.trim() ? ` — ${note.trim().slice(0, 300)}` : "");
    await db.run("UPDATE reports SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?", [action === "dismiss" ? "dismissed" : "resolved", resolution, actorId, now(), reportId]);
    if (action === "warn") {
      await notify(report.reported_user_id, "safety", "A reminder about our community guidelines", "Someone let us know about an interaction that didn't feel right. Please take a moment to re-read the guidelines.", "/help");
    }
    if (action === "suspend") await setUserStatus(actorId, report.reported_user_id, "suspended");
    if (report.reporter_id) {
      await notify(report.reporter_id, "safety", "Thank you for your report", "Our team has reviewed it and taken appropriate action. We can't share details, but it made a difference.", "/help");
    }
  }
  await audit(actorId, `admin.report_${action}`, "report", reportId);
}

export async function listFlags(actorId: string) {
  await assertAdmin(actorId);
  const db = await getDb();
  return db.all<{ key: string; description: string; enabled: number; updated_at: string }>("SELECT * FROM feature_flags ORDER BY key");
}

export async function setFlag(actorId: string, key: string, enabled: boolean) {
  await assertAdmin(actorId);
  const db = await getDb();
  const row = await db.get("SELECT key FROM feature_flags WHERE key = ?", [key]);
  if (!row) throw notFound("Unknown flag.");
  await db.run("UPDATE feature_flags SET enabled = ?, updated_at = ? WHERE key = ?", [enabled ? 1 : 0, now(), key]);
  await audit(actorId, "admin.flag_set", "flag", key, { enabled });
}

export async function subscriptionSummary(actorId: string) {
  await assertAdmin(actorId);
  const db = await getDb();
  const rows = await db.all<{ plan_id: string; n: number }>("SELECT plan_id, COUNT(*) AS n FROM subscriptions WHERE status = 'active' GROUP BY plan_id");
  const plans = await db.all<{ id: string; name: string; price_pence: number }>("SELECT id, name, price_pence FROM plans ORDER BY sort");
  const by = new Map(rows.map((r) => [r.plan_id, Number(r.n)]));
  const tiers = plans.map((p) => ({ id: p.id, name: p.name, members: by.get(p.id) ?? 0, mrrPence: (by.get(p.id) ?? 0) * Number(p.price_pence) }));
  return { tiers, mrrPence: tiers.reduce((s, t) => s + t.mrrPence, 0) };
}

export async function listAudit(actorId: string, page = 1) {
  await assertAdmin(actorId);
  const db = await getDb();
  const rows = await db.all<{ id: string; actor: string | null; action: string; target_type: string | null; target_id: string | null; meta: string; created_at: string }>(
    "SELECT a.id, p.display_name AS actor, a.action, a.target_type, a.target_id, a.meta, a.created_at FROM audit_log a LEFT JOIN profiles p ON p.user_id = a.actor_id ORDER BY a.created_at DESC, a.id LIMIT ? OFFSET ?",
    pageParams(page),
  );
  return pageOf(rows, page);
}

export async function listTickets(actorId: string) {
  await assertAdmin(actorId);
  const db = await getDb();
  return db.all<{ id: string; subject: string; body: string; status: string; created_at: string; member: string | null }>(
    "SELECT t.id, t.subject, t.body, t.status, t.created_at, p.display_name AS member FROM support_tickets t LEFT JOIN profiles p ON p.user_id = t.user_id ORDER BY t.created_at DESC LIMIT 100",
  );
}

export async function closeTicket(actorId: string, id: string) {
  await assertAdmin(actorId);
  const db = await getDb();
  await db.run("UPDATE support_tickets SET status = 'closed' WHERE id = ?", [id]);
}

/** Daily series for the analytics dashboard (aggregates only). */
export async function analytics(actorId: string, days = 14) {
  await assertAdmin(actorId);
  const db = await getDb();
  const since = new Date(Date.now() - (days - 1) * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();
  const labels = Array.from({ length: days }, (_, i) => new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10));
  const series = async (sql: string) => {
    const rows = await db.all<{ ts: string }>(sql, [sinceIso]);
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.ts.slice(0, 10), (m.get(r.ts.slice(0, 10)) ?? 0) + 1);
    return labels.map((d) => ({ day: d, n: m.get(d) ?? 0 }));
  };
  const intros = await db.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM introductions GROUP BY status");
  const introBy = new Map(intros.map((r) => [r.status, Number(r.n)]));
  const decided = (introBy.get("connected") ?? 0) + (introBy.get("declined") ?? 0);
  const members = await count("SELECT COUNT(*) AS n FROM users WHERE role = 'member'");
  const funnel = [
    { label: "Joined", n: members },
    { label: "Onboarded", n: await count("SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND onboarded_at IS NOT NULL") },
    { label: "Sharing signals", n: await count("SELECT COUNT(DISTINCT user_id) AS n FROM signals WHERE status = 'active'") },
    { label: "Suggested a match", n: await count("SELECT COUNT(*) AS n FROM users u WHERE u.role = 'member' AND EXISTS (SELECT 1 FROM matches m WHERE m.user_a = u.id OR m.user_b = u.id)") },
    { label: "In an introduction", n: await count("SELECT COUNT(*) AS n FROM users u WHERE u.role = 'member' AND EXISTS (SELECT 1 FROM introductions i WHERE i.user_a = u.id OR i.user_b = u.id)") },
    { label: "Connected", n: await count("SELECT COUNT(*) AS n FROM users u WHERE u.role = 'member' AND EXISTS (SELECT 1 FROM connections c WHERE c.status = 'active' AND (c.user_a = u.id OR c.user_b = u.id))") },
  ];
  return {
    labels,
    signups: await series("SELECT created_at AS ts FROM users WHERE created_at >= ?"),
    connections: await series("SELECT created_at AS ts FROM connections WHERE created_at >= ?"),
    messages: await series("SELECT created_at AS ts FROM messages WHERE created_at >= ?"),
    companionMessages: await series("SELECT created_at AS ts FROM companion_messages WHERE role = 'member' AND created_at >= ?"),
    introApprovalRate: decided ? Math.round(((introBy.get("connected") ?? 0) / decided) * 100) : null,
    introsByStatus: [...introBy.entries()].map(([label, n]) => ({ label, n })),
    funnel,
  };
}

export async function listGatheringsAdmin(actorId: string, page = 1) {
  await assertAdmin(actorId);
  const db = await getDb();
  const rows = await db.all<{ id: string; title: string; topic: string; area: string | null; slot: string; starts_at: string; status: string; created_at: string; invited: number; accepted: number; declined: number; circle_id: string | null }>(
    `SELECT g.id, g.title, g.topic, g.area, g.slot, g.starts_at, g.status, g.created_at, g.circle_id,
            (SELECT COUNT(*) FROM gathering_invites i WHERE i.gathering_id = g.id) AS invited,
            (SELECT COUNT(*) FROM gathering_invites i WHERE i.gathering_id = g.id AND i.status = 'accepted') AS accepted,
            (SELECT COUNT(*) FROM gathering_invites i WHERE i.gathering_id = g.id AND i.status = 'declined') AS declined
     FROM gatherings g ORDER BY g.created_at DESC, g.id LIMIT ? OFFSET ?`,
    pageParams(page),
  );
  return pageOf(rows, page);
}

/** Counts by status across all gatherings, and how many became Circles. */
export async function gatheringStats(actorId: string) {
  await assertAdmin(actorId);
  const db = await getDb();
  const rows = await db.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM gatherings GROUP BY status");
  const circles = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM gatherings WHERE circle_id IS NOT NULL");
  return { byStatus: Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>, becameCircles: Number(circles?.n ?? 0) };
}

export async function cancelGatheringAdmin(actorId: string, gatheringId: string) {
  await assertAdmin(actorId);
  const db = await getDb();
  const g = await db.get<{ title: string; status: string }>("SELECT title, status FROM gatherings WHERE id = ?", [gatheringId]);
  if (!g) throw notFound();
  if (!["proposed", "confirmed"].includes(g.status)) throw new AppError("Only upcoming gatherings can be cancelled.");
  await db.run("UPDATE gatherings SET status = 'cancelled' WHERE id = ?", [gatheringId]);
  const people = await db.all<{ user_id: string }>("SELECT user_id FROM gathering_invites WHERE gathering_id = ? AND status != 'declined'", [gatheringId]);
  for (const p of people) await notify(p.user_id, "gathering", `Cancelled: ${g.title}`, "This get-together has been cancelled by the BELONG team. Sorry for the change of plan.", "/gatherings");
  await audit(actorId, "admin.gathering_cancelled", "gathering", gatheringId);
}

/**
 * Removals by Circle hosts, newest first, with how often each person has been
 * removed and how often each host has removed someone — so moderators can spot
 * patterns in either direction.
 */
export async function listCircleRemovals(actorId: string, limit = 50) {
  await assertAdmin(actorId);
  const db = await getDb();
  return db.all<{ circle: string; removed_id: string; removed: string | null; host: string | null; created_at: string; times_removed: number; host_removals: number }>(
    `SELECT c.name AS circle, r.user_id AS removed_id, pr.display_name AS removed, ph.display_name AS host, r.created_at,
            (SELECT COUNT(*) FROM circle_removals x WHERE x.user_id = r.user_id) AS times_removed,
            (SELECT COUNT(*) FROM circle_removals y WHERE y.removed_by = r.removed_by) AS host_removals
     FROM circle_removals r
     JOIN circles c ON c.id = r.circle_id
     LEFT JOIN profiles pr ON pr.user_id = r.user_id
     LEFT JOIN profiles ph ON ph.user_id = r.removed_by
     ORDER BY r.created_at DESC LIMIT ?`,
    [limit],
  );
}
