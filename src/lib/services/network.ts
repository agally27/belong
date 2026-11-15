import { getDb, json, now, pair, uid } from "../db";
import { computeMatch, reasonTexts, type MatchReason } from "../matching/engine";
import { topicLabel } from "../matching/topics";
import { audit, flag, forbidden, getWeights, notify } from "./core";
import { learnedPreferences, likelyYes } from "./feedback";
import { proposeBridges, proposeGatherings, sweepGatherings } from "./gatherings";
import { previewsById, type MemberPreview } from "./members";
import { expireSignals, networkContexts, networkSignals, toMatchSignal } from "./signals";

/**
 * The BELONG agent network. Each member's companion contributes only that
 * member's approved signals; this service compares signals pair by pair and
 * records opportunities. It has no access path to memories or messages.
 */

export interface NetworkRunResult {
  membersConsidered: number;
  pairsCompared: number;
  matchesCreated: number;
  matchesUpdated: number;
  matchesRetired: number;
  signalsExpired: number;
  gatheringsProposed: number;
}

type MatchRow = {
  id: string;
  user_a: string;
  user_b: string;
  score: number;
  dimensions: string;
  reasons: string;
  a_state: string;
  b_state: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/**
 * Runs the network. With `forUserId`, only pairs involving that member are
 * recomputed (used after a member changes their signals).
 */
export async function runNetwork(opts: { forUserId?: string; actorId?: string | null; quiet?: boolean } = {}): Promise<NetworkRunResult> {
  const db = await getDb();
  const signalsExpired = await expireSignals();
  const weights = await getWeights();
  const byUser = await networkSignals();
  const liveOn = await flag("live_intelligence");
  const ids = [...byUser.keys()].sort();
  const contexts = await networkContexts();
  const learned = await learnedPreferences();
  const responsive = await likelyYes();

  // Rarity: sharing an unusual interest says more than sharing a very common one.
  const holders = new Map<string, number>();
  for (const signals of byUser.values()) for (const t of new Set(signals.map((s) => s.topic))) holders.set(t, (holders.get(t) ?? 0) + 1);
  const population = Math.max(ids.length, 1);
  const rarity = (topic: string) => {
    const share = (holders.get(topic) ?? 1) / population; // 0..1 of members hold it
    return population < 8 ? 1 : 1.35 - 0.7 * share; // ~1.3 when rare, ~0.65 when nearly everyone has it
  };

  const blocks = new Set(
    (await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks")).map((b) => pair(b.blocker_id, b.blocked_id).join("|")),
  );
  const connectionRows = await db.all<{ user_a: string; user_b: string }>("SELECT user_a, user_b FROM connections WHERE status = 'active'");
  const connected = new Set(connectionRows.map((c) => `${c.user_a}|${c.user_b}`));
  // Friends of friends, counted only where both people being matched allow it.
  const friends = new Map<string, Set<string>>();
  for (const c of connectionRows) {
    for (const [x, y] of [[c.user_a, c.user_b], [c.user_b, c.user_a]]) {
      if (!friends.has(x)) friends.set(x, new Set());
      friends.get(x)!.add(y);
    }
  }
  const mutualCount = (a: string, b: string) => {
    if (!contexts.get(a)?.mutualsOk || !contexts.get(b)?.mutualsOk) return 0;
    const fb = friends.get(b);
    let n = 0;
    for (const f of friends.get(a) ?? []) if (fb?.has(f)) n++;
    return n;
  };
  const existing = new Map(
    (await db.all<MatchRow>("SELECT * FROM matches")).map((m) => [`${m.user_a}|${m.user_b}`, m]),
  );

  const result: NetworkRunResult = { membersConsidered: ids.length, pairsCompared: 0, matchesCreated: 0, matchesUpdated: 0, matchesRetired: 0, signalsExpired, gatheringsProposed: 0 };
  const seen = new Set<string>();
  const ts = now();
  const fresh = new Map<string, string[]>(); // member -> topics of their new suggestions

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (opts.forUserId && a !== opts.forUserId && b !== opts.forUserId) continue;
      const key = `${a}|${b}`;
      seen.add(key);
      if (blocks.has(key) || connected.has(key)) continue;
      result.pairsCompared++;
      const prep = (id: string) =>
        byUser
          .get(id)!
          .map(toMatchSignal)
          .filter((s) => liveOn || !s.temporary);
      const m = computeMatch(prep(a), prep(b), weights, undefined, undefined, {
        a: contexts.get(a),
        b: contexts.get(b),
        rarity,
        mutuals: mutualCount(a, b),
        learnedA: learned.get(a),
        learnedB: learned.get(b),
        likelyYesA: responsive.get(a),
        likelyYesB: responsive.get(b),
      });
      const prev = existing.get(key);
      if (m.score < weights.threshold || !m.reasons.length) {
        if (prev && prev.status === "suggested") {
          await db.run("UPDATE matches SET status = 'retired', updated_at = ? WHERE id = ?", [ts, prev.id]);
          result.matchesRetired++;
        }
        continue;
      }
      if (!prev) {
        const id = uid();
        await db.run(
          "INSERT INTO matches (id, user_a, user_b, score, dimensions, reasons, a_state, b_state, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'new', 'new', 'suggested', ?, ?)",
          [id, a, b, m.score, JSON.stringify(m.dimensions), JSON.stringify(m.reasons), ts, ts],
        );
        result.matchesCreated++;
        const topic = m.topics[0] && !m.topics[0].startsWith("p:") ? topicLabel(m.topics[0]) : "something in common";
        for (const u of [a, b]) fresh.set(u, [...(fresh.get(u) ?? []), topic]);
      } else if (prev.status === "suggested" || prev.status === "retired") {
        await db.run("UPDATE matches SET score = ?, dimensions = ?, reasons = ?, status = 'suggested', updated_at = ? WHERE id = ?", [
          m.score,
          JSON.stringify(m.dimensions),
          JSON.stringify(m.reasons),
          ts,
          prev.id,
        ]);
        result.matchesUpdated++;
      }
    }
  }

  // Retire suggestions whose members no longer both take part (consent withdrawn, suspended, …).
  for (const [key, m] of existing) {
    if (m.status !== "suggested" || seen.has(key)) continue;
    if (opts.forUserId && m.user_a !== opts.forUserId && m.user_b !== opts.forUserId) continue;
    await db.run("UPDATE matches SET status = 'retired', updated_at = ? WHERE id = ?", [ts, m.id]);
    result.matchesRetired++;
  }

  // One gentle notification per member per run, however many suggestions are new.
  if (!opts.quiet) {
    for (const [u, topics] of fresh) {
      if (topics.length === 1) {
        await notify(u, "match", "Your companion noticed someone", `A possible connection around ${topics[0]}. Take a look when you have a moment.`, "/discover");
      } else {
        await notify(u, "match", `Your companion noticed ${topics.length} people`, "There are new possible connections waiting in Discover, each with the reasons why.", "/discover");
      }
    }
  }

  // Beyond pairs: look for small groups who could get together.
  await sweepGatherings();
  result.gatheringsProposed = (await proposeGatherings({ quiet: opts.quiet })) + (await proposeBridges({ quiet: opts.quiet }));

  await audit(opts.actorId ?? null, "network.run", "network", opts.forUserId ?? "all", { ...result });
  return result;
}

export interface MatchView {
  id: string;
  member: MemberPreview;
  score: number;
  dimensions: { shared: number; moments: number; complementary: number };
  reasons: { dimension: MatchReason["dimension"]; text: string; topics: string[] }[];
  /** First names of connections you have in common — only those who allow it. */
  mutuals: string[];
  mutualCount: number;
  isNew: boolean;
  createdAt: string;
  introduction: { id: string; status: string; mine: string; theirs: string } | null;
}

async function toView(userId: string, rows: MatchRow[]): Promise<MatchView[]> {
  const db = await getDb();
  const others = rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a));
  const previews = await previewsById(others);
  const intros = await db.all<{ id: string; match_id: string; status: string; user_a: string; a_decision: string; b_decision: string }>(
    "SELECT id, match_id, status, user_a, a_decision, b_decision FROM introductions WHERE (user_a = ? OR user_b = ?) AND status = 'pending'",
    [userId, userId],
  );
  const introByMatch = new Map(intros.map((i) => [i.match_id, i]));
  // Friends of friends. Counted only if viewer and match both allow it; a name is shown only if that friend allows it too.
  const allow = new Set(
    (await db.all<{ user_id: string }>("SELECT user_id FROM consents WHERE key = 'mutual_connections' AND granted = 1")).map((c) => c.user_id),
  );
  const friendsOf = async (id: string) =>
    (await db.all<{ user_a: string; user_b: string }>("SELECT user_a, user_b FROM connections WHERE status = 'active' AND (user_a = ? OR user_b = ?)", [id, id])).map((c) =>
      c.user_a === id ? c.user_b : c.user_a,
    );
  const mine = allow.has(userId) ? new Set(await friendsOf(userId)) : new Set<string>();
  const out: MatchView[] = [];
  for (const r of rows) {
    const isA = r.user_a === userId;
    const member = previews.get(isA ? r.user_b : r.user_a);
    if (!member) continue;
    const shared = mine.size && allow.has(member.id) ? (await friendsOf(member.id)).filter((f) => mine.has(f)) : [];
    const named = [...(await previewsById(shared.filter((f) => allow.has(f)))).values()].map((p) => p.name);
    const reasons = json<MatchReason[]>(r.reasons, []);
    const texts = reasonTexts(reasons, isA);
    const intro = introByMatch.get(r.id);
    out.push({
      id: r.id,
      member,
      score: Number(r.score),
      dimensions: json(r.dimensions, { shared: 0, moments: 0, complementary: 0 }),
      reasons: [
        ...reasons.map((x, i) => ({ dimension: x.dimension, text: texts[i], topics: x.topics })).filter((x) => x.text),
        ...(shared.length
          ? [{ dimension: "context" as const, topics: [], text: named.length ? `You both know ${named.slice(0, 2).join(" and ")}` : `You have ${shared.length === 1 ? "a connection" : `${shared.length} connections`} in common` }]
          : []),
      ],
      mutuals: named,
      mutualCount: shared.length,
      isNew: (isA ? r.a_state : r.b_state) === "new",
      createdAt: r.created_at,
      introduction: intro
        ? {
            id: intro.id,
            status: intro.status,
            mine: intro.user_a === userId ? intro.a_decision : intro.b_decision,
            theirs: intro.user_a === userId ? intro.b_decision : intro.a_decision,
          }
        : null,
    });
  }
  return out;
}

/** Suggested connections for a member, best first. Hidden: dismissed, blocked. */
export async function listMatches(userId: string): Promise<MatchView[]> {
  const db = await getDb();
  const rows = await db.all<MatchRow>(
    `SELECT * FROM matches WHERE status = 'suggested'
       AND ((user_a = ? AND a_state != 'dismissed') OR (user_b = ? AND b_state != 'dismissed'))
     ORDER BY score DESC`,
    [userId, userId],
  );
  const blocked = new Set(
    (
      await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId])
    ).map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)),
  );
  return toView(
    userId,
    rows.filter((r) => !blocked.has(r.user_a === userId ? r.user_b : r.user_a)),
  );
}

export async function getMatch(userId: string, matchId: string): Promise<MatchView | null> {
  const db = await getDb();
  const row = await db.get<MatchRow>("SELECT * FROM matches WHERE id = ?", [matchId]);
  if (!row || (row.user_a !== userId && row.user_b !== userId)) return null;
  return (await toView(userId, [row]))[0] ?? null;
}

export async function setMatchState(userId: string, matchId: string, state: "seen" | "dismissed") {
  const db = await getDb();
  const row = await db.get<MatchRow>("SELECT * FROM matches WHERE id = ?", [matchId]);
  if (!row || (row.user_a !== userId && row.user_b !== userId)) throw forbidden();
  const col = row.user_a === userId ? "a_state" : "b_state";
  const cur = row.user_a === userId ? row.a_state : row.b_state;
  if (state === "seen" && cur !== "new") return;
  await db.run(`UPDATE matches SET ${col} = ?, updated_at = ? WHERE id = ?`, [state, now(), matchId]);
}

export async function markMatchesSeen(userId: string) {
  const db = await getDb();
  await db.run("UPDATE matches SET a_state = 'seen' WHERE user_a = ? AND a_state = 'new'", [userId]);
  await db.run("UPDATE matches SET b_state = 'seen' WHERE user_b = ? AND b_state = 'new'", [userId]);
}

/* ---------------------- Live Connection Intelligence --------------------- */

export interface LiveMoment {
  topic: string;
  label: string;
  /** How many other members currently share a live signal on this topic. Identities are never revealed here. */
  resonance: number;
  mine: boolean;
  expiresAt: string | null;
}

export interface LiveView {
  enabled: boolean;
  mine: LiveMoment[];
  pulse: LiveMoment[];
  liveMembers: number;
}

/**
 * Live Connection Intelligence: what the network is noticing right now, from
 * temporary signals only. Returns aggregate counts — never who.
 */
export async function liveIntelligence(userId: string): Promise<LiveView> {
  if (!(await flag("live_intelligence"))) return { enabled: false, mine: [], pulse: [], liveMembers: 0 };
  await expireSignals();
  const byUser = await networkSignals();
  const db = await getDb();
  const blocked = new Set(
    (
      await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId])
    ).map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)),
  );
  const counts = new Map<string, Set<string>>();
  const liveUsers = new Set<string>();
  for (const [uidKey, signals] of byUser) {
    if (uidKey === userId || blocked.has(uidKey)) continue;
    for (const s of signals) {
      if (!s.temporary) continue;
      liveUsers.add(uidKey);
      if (!counts.has(s.topic)) counts.set(s.topic, new Set());
      counts.get(s.topic)!.add(uidKey);
    }
  }
  const myLive = (byUser.get(userId) ?? []).filter((s) => s.temporary);
  const mine: LiveMoment[] = myLive.map((s) => ({
    topic: s.topic,
    label: topicLabel(s.topic),
    resonance: counts.get(s.topic)?.size ?? 0,
    mine: true,
    expiresAt: s.expiresAt,
  }));
  const myTopics = new Set(myLive.map((s) => s.topic));
  const pulse: LiveMoment[] = [...counts.entries()]
    .filter(([topic]) => !myTopics.has(topic))
    .map(([topic, users]) => ({ topic, label: topicLabel(topic), resonance: users.size, mine: false, expiresAt: null }))
    .sort((x, y) => y.resonance - x.resonance || x.label.localeCompare(y.label))
    .slice(0, 12);
  return { enabled: true, mine, pulse, liveMembers: liveUsers.size };
}
