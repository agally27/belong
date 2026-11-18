import { env } from "../config";
import { getDb, json, now, pair, uid } from "../db";
import { mockConnectionIdeas } from "../ai/mock";
import { milesBetween } from "../geo";
import { SLOT_LABEL } from "../matching/engine";
import { topicLabel, TOPICS } from "../matching/topics";
import { AppError, audit, flag, forbidden, notFound, notify } from "./core";
import { previewsById, type MemberPreview } from "./members";
import { taxonomyMatcher } from "../matching/semantic";
import { networkContexts, networkSignals } from "./signals";
import { assertVerified } from "./verification";

/**
 * Companion-proposed gatherings: a one-off, low-pressure get-together for a
 * few nearby members who share an interest and are free at the same sort of
 * time. Built from signals and consented coarse context only.
 *
 * Rules: nobody is ever placed in a group — each person opts in; who else was
 * invited stays hidden until the gathering is confirmed and you have said yes;
 * it only goes ahead if enough people accept, otherwise it quietly lapses.
 */
export const GATHERING_MIN = 3;
export const GATHERING_MAX = 6;

type GatheringRow = {
  id: string;
  topic: string;
  title: string;
  area: string | null;
  slot: string;
  starts_at: string;
  respond_by: string;
  min_size: number;
  max_size: number;
  status: string;
  circle_id: string | null;
  reminded_at: string | null;
  bridge: string | null;
};

type Bridge = { a: string; b: string; names: [string, string] };

const SLOT_HOUR: Record<string, number> = { mornings: 10, afternoons: 14, evenings: 19 };

/** The next date matching a broad slot, at least `leadDays` away. */
export function nextSlotDate(slot: string, from = new Date(), leadDays = 3): Date {
  const [part, time] = slot.split("_");
  const d = new Date(from.getTime() + leadDays * 86400000);
  d.setUTCHours(SLOT_HOUR[time] ?? 11, 0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const day = d.getUTCDay();
    if (part === "weekend" ? day === 6 || day === 0 : day >= 2 && day <= 4) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // Slot hours are UK local time: shift by the London offset on that date (1 hour in summer).
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(d));
  d.setUTCHours(d.getUTCHours() - (londonHour - d.getUTCHours()));
  return d;
}

const ENERGY = ["quiet-evening", "easy-going", "high-energy"];

/** Activity ideas are written for two people; reword them for a group. */
const forGroup = (idea: string) => idea.replace(/neither of you/gi, "none of you").replace(/ as a team of two/gi, " as a team");

/** "user|startsAt" for every upcoming gathering someone has been invited to and not declined. */
async function bookedTimes(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.all<{ user_id: string; starts_at: string }>(
    "SELECT i.user_id, g.starts_at FROM gathering_invites i JOIN gatherings g ON g.id = i.gathering_id WHERE i.status != 'declined' AND g.status IN ('proposed', 'confirmed') AND g.starts_at > ?",
    [now()],
  );
  return new Set(rows.map((r) => `${r.user_id}|${r.starts_at}`));
}

/** The first of the next few weeks' dates for a slot when the people can all make it (nobody double-booked). */
function firstFreeDate(slot: string, people: string[], booked: Set<string>, ok: (free: string[]) => boolean): { starts: Date; free: string[] } | null {
  for (let week = 0; week < 3; week++) {
    const starts = nextSlotDate(slot, new Date(Date.now() + week * 7 * 86400000));
    const free = people.filter((u) => !booked.has(`${u}|${starts.toISOString()}`));
    if (ok(free)) return { starts, free };
  }
  return null;
}

/** Looks for clusters of compatible members and proposes gatherings. Returns how many were created. */
export async function proposeGatherings(opts: { quiet?: boolean } = {}): Promise<number> {
  if (!(await flag("gatherings"))) return 0;
  const db = await getDb();
  const [byUser, contexts] = [await networkSignals(), await networkContexts()];
  const ts = now();

  const open = await db.all<{ user_id: string; topic: string; bridge: string | null }>(
    "SELECT i.user_id, g.topic, g.bridge FROM gathering_invites i JOIN gatherings g ON g.id = i.gathering_id WHERE g.status IN ('proposed', 'confirmed') AND g.starts_at > ?",
    [ts],
  );
  const hasTopic = new Set(open.map((o) => `${o.user_id}|${o.topic}`));
  // At most two open suggestions per person. Bridges don't count: they're about a Circle you're already in.
  const openCount = new Map<string, number>();
  for (const o of open) if (!o.bridge) openCount.set(o.user_id, (openCount.get(o.user_id) ?? 0) + 1);
  const blocks = new Set((await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks")).map((b) => pair(b.blocker_id, b.blocked_id).join("|")));
  const friends = new Set((await db.all<{ user_a: string; user_b: string }>("SELECT user_a, user_b FROM connections WHERE status = 'active'")).map((c) => `${c.user_a}|${c.user_b}`));
  const key = (a: string, b: string) => pair(a, b).join("|");

  // What each eligible member brings: topics (and whether it's a live wish), free slots, social energy.
  type Person = { id: string; topics: Map<string, boolean>; slots: string[]; energy: number };
  const people = new Map<string, Person>();
  for (const [id, signals] of byUser) {
    const ctx = contexts.get(id);
    if (!ctx?.groupsOk || !ctx.point) continue;
    const styles = signals.filter((s) => s.kind === "personality").map((s) => s.topic.slice(2));
    if (styles.includes("one-to-one")) continue; // respects a stated preference for one-to-one
    const slots = signals.filter((s) => s.kind === "availability").map((s) => s.topic.slice(2));
    if (!slots.length || (openCount.get(id) ?? 0) >= 2) continue;
    const topics = new Map<string, boolean>();
    for (const s of signals) {
      if (!TOPICS[s.topic] || !["interest", "intention", "moment"].includes(s.kind)) continue;
      topics.set(s.topic, topics.get(s.topic) || s.temporary);
    }
    people.set(id, { id, topics, slots, energy: ENERGY.indexOf(styles.find((x) => ENERGY.includes(x)) ?? "easy-going") });
  }

  const byTopic = new Map<string, Person[]>();
  for (const p of people.values()) for (const t of p.topics.keys()) byTopic.set(t, [...(byTopic.get(t) ?? []), p]);
  const reachable = (a: string, b: string) => {
    const [ca, cb] = [contexts.get(a)!, contexts.get(b)!];
    return milesBetween(ca.point!, cb.point!) <= Math.min(ca.radiusMiles ?? 10, cb.radiusMiles ?? 10);
  };

  let created = 0;
  const placed = new Set<string>(); // at most one new proposal per member per run
  const booked = await bookedTimes();
  for (const [topic, all] of [...byTopic.entries()].sort((x, y) => y[1].length - x[1].length)) {
    const pool = all.filter((p) => !placed.has(p.id) && !hasTopic.has(`${p.id}|${topic}`));
    if (pool.length < GATHERING_MIN) continue;
    // Start from someone actively hoping for company on this topic, if there is one.
    const seed = pool.find((p) => p.topics.get(topic)) ?? pool[0];
    const group = [seed];
    let slots = seed.slots;
    const rest = pool.filter((p) => p !== seed);
    while (group.length < GATHERING_MAX) {
      let best: Person | undefined;
      let bestScore = -Infinity;
      for (const c of rest) {
        if (group.includes(c)) continue;
        if (!group.every((g) => reachable(g.id, c.id) && !blocks.has(key(g.id, c.id)))) continue;
        if (!c.slots.some((s) => slots.includes(s))) continue;
        // A familiar face helps; so does a mix of quieter and livelier people.
        const familiar = group.some((g) => friends.has(key(g.id, c.id))) ? 1 : 0;
        const mix = group.filter((g) => g.energy === c.energy).length / group.length;
        const near = milesBetween(contexts.get(seed.id)!.point!, contexts.get(c.id)!.point!);
        const score = familiar * 1.5 + (c.topics.get(topic) ? 1 : 0) + (1 - mix) - near / 20;
        if (score > bestScore) {
          best = c;
          bestScore = score;
        }
      }
      if (!best) break;
      group.push(best);
      slots = slots.filter((s) => best!.slots.includes(s));
    }
    if (group.length < GATHERING_MIN || !slots.length) continue;

    const slot = slots[0];
    // Never double-book anyone: move to a later week if needed, or drop people who are busy.
    const when = firstFreeDate(slot, group.map((p) => p.id), booked, (free) => free.length >= GATHERING_MIN);
    if (!when) continue;
    const starts = when.starts;
    const freeIds = new Set(when.free);
    const invitees = group.filter((p) => freeIds.has(p.id));
    const respondBy = new Date(Math.min(Date.now() + 4 * 86400000, starts.getTime() - 86400000));
    const idea = forGroup(mockConnectionIdeas({ theirFirstName: "", sharedTopics: [topic], reasons: [] }).activities[0]);
    const id = uid();
    await db.run(
      "INSERT INTO gatherings (id, topic, title, area, slot, starts_at, respond_by, min_size, max_size, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)",
      [id, topic, idea, contexts.get(seed.id)?.town ?? null, slot, starts.toISOString(), respondBy.toISOString(), GATHERING_MIN, GATHERING_MAX, ts],
    );
    for (const p of invitees) {
      booked.add(`${p.id}|${starts.toISOString()}`);
      placed.add(p.id);
      const reason = p.topics.get(topic) ? `You said you'd like ${topicLabel(topic)} company` : `Because you enjoy ${topicLabel(topic)}`;
      await db.run("INSERT INTO gathering_invites (gathering_id, user_id, status, reason, created_at) VALUES (?, ?, 'invited', ?, ?)", [id, p.id, reason, ts]);
      if (!opts.quiet) {
        await notify(p.id, "gathering", "Your companion has an idea", `A small ${topicLabel(topic)} get-together with ${invitees.length - 1} others nearby. Interested?`, "/gatherings");
      }
    }
    await audit(null, "gathering.proposed", "gathering", id, { topic, invited: invitees.length });
    created++;
  }
  return created;
}

/** Housekeeping: lapse unanswered proposals, complete past gatherings, send day-before reminders. */
export async function sweepGatherings(): Promise<void> {
  const db = await getDb();
  const ts = now();
  await db.run("UPDATE gatherings SET status = 'lapsed' WHERE status = 'proposed' AND respond_by <= ?", [ts]);
  await db.run("UPDATE gatherings SET status = 'completed' WHERE status = 'confirmed' AND starts_at <= ?", [ts]);
  const soon = new Date(Date.now() + 86400000).toISOString();
  const due = await db.all<GatheringRow>("SELECT * FROM gatherings WHERE status = 'confirmed' AND reminded_at IS NULL AND starts_at <= ? AND starts_at > ?", [soon, ts]);
  for (const g of due) {
    await db.run("UPDATE gatherings SET reminded_at = ? WHERE id = ?", [ts, g.id]);
    for (const u of await accepted(g.id)) await notify(u, "gathering", "Tomorrow: " + g.title, "A reminder about your get-together. Check the group chat for the meeting point.", "/gatherings");
  }
}

/** Enough yeses? Ordinary gatherings need min_size; bridges need at least two from each Circle. */
async function enough(g: GatheringRow): Promise<boolean> {
  const db = await getDb();
  const rows = await db.all<{ side: string | null }>("SELECT side FROM gathering_invites WHERE gathering_id = ? AND status = 'accepted'", [g.id]);
  if (!g.bridge) return rows.length >= Number(g.min_size);
  return rows.filter((r) => r.side === "a").length >= 2 && rows.filter((r) => r.side === "b").length >= 2;
}

async function accepted(gatheringId: string): Promise<string[]> {
  const db = await getDb();
  return (await db.all<{ user_id: string }>("SELECT user_id FROM gathering_invites WHERE gathering_id = ? AND status = 'accepted' ORDER BY responded_at", [gatheringId])).map((r) => r.user_id);
}

async function invite(userId: string, gatheringId: string) {
  const db = await getDb();
  const g = await db.get<GatheringRow>("SELECT * FROM gatherings WHERE id = ?", [gatheringId]);
  const inv = await db.get<{ status: string }>("SELECT status FROM gathering_invites WHERE gathering_id = ? AND user_id = ?", [gatheringId, userId]);
  if (!g || !inv) throw forbidden("That gathering isn't available to you.");
  return { g, inv };
}

/** A member says yes or no. The gathering is confirmed only once enough people have said yes. */
export async function respondToGathering(userId: string, gatheringId: string, accept: boolean): Promise<{ status: string }> {
  const db = await getDb();
  return db.tx(async () => {
    const { g } = await invite(userId, gatheringId);
    if (!["proposed", "confirmed"].includes(g.status) || g.starts_at <= now()) throw new AppError("This gathering is no longer open.", "conflict");
    if (accept) await assertVerified(userId);
    const going = await accepted(gatheringId);
    if (accept && !going.includes(userId) && going.length >= Number(g.max_size)) throw new AppError("This gathering is now full.", "conflict");
    await db.run("UPDATE gathering_invites SET status = ?, responded_at = ? WHERE gathering_id = ? AND user_id = ?", [accept ? "accepted" : "declined", now(), gatheringId, userId]);
    const after = await accepted(gatheringId);
    const isEnough = await enough(g);
    let status = g.status;
    if (g.status === "proposed" && isEnough) {
      status = "confirmed";
      await db.run("UPDATE gatherings SET status = 'confirmed' WHERE id = ?", [gatheringId]);
      if (!(await db.get("SELECT id FROM conversations WHERE gathering_id = ?", [gatheringId]))) {
        await db.run("INSERT INTO conversations (id, kind, gathering_id, created_at) VALUES (?, 'gathering', ?, ?)", [uid(), gatheringId, now()]);
      }
      for (const u of after) await notify(u, "gathering", "It's happening: " + g.title, "Enough people said yes. You can now see who's coming and agree a meeting point in the group chat.", "/gatherings");
    } else if (g.status === "confirmed" && accept && !going.includes(userId)) {
      for (const u of going) await notify(u, "gathering", "Someone else is joining", g.title, "/gatherings");
    } else if (g.status === "confirmed" && !isEnough) {
      status = "proposed";
      await db.run("UPDATE gatherings SET status = 'proposed' WHERE id = ?", [gatheringId]);
      for (const u of after) await notify(u, "gathering", "Your get-together needs one more", "Someone can't make it. It will go ahead again as soon as another person says yes.", "/gatherings");
    }
    return { status };
  });
}

export interface GatheringView {
  id: string;
  title: string;
  topicLabel: string;
  area: string | null;
  startsAt: string;
  respondBy: string;
  slotLabel: string;
  status: "proposed" | "confirmed" | "completed";
  myStatus: "invited" | "accepted";
  reason: string;
  invited: number;
  going: number;
  minSize: number;
  /** Shown only once confirmed, and only to people who said yes. */
  members: MemberPreview[];
  conversationId: string | null;
  circleId: string | null;
  canBecomeCircle: boolean;
  /** Demo only: fictional invitees who haven't answered. */
  demoWaiting: number;
  /** Set when this is a get-together between two Circles. */
  bridge: { mine: string; other: string } | null;
}

export async function listGatherings(userId: string): Promise<GatheringView[]> {
  if (!(await flag("gatherings"))) return [];
  await sweepGatherings();
  const db = await getDb();
  const rows = await db.all<GatheringRow & { my_status: string; reason: string; side: string | null }>(
    `SELECT g.*, i.status AS my_status, i.reason, i.side FROM gathering_invites i JOIN gatherings g ON g.id = i.gathering_id
     WHERE i.user_id = ? AND i.status != 'declined' AND g.status IN ('proposed', 'confirmed', 'completed') ORDER BY g.starts_at`,
    [userId],
  );
  const blocked = new Set(
    (await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId])).map((b) =>
      b.blocker_id === userId ? b.blocked_id : b.blocker_id,
    ),
  );
  const out: GatheringView[] = [];
  for (const g of rows) {
    if (g.status === "completed" && (g.my_status !== "accepted" || Date.parse(g.starts_at) < Date.now() - 21 * 86400000)) continue;
    const invites = await db.all<{ user_id: string; status: string; is_demo: number }>(
      "SELECT i.user_id, i.status, u.is_demo FROM gathering_invites i JOIN users u ON u.id = i.user_id WHERE i.gathering_id = ?",
      [g.id],
    );
    const going = invites.filter((i) => i.status === "accepted");
    const reveal = g.my_status === "accepted" && g.status !== "proposed";
    const previews = reveal ? await previewsById(going.map((i) => i.user_id).filter((id) => id !== userId && !blocked.has(id))) : new Map();
    const conv = reveal ? await db.get<{ id: string }>("SELECT id FROM conversations WHERE gathering_id = ?", [g.id]) : undefined;
    out.push({
      id: g.id,
      title: g.title,
      topicLabel: topicLabel(g.topic),
      area: g.area,
      startsAt: g.starts_at,
      respondBy: g.respond_by,
      slotLabel: SLOT_LABEL[g.slot] ?? g.slot,
      status: g.status as GatheringView["status"],
      myStatus: g.my_status as GatheringView["myStatus"],
      reason: g.reason,
      invited: invites.length,
      going: going.length,
      minSize: Number(g.min_size),
      members: [...previews.values()],
      conversationId: conv?.id ?? null,
      circleId: g.circle_id,
      canBecomeCircle: reveal && !g.circle_id && !g.bridge && going.length >= 3,
      demoWaiting: invites.filter((i) => i.is_demo && i.status === "invited" && i.user_id !== userId).length,
      bridge: (() => {
        if (!g.bridge) return null;
        const b = json<Bridge | null>(g.bridge, null);
        if (!b) return null;
        return g.side === "a" ? { mine: b.names[0], other: b.names[1] } : { mine: b.names[1], other: b.names[0] };
      })(),
    });
  }
  return out;
}

/** Turns a get-together that worked into a regular Circle for everyone who came. */
export async function gatheringToCircle(userId: string, gatheringId: string, nameRaw: string): Promise<string> {
  const { g, inv } = await invite(userId, gatheringId);
  if (inv.status !== "accepted" || !["confirmed", "completed"].includes(g.status)) throw forbidden("Only people who joined can do this.");
  if (g.circle_id) return g.circle_id;
  const name = nameRaw.trim().slice(0, 60) || `${topicLabel(g.topic)[0].toUpperCase()}${topicLabel(g.topic).slice(1)} regulars`;
  // Respect each person's Circle allowance: the creator needs room; others join only if they have room,
  // otherwise they're invited to join later.
  const { getLimits } = await import("./subscriptions");
  const db = await getDb();
  const hasRoom = async (u: string) => {
    const limit = (await getLimits(u)).circles;
    if (limit < 0) return true;
    const n = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM circle_members WHERE user_id = ?", [u]);
    return Number(n?.n ?? 0) < limit;
  };
  if (!(await hasRoom(userId))) {
    throw new AppError("Your membership's Circle allowance is full. Leave a Circle or upgrade, then try again.", "limit");
  }
  const everyone = (await accepted(gatheringId)).slice(0, 8);
  const members: string[] = [];
  const later: string[] = [];
  for (const u of everyone) ((u === userId || (await hasRoom(u))) ? members : later).push(u);
  const id = uid();
  const ts = now();
  await db.tx(async () => {
    await db.run("INSERT INTO circles (id, name, description, topic, area, capacity, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)", [
      id,
      name,
      `Started after a get-together: “${g.title}”.`,
      g.topic,
      g.area,
      Math.min(8, Math.max(4, members.length + 2)),
      userId,
      ts,
    ]);
    for (const m of members) await db.run("INSERT INTO circle_members (circle_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)", [id, m, m === userId ? "host" : "member", ts]);
    await db.run("INSERT INTO conversations (id, kind, circle_id, created_at) VALUES (?, 'circle', ?, ?)", [uid(), id, ts]);
    await db.run("UPDATE gatherings SET circle_id = ? WHERE id = ?", [id, gatheringId]);
  });
  for (const m of members) if (m !== userId) await notify(m, "circle", `You're now part of ${name}`, "Your get-together has become a regular Circle.", `/circles/${id}`);
  for (const m of later) await notify(m, "circle", `${name} is now a Circle`, "Your get-together became a regular Circle. Your membership's Circle allowance is full, so you haven't been added — you can join from its page once you have room.", `/circles/${id}`);
  await audit(userId, "gathering.became_circle", "circle", id);
  return id;
}

/** DEMO ONLY: fictional invitees answer, so the flow can be shown end to end. */
export async function simulateDemoGathering(actorId: string, gatheringId: string) {
  if (!env.demoMode() || !(await flag("demo_simulation"))) throw forbidden("Demo simulation is switched off.");
  await invite(actorId, gatheringId);
  const db = await getDb();
  const waiting = await db.all<{ user_id: string }>(
    "SELECT i.user_id FROM gathering_invites i JOIN users u ON u.id = i.user_id WHERE i.gathering_id = ? AND i.status = 'invited' AND u.is_demo = 1 AND i.user_id != ?",
    [gatheringId, actorId],
  );
  if (!waiting.length) throw notFound("There are no fictional members waiting to answer.");
  // Most say yes; with a larger group one politely can't make it, as in real life.
  for (const [i, w] of waiting.entries()) await respondToGathering(w.user_id, gatheringId, !(waiting.length > 3 && i === waiting.length - 1));
  await audit(actorId, "demo.simulated_gathering", "gathering", gatheringId);
}

const BRIDGE_COOLDOWN_DAYS = 60;

/**
 * Bridges between friend groups. When two Circles with no members in common are
 * nearby and share (or neighbour) an interest, propose one joint get-together.
 * Same rules as any gathering — individual opt-in, names hidden until it's
 * confirmed — and it goes ahead only if at least two people from EACH Circle say yes.
 */
export async function proposeBridges(opts: { quiet?: boolean } = {}): Promise<number> {
  if (!(await flag("gatherings"))) return 0;
  const db = await getDb();
  const [byUser, contexts] = [await networkSignals(), await networkContexts()];
  const circles = await db.all<{ id: string; name: string; topic: string }>("SELECT id, name, topic FROM circles WHERE status = 'open'");
  const membersOf = new Map<string, string[]>();
  for (const c of circles) {
    membersOf.set(c.id, (await db.all<{ user_id: string }>("SELECT user_id FROM circle_members WHERE circle_id = ?", [c.id])).map((r) => r.user_id));
  }
  const ready = circles.filter((c) => (membersOf.get(c.id)?.length ?? 0) >= 3);

  const recent = await db.all<{ bridge: string; status: string; created_at: string }>("SELECT bridge, status, created_at FROM gatherings WHERE bridge IS NOT NULL");
  const busy = new Set<string>();
  const cooled = new Set<string>();
  const cutoff = new Date(Date.now() - BRIDGE_COOLDOWN_DAYS * 86400000).toISOString();
  for (const r of recent) {
    const b = json<Bridge | null>(r.bridge, null);
    if (!b) continue;
    if (["proposed", "confirmed"].includes(r.status)) [b.a, b.b].forEach((x) => busy.add(x));
    if (r.created_at > cutoff) cooled.add(pair(b.a, b.b).join("|"));
  }
  const blocks = new Set((await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks")).map((b) => pair(b.blocker_id, b.blocked_id).join("|")));
  const slotsOf = (u: string) => (byUser.get(u) ?? []).filter((s) => s.kind === "availability").map((s) => s.topic.slice(2));
  const booked = await bookedTimes();
  const reach = (u: string, v: string) => {
    const [cu, cv] = [contexts.get(u), contexts.get(v)];
    if (!cu?.point || !cv?.point) return false;
    return milesBetween(cu.point, cv.point) <= Math.min(cu.radiusMiles ?? 10, cv.radiusMiles ?? 10);
  };

  let created = 0;
  for (let i = 0; i < ready.length; i++) {
    for (let j = i + 1; j < ready.length; j++) {
      const [c1, c2] = [ready[i], ready[j]];
      if (busy.has(c1.id) || busy.has(c2.id) || cooled.has(pair(c1.id, c2.id).join("|"))) continue;
      if (taxonomyMatcher.similarity(c1.topic, c2.topic) < 0.5) continue;
      const [m1, m2] = [membersOf.get(c1.id)!, membersOf.get(c2.id)!];
      if (m1.some((u) => m2.includes(u))) continue; // already connected through a shared member

      // Who could come: opted in, has an area and free time, and within reach of most of the other group.
      const eligible = (mine: string[], theirs: string[]) =>
        mine.filter((u) => {
          const ctx = contexts.get(u);
          if (!ctx?.groupsOk || !ctx.point || !slotsOf(u).length) return false;
          return theirs.filter((v) => reach(u, v)).length * 2 >= theirs.length;
        });
      let a = eligible(m1, m2);
      let b = eligible(m2, m1);
      // Nobody is invited alongside someone they've blocked, or who has blocked them.
      const clash = new Set<string>();
      for (const u of a) for (const v of b) if (blocks.has(pair(u, v).join("|"))) [u, v].forEach((x) => clash.add(x));
      a = a.filter((u) => !clash.has(u));
      b = b.filter((u) => !clash.has(u));

      // The free slot that suits the most people on both sides.
      const slots = [...new Set([...a, ...b].flatMap(slotsOf))];
      const scored = slots
        .map((s) => ({ s, na: a.filter((u) => slotsOf(u).includes(s)).length, nb: b.filter((u) => slotsOf(u).includes(s)).length }))
        .filter((x) => x.na >= 2 && x.nb >= 2)
        .sort((x, y) => Math.min(y.na, y.nb) - Math.min(x.na, x.nb) || y.na + y.nb - (x.na + x.nb));
      if (!scored.length) continue;
      const slot = scored[0].s;
      a = a.filter((u) => slotsOf(u).includes(slot));
      b = b.filter((u) => slotsOf(u).includes(slot));
      const when = firstFreeDate(slot, [...a, ...b], booked, (free) => free.filter((u) => a.includes(u)).length >= 2 && free.filter((u) => b.includes(u)).length >= 2);
      if (!when) continue;
      a = a.filter((u) => when.free.includes(u));
      b = b.filter((u) => when.free.includes(u));

      const starts = when.starts;
      const respondBy = new Date(Math.min(Date.now() + 4 * 86400000, starts.getTime() - 86400000));
      // An idea that suits both groups, worded as a joint get-together.
      const ideas = mockConnectionIdeas({ theirFirstName: "", sharedTopics: [c1.topic, c2.topic], reasons: [] }).activities;
      const idea = `Joint meet-up: ${forGroup(ideas[1] ?? ideas[0]).replace(/^[A-Z]/, (ch) => ch.toLowerCase())}`;
      const id = uid();
      const ts = now();
      const bridge: Bridge = { a: c1.id, b: c2.id, names: [c1.name, c2.name] };
      await db.run(
        "INSERT INTO gatherings (id, topic, title, area, slot, starts_at, respond_by, min_size, max_size, status, bridge, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 4, ?, 'proposed', ?, ?)",
        [id, c1.topic, idea, contexts.get(a[0])?.town ?? null, slot, starts.toISOString(), respondBy.toISOString(), Math.min(16, a.length + b.length), JSON.stringify(bridge), ts],
      );
      for (const [side, list, own, other] of [
        ["a", a, c1, c2],
        ["b", b, c2, c1],
      ] as const) {
        const reason =
          own.topic === other.topic
            ? `Your Circle ${own.name} and ${other.name} both love ${topicLabel(own.topic)}`
            : `Your Circle ${own.name} (${topicLabel(own.topic)}) and ${other.name} (${topicLabel(other.topic)}) have neighbouring interests`;
        for (const u of list) {
          await db.run("INSERT INTO gathering_invites (gathering_id, user_id, status, reason, side, created_at) VALUES (?, ?, 'invited', ?, ?, ?)", [id, u, reason, side, ts]);
          if (!opts.quiet) {
            await notify(u, "gathering", "Two Circles, one get-together", `${own.name} and ${other.name}, a nearby Circle with a lot in common, could meet up. Interested?`, "/gatherings");
          }
        }
      }
      busy.add(c1.id);
      busy.add(c2.id);
      for (const u of [...a, ...b]) booked.add(`${u}|${starts.toISOString()}`);
      await audit(null, "gathering.bridge_proposed", "gathering", id, { invited: a.length + b.length });
      created++;
    }
  }
  return created;
}
