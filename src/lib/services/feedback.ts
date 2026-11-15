import { getDb, json, now, uid } from "../db";
import type { LearnedPreferences } from "../matching/engine";
import { topicLabel } from "../matching/topics";
import { AppError, audit, forbidden } from "./core";
import { previewsById, type MemberPreview } from "./members";

/**
 * Private "How did it go?" feedback, and learning from members' own responses.
 *
 * - Feedback is visible only to the member who gave it. The other person is
 *   never told, and administrators see aggregate counts only.
 * - Both are turned into small, bounded preferences that tune that member's
 *   own future suggestions (see LearnedPreferences in the engine).
 */
export type Met = "yes" | "not_yet" | "no";
export type Rating = "great" | "ok" | "not_for_me";
type Subject = "connection" | "gathering";

const ASK_AFTER_DAYS = 3;
const ASK_AGAIN_DAYS = 7;
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

export interface FeedbackPrompt {
  subjectType: Subject;
  subjectId: string;
  title: string;
  member: MemberPreview | null;
  askedBefore: boolean;
}

/** Connections and gatherings the member could tell us about. At most a few at a time. */
export async function pendingFeedback(userId: string, limit = 2): Promise<FeedbackPrompt[]> {
  const db = await getDb();
  const given = new Map(
    (await db.all<{ subject_type: string; subject_id: string; met: string; updated_at: string }>("SELECT subject_type, subject_id, met, updated_at FROM meeting_feedback WHERE user_id = ?", [userId])).map((f) => [
      `${f.subject_type}|${f.subject_id}`,
      f,
    ]),
  );
  const due = (type: Subject, id: string) => {
    const f = given.get(`${type}|${id}`);
    return !f || (f.met === "not_yet" && f.updated_at <= daysAgo(ASK_AGAIN_DAYS));
  };
  const out: FeedbackPrompt[] = [];
  const conns = await db.all<{ id: string; user_a: string; user_b: string }>(
    "SELECT id, user_a, user_b FROM connections WHERE status = 'active' AND (user_a = ? OR user_b = ?) AND created_at <= ? ORDER BY created_at",
    [userId, userId, daysAgo(ASK_AFTER_DAYS)],
  );
  const previews = await previewsById(conns.map((c) => (c.user_a === userId ? c.user_b : c.user_a)));
  for (const c of conns) {
    if (!due("connection", c.id)) continue;
    const member = previews.get(c.user_a === userId ? c.user_b : c.user_a);
    if (member) out.push({ subjectType: "connection", subjectId: c.id, title: member.name, member, askedBefore: given.has(`connection|${c.id}`) });
  }
  const gatherings = await db.all<{ id: string; title: string }>(
    "SELECT g.id, g.title FROM gatherings g JOIN gathering_invites i ON i.gathering_id = g.id WHERE i.user_id = ? AND i.status = 'accepted' AND g.status IN ('confirmed', 'completed') AND g.starts_at <= ? ORDER BY g.starts_at",
    [userId, now()],
  );
  for (const g of gatherings) if (due("gathering", g.id)) out.push({ subjectType: "gathering", subjectId: g.id, title: g.title, member: null, askedBefore: given.has(`gathering|${g.id}`) });
  return out.slice(0, limit);
}

export async function giveFeedback(userId: string, subjectType: Subject, subjectId: string, met: Met, rating: Rating | null) {
  if (!["connection", "gathering"].includes(subjectType)) throw new AppError("Unknown feedback type.");
  if (!["yes", "not_yet", "no"].includes(met)) throw new AppError("Please choose an answer.");
  if (met === "yes" && !["great", "ok", "not_for_me"].includes(rating ?? "")) throw new AppError("Please say how it went.");
  const db = await getDb();
  // Only people who were actually part of it can say how it went.
  const ok =
    subjectType === "connection"
      ? await db.get("SELECT 1 AS x FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)", [subjectId, userId, userId])
      : await db.get("SELECT 1 AS x FROM gathering_invites WHERE gathering_id = ? AND user_id = ? AND status = 'accepted'", [subjectId, userId]);
  if (!ok) throw forbidden("You can only give feedback on your own connections and get-togethers.");
  const ts = now();
  await db.run(
    `INSERT INTO meeting_feedback (id, user_id, subject_type, subject_id, met, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, subject_type, subject_id) DO UPDATE SET met = excluded.met, rating = excluded.rating, updated_at = excluded.updated_at`,
    [uid(), userId, subjectType, subjectId, met, met === "yes" ? rating : null, ts, ts],
  );
  await audit(userId, "feedback.given", subjectType, subjectId);
}

/** Bayesian-shrunk lean in -1…1: needs several data points before it means much. */
const lean = (score: number, n: number, prior: number) => Math.max(-1, Math.min(1, score / (n + prior)));

/** Learned preferences for every member who has enough history. Used by the network run only. */
export async function learnedPreferences(): Promise<Map<string, LearnedPreferences>> {
  const db = await getDb();
  const out = new Map<string, LearnedPreferences>();
  const bump = (acc: Map<string, Map<string, [number, number]>>, user: string, key: string, value: number) => {
    if (!acc.has(user)) acc.set(user, new Map());
    const m = acc.get(user)!;
    const [s, n] = m.get(key) ?? [0, 0];
    m.set(key, [s + value, n + 1]);
  };

  // 1. History: asking for / approving an introduction is a yes; dismissing or declining is a no.
  const hist = new Map<string, Map<string, [number, number]>>();
  const matches = await db.all<{ id: string; user_a: string; user_b: string; a_state: string; b_state: string; reasons: string }>(
    "SELECT id, user_a, user_b, a_state, b_state, reasons FROM matches",
  );
  const intros = await db.all<{ match_id: string; user_a: string; a_decision: string; b_decision: string }>("SELECT match_id, user_a, a_decision, b_decision FROM introductions WHERE match_id IS NOT NULL");
  const decision = new Map<string, { a: string; b: string }>();
  for (const i of intros) decision.set(i.match_id, { a: i.a_decision, b: i.b_decision });
  for (const m of matches) {
    const reasons = json<{ dimension: string; topics: string[] }[]>(m.reasons, []).filter((r) => r.dimension !== "context");
    const keys = [...new Set([...reasons.flatMap((r) => r.topics.filter((t) => !t.includes(":"))), ...reasons.map((r) => `dim:${r.dimension}`)])];
    const d = decision.get(m.id);
    for (const [user, state, dec] of [
      [m.user_a, m.a_state, d?.a],
      [m.user_b, m.b_state, d?.b],
    ] as const) {
      const v = dec === "approved" ? 1 : state === "dismissed" || dec === "declined" ? -1 : 0;
      if (v) for (const k of keys) bump(hist, user, k, v);
    }
  }

  // 2. Feedback after meeting: great +1, ok 0, not for me -1, on that connection's or gathering's topics.
  const fb = new Map<string, Map<string, [number, number]>>();
  const rows = await db.all<{ user_id: string; subject_type: string; rating: string; topics: string | null; topic: string | null }>(
    `SELECT f.user_id, f.subject_type, f.rating, c.shared_topics AS topics, g.topic
     FROM meeting_feedback f
     LEFT JOIN connections c ON f.subject_type = 'connection' AND c.id = f.subject_id
     LEFT JOIN gatherings g ON f.subject_type = 'gathering' AND g.id = f.subject_id
     WHERE f.met = 'yes' AND f.rating IS NOT NULL`,
  );
  for (const r of rows) {
    const v = r.rating === "great" ? 1 : r.rating === "not_for_me" ? -1 : 0;
    const topics = r.subject_type === "gathering" ? (r.topic ? [r.topic] : []) : json<string[]>(r.topics, []);
    for (const t of topics) bump(fb, r.user_id, t, v);
  }

  for (const [src, field, prior] of [
    [hist, "history", 3],
    [fb, "feedback", 2],
  ] as const) {
    for (const [user, m] of src) {
      const rec: Record<string, number> = {};
      for (const [k, [s, n]] of m) rec[k] = Math.round(lean(s, n, prior) * 100) / 100;
      out.set(user, { ...(out.get(user) ?? {}), [field]: rec });
    }
  }
  return out;
}

/** What a member's own feedback and responses have taught their companion — shown only to them. */
export async function myLearning(userId: string): Promise<{ likes: string[]; lessLikely: string[]; given: number }> {
  const prefs = (await learnedPreferences()).get(userId) ?? {};
  const combined = new Map<string, number>();
  for (const rec of [prefs.history ?? {}, prefs.feedback ?? {}]) for (const [k, v] of Object.entries(rec)) if (!k.startsWith("dim:")) combined.set(k, (combined.get(k) ?? 0) + v);
  const sorted = [...combined.entries()].sort((a, b) => b[1] - a[1]);
  const db = await getDb();
  const given = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM meeting_feedback WHERE user_id = ?", [userId]);
  return {
    likes: sorted.filter(([, v]) => v >= 0.2).slice(0, 4).map(([k]) => topicLabel(k)),
    lessLikely: sorted.filter(([, v]) => v <= -0.2).slice(-3).map(([k]) => topicLabel(k)),
    given: Number(given?.n ?? 0),
  };
}

/** Admin: aggregates only. */
export async function feedbackSummary() {
  const db = await getDb();
  const rows = await db.all<{ met: string; rating: string | null; n: number }>("SELECT met, rating, COUNT(*) AS n FROM meeting_feedback GROUP BY met, rating");
  const count = (met: string, rating?: string) => rows.filter((r) => r.met === met && (rating === undefined || r.rating === rating)).reduce((s, r) => s + Number(r.n), 0);
  return { met: count("yes"), great: count("yes", "great"), ok: count("yes", "ok"), notForMe: count("yes", "not_for_me"), notYet: count("not_yet"), didNotMeet: count("no") };
}

const IGNORED_AFTER_DAYS = 7;

/**
 * How likely each member is to say yes when someone asks to be introduced, 0…1.
 * Counts only introductions they were ASKED about: approved = yes; declined, or
 * left unanswered for over a week = no. Starts at 0.5 and moves slowly
 * (Laplace smoothing), so new members are neither helped nor penalised.
 * Deliberately measures responsiveness, not how often others choose them.
 */
export async function likelyYes(): Promise<Map<string, number>> {
  const db = await getDb();
  const cutoff = daysAgo(IGNORED_AFTER_DAYS);
  const rows = await db.all<{ user_a: string; user_b: string; requested_by: string; a_decision: string; b_decision: string; status: string; created_at: string }>(
    "SELECT user_a, user_b, requested_by, a_decision, b_decision, status, created_at FROM introductions WHERE status != 'withdrawn'",
  );
  const tally = new Map<string, [number, number]>();
  for (const r of rows) {
    const askedA = r.requested_by !== r.user_a;
    const who = askedA ? r.user_a : r.user_b;
    const decision = askedA ? r.a_decision : r.b_decision;
    const yes = decision === "approved" ? 1 : 0;
    const counted = decision !== "pending" || (r.status === "pending" && r.created_at <= cutoff);
    if (!counted) continue;
    const [y, n] = tally.get(who) ?? [0, 0];
    tally.set(who, [y + yes, n + 1]);
  }
  const out = new Map<string, number>();
  for (const [u, [y, n]] of tally) out.set(u, Math.round(((y + 1) / (n + 2)) * 100) / 100);
  return out;
}
