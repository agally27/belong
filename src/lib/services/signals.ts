import { getDb, json, now, uid } from "../db";
import { MEMORY_CATEGORIES, PERSONALITY, type Personality, type PersonalityKey } from "../config";
import type { MatchSignal, SignalKind } from "../matching/engine";
import { topicLabel } from "../matching/topics";
import { audit, forbidden, getConsents } from "./core";

/**
 * Connection signals are the ONLY data the agent network may read.
 * They are derived here, on the member's side of the boundary, from sources
 * the member has approved — and are generalised to taxonomy topics so a
 * member's own words (memories, chats, bio) never leave their account.
 */
export interface Signal {
  id: string;
  userId: string;
  kind: SignalKind;
  topic: string;
  label: string;
  strength: number;
  sourceType: "profile" | "memory" | "intention";
  sourceId: string | null;
  temporary: boolean;
  expiresAt: string | null;
  status: "active" | "revoked" | "expired";
  createdAt: string;
}

type SignalRow = {
  id: string;
  user_id: string;
  kind: string;
  topic: string;
  label: string;
  strength: number;
  source_type: string;
  source_id: string | null;
  temporary: number;
  expires_at: string | null;
  status: string;
  created_at: string;
};

const toSignal = (r: SignalRow): Signal => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind as SignalKind,
  topic: r.topic,
  label: r.label,
  strength: Number(r.strength),
  sourceType: r.source_type as Signal["sourceType"],
  sourceId: r.source_id,
  temporary: Boolean(r.temporary),
  expiresAt: r.expires_at,
  status: r.status as Signal["status"],
  createdAt: r.created_at,
});

export const toMatchSignal = (s: Signal): MatchSignal => ({
  kind: s.kind,
  topic: s.topic,
  label: s.label,
  strength: s.strength,
  temporary: s.temporary,
  expiresAt: s.expiresAt,
});

export const personalityLabel = (topic: string) => topic.replace(/^p:/, "");
export const signalTopicLabel = (topic: string) => (topic.startsWith("p:") ? personalityLabel(topic) : topicLabel(topic));

type Desired = Omit<Signal, "id" | "userId" | "status" | "createdAt">;

/** Works out which signals a member's current approvals allow. */
async function desiredSignals(userId: string): Promise<Desired[]> {
  const db = await getDb();
  const consent = await getConsents(userId);
  const user = await db.get<{ status: string; onboarded_at: string | null }>(
    "SELECT status, onboarded_at FROM users WHERE id = ?",
    [userId],
  );
  if (!user || user.status !== "active" || !user.onboarded_at || !consent.matching_enabled) return [];
  const out: Desired[] = [];
  const profile = await db.get<{ interests: string; personality: string }>(
    "SELECT interests, personality FROM profiles WHERE user_id = ?",
    [userId],
  );
  if (profile && consent.share_interests) {
    for (const topic of json<string[]>(profile.interests, [])) {
      out.push({ kind: "interest", topic, label: topicLabel(topic), strength: 0.8, sourceType: "profile", sourceId: null, temporary: false, expiresAt: null });
    }
  }
  if (profile && consent.share_personality) {
    const p = json<Personality>(profile.personality, {});
    for (const key of Object.keys(PERSONALITY) as PersonalityKey[]) {
      const v = p[key];
      const label = v ? (PERSONALITY[key].signal as Record<string, string>)[v] : undefined;
      if (label) {
        out.push({ kind: "personality", topic: `p:${label}`, label, strength: 0.5, sourceType: "profile", sourceId: null, temporary: false, expiresAt: null });
      }
    }
  }
  // Memories: only approved, individually shareable, and in a shareable category.
  const memories = await db.all<{ id: string; category: string; topics: string }>(
    "SELECT id, category, topics FROM memories WHERE user_id = ? AND status = 'active' AND share_for_matching = 1",
    [userId],
  );
  for (const m of memories) {
    const cat = MEMORY_CATEGORIES.find((c) => c.id === m.category);
    if (!cat || !cat.shareable || !cat.signal) continue;
    const kind = cat.signal as SignalKind;
    const allowed =
      (kind === "interest" && consent.share_interests) ||
      (kind === "experience" && consent.share_experiences) ||
      ((kind === "offer" || kind === "seek") && consent.share_skills_goals);
    if (!allowed) continue;
    for (const topic of json<string[]>(m.topics, [])) {
      out.push({ kind, topic, label: topicLabel(topic), strength: 0.7, sourceType: "memory", sourceId: m.id, temporary: false, expiresAt: null });
    }
  }
  // Intentions: temporary, individually approved, and they expire.
  if (consent.share_intentions) {
    const intentions = await db.all<{ id: string; topics: string; mode: string; expires_at: string }>(
      "SELECT id, topics, mode, expires_at FROM intentions WHERE user_id = ? AND status = 'active' AND shared = 1 AND expires_at > ?",
      [userId, now()],
    );
    for (const i of intentions) {
      for (const topic of json<string[]>(i.topics, [])) {
        const kind: SignalKind = i.mode === "collaboration" ? "collaboration" : i.mode === "intention" ? "intention" : "moment";
        out.push({ kind, topic, label: topicLabel(topic), strength: 0.9, sourceType: "intention", sourceId: i.id, temporary: true, expiresAt: i.expires_at });
      }
    }
  }
  // De-duplicate on kind+topic, keeping the strongest.
  const best = new Map<string, Desired>();
  for (const s of out) {
    const k = `${s.kind}|${s.topic}`;
    const cur = best.get(k);
    if (!cur || s.strength > cur.strength) best.set(k, s);
  }
  return [...best.values()];
}

/** Rebuilds a member's signals from their current approvals. Idempotent. */
export async function syncSignals(userId: string): Promise<void> {
  const db = await getDb();
  const desired = await desiredSignals(userId);
  await db.tx(async () => {
    const existing = (await db.all<SignalRow>("SELECT * FROM signals WHERE user_id = ?", [userId])).map(toSignal);
    const key = (s: { kind: string; topic: string }) => `${s.kind}|${s.topic}`;
    const want = new Map(desired.map((d) => [key(d), d]));
    const revoked = new Set(existing.filter((s) => s.status === "revoked").map(key));
    for (const s of existing) {
      if (s.status === "revoked") continue; // member-revoked signals stay revoked
      const d = want.get(key(s));
      if (!d) {
        await db.run("DELETE FROM signals WHERE id = ?", [s.id]);
      } else {
        await db.run(
          "UPDATE signals SET strength = ?, source_type = ?, source_id = ?, temporary = ?, expires_at = ?, label = ?, status = 'active' WHERE id = ?",
          [d.strength, d.sourceType, d.sourceId, d.temporary ? 1 : 0, d.expiresAt, d.label, s.id],
        );
        want.delete(key(s));
      }
    }
    for (const [k, d] of want) {
      if (revoked.has(k)) continue;
      await db.run(
        "INSERT INTO signals (id, user_id, kind, topic, label, strength, source_type, source_id, temporary, expires_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)",
        [uid(), userId, d.kind, d.topic, d.label, d.strength, d.sourceType, d.sourceId, d.temporary ? 1 : 0, d.expiresAt, now()],
      );
    }
  });
}

/** Marks expired temporary signals and ends their intentions. Safe to call often. */
export async function expireSignals(): Promise<number> {
  const db = await getDb();
  const ts = now();
  const due = await db.all<{ id: string }>(
    "SELECT id FROM signals WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?",
    [ts],
  );
  if (due.length) {
    await db.run("UPDATE signals SET status = 'expired' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?", [ts]);
  }
  await db.run("UPDATE intentions SET status = 'expired' WHERE status = 'active' AND expires_at <= ?", [ts]);
  return due.length;
}

/** A member's own signals — exactly what their companion shares with the network. */
export async function listMySignals(userId: string): Promise<Signal[]> {
  const db = await getDb();
  const rows = await db.all<SignalRow>(
    "SELECT * FROM signals WHERE user_id = ? AND status != 'expired' ORDER BY temporary DESC, kind, label",
    [userId],
  );
  return rows.map(toSignal);
}

export async function setSignalRevoked(userId: string, signalId: string, revoked: boolean) {
  const db = await getDb();
  const row = await db.get<SignalRow>("SELECT * FROM signals WHERE id = ?", [signalId]);
  if (!row || row.user_id !== userId) throw forbidden();
  if (revoked) {
    await db.run("UPDATE signals SET status = 'revoked' WHERE id = ?", [signalId]);
  } else {
    await db.run("DELETE FROM signals WHERE id = ?", [signalId]);
    await syncSignals(userId);
  }
  await audit(userId, revoked ? "signal.revoked" : "signal.restored", "signal", signalId);
}

/**
 * The network's view: active, unexpired signals for members who currently
 * consent to matching. This is the single read path used by the matching
 * engine — there is deliberately no way to request memories or messages here.
 */
export async function networkSignals(): Promise<Map<string, Signal[]>> {
  const db = await getDb();
  const rows = await db.all<SignalRow>(
    `SELECT s.* FROM signals s
     JOIN users u ON u.id = s.user_id
     JOIN consents c ON c.user_id = s.user_id AND c.key = 'matching_enabled' AND c.granted = 1
     WHERE s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > ?)
       AND u.status = 'active' AND u.onboarded_at IS NOT NULL`,
    [now()],
  );
  const map = new Map<string, Signal[]>();
  for (const r of rows) {
    const s = toSignal(r);
    if (!map.has(s.userId)) map.set(s.userId, []);
    map.get(s.userId)!.push(s);
  }
  return map;
}
