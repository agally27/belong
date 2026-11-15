import { describe, expect, it } from "vitest";
import { inDb, makeMember } from "./helpers";
import { computeMatch, DEFAULT_WEIGHTS, type MatchSignal } from "@/lib/matching/engine";
import { feedbackSummary, giveFeedback, learnedPreferences, myLearning, pendingFeedback } from "@/lib/services/feedback";
import { requestIntroduction, respondToIntroduction } from "@/lib/services/introductions";
import { listConnections } from "@/lib/services/messaging";
import { listMatches, runNetwork, setMatchState } from "@/lib/services/network";
import { exportUserData } from "@/lib/services/account";
import { listGatherings, proposeGatherings, respondToGathering } from "@/lib/services/gatherings";
import { listUsers, overview } from "@/lib/services/admin";

const sig = (kind: MatchSignal["kind"], topic: string): MatchSignal => ({ kind, topic, label: topic, strength: 0.8, temporary: false, expiresAt: null });
const hiking = [sig("interest", "hiking"), sig("interest", "coffee")];

describe("engine: learned preferences", () => {
  it("nudges up for liked topics, down for disliked, and never creates a match", () => {
    const base = computeMatch(hiking, hiking).score;
    const liked = computeMatch(hiking, hiking, DEFAULT_WEIGHTS, undefined, undefined, { learnedA: { feedback: { hiking: 1 } } });
    const disliked = computeMatch(hiking, hiking, DEFAULT_WEIGHTS, undefined, undefined, { learnedA: { history: { hiking: -1, "dim:shared": -1 } } });
    expect(liked.score).toBeGreaterThan(base);
    expect(disliked.score).toBeLessThan(base);
    expect(computeMatch([sig("interest", "chess")], [sig("interest", "wild-swimming")], DEFAULT_WEIGHTS, undefined, undefined, { learnedA: { feedback: { chess: 1 } } }).score).toBe(0);
    const off = { ...DEFAULT_WEIGHTS, factors: { history: 0, feedback: 0 } };
    expect(computeMatch(hiking, hiking, off, undefined, undefined, { learnedA: { feedback: { hiking: 1 }, history: { hiking: 1 } } }).score).toBe(base);
  });

  it("explains a feedback-based nudge only to the member it is about", () => {
    const m = computeMatch(hiking, hiking, DEFAULT_WEIGHTS, undefined, undefined, { learnedA: { feedback: { hiking: 0.8 } } });
    const r = m.reasons.find((x) => /enjoyed meeting/.test(x.text))!;
    expect(r.text).toBe("Like people you've enjoyed meeting before through hiking");
    expect(r.textB).toBe("");
  });
});

const connectPair = async (a: string, b: string) => {
  const m = (await listMatches(a)).find((x) => x.member.id === b)!;
  await respondToIntroduction(b, await requestIntroduction(a, m.id), "approved");
  return (await listConnections(a)).find((c) => c.member.id === b)!.id;
};

describe("How did it go? feedback", () => {
  it(
    "asks after a few days, stays private, and re-asks later if not met yet",
    inDb(async (db) => {
      const opts = { interests: ["hiking", "coffee"], postcode: "BS3" };
      const a = await makeMember("Ann", opts);
      const b = await makeMember("Bea", opts);
      const c = await makeMember("Cy", opts);
      await runNetwork();
      const conn = await connectPair(a, b);
      expect(await pendingFeedback(a)).toEqual([]); // too soon
      await db.run("UPDATE connections SET created_at = ?", [new Date(Date.now() - 4 * 86400000).toISOString()]);
      const [p] = await pendingFeedback(a);
      expect(p.member?.name).toBe("Bea");

      await expect(giveFeedback(c, "connection", conn, "yes", "great")).rejects.toThrow(/your own/);
      await expect(giveFeedback(a, "connection", conn, "yes", null)).rejects.toThrow(/how it went/);

      await giveFeedback(a, "connection", conn, "not_yet", null);
      expect(await pendingFeedback(a)).toEqual([]);
      await db.run("UPDATE meeting_feedback SET updated_at = ?", [new Date(Date.now() - 8 * 86400000).toISOString()]);
      expect((await pendingFeedback(a))[0].askedBefore).toBe(true);

      await giveFeedback(a, "connection", conn, "yes", "not_for_me");
      expect(await pendingFeedback(a)).toEqual([]);
      // Bea is never told, and nothing about it reaches her data or the admin's member list.
      expect(await pendingFeedback(b)).toHaveLength(1);
      expect(JSON.stringify(await exportUserData(b))).not.toContain("not_for_me");
      expect(JSON.stringify(await exportUserData(a))).toContain("not_for_me");
      const admin = await makeMember("Admin");
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
      expect(JSON.stringify(await listUsers(admin))).not.toContain("not_for_me");
      expect(JSON.stringify(await overview(admin))).not.toContain("not_for_me");
      expect(await feedbackSummary()).toMatchObject({ met: 1, notForMe: 1 });
    }),
  );

  it(
    "covers gatherings people actually went to",
    inDb(async (db) => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) ids.push(await makeMember(`W${i}x`, { interests: ["hiking"], postcode: "BS3", free: ["weekend_mornings"] }));
      await proposeGatherings();
      const g = (await listGatherings(ids[0]))[0];
      for (const u of ids) await respondToGathering(u, g.id, true);
      expect(await pendingFeedback(ids[0])).toEqual([]);
      await db.run("UPDATE gatherings SET starts_at = ?", [new Date(Date.now() - 3600000).toISOString()]);
      const [p] = await pendingFeedback(ids[0]);
      expect(p.subjectType).toBe("gathering");
      await giveFeedback(ids[0], "gathering", g.id, "yes", "great");
      expect((await learnedPreferences()).get(ids[0])?.feedback?.hiking).toBeGreaterThan(0);
    }),
  );
});

describe("learning from responses", () => {
  it(
    "learns what a member tends to accept or dismiss, and lets it shape their suggestions",
    inDb(async (db) => {
      const me = await makeMember("Me", { interests: ["hiking", "board-games"], postcode: "BS3" });
      const hikers: string[] = [];
      const gamers: string[] = [];
      for (let i = 0; i < 3; i++) hikers.push(await makeMember(`Hiker${i}x`, { interests: ["hiking"], postcode: "BS3" }));
      for (let i = 0; i < 3; i++) gamers.push(await makeMember(`Gamer${i}x`, { interests: ["board-games"], postcode: "BS3" }));
      await runNetwork();
      const before = await listMatches(me);
      const scoreOf = (list: typeof before, id: string) => list.find((m) => m.member.id === id)!.score;
      expect(scoreOf(before, hikers[2])).toBe(scoreOf(before, gamers[2]));

      // Say yes to two hikers, no to two gamers.
      for (const h of hikers.slice(0, 2)) await requestIntroduction(me, before.find((m) => m.member.id === h)!.id);
      for (const g of gamers.slice(0, 2)) await setMatchState(me, before.find((m) => m.member.id === g)!.id, "dismissed");
      const learned = (await learnedPreferences()).get(me)!;
      expect(learned.history!.hiking).toBeGreaterThan(0);
      expect(learned.history!["board-games"]).toBeLessThan(0);

      await runNetwork();
      const after = await listMatches(me);
      expect(scoreOf(after, hikers[2])).toBeGreaterThan(scoreOf(after, gamers[2]));
      const mine = await myLearning(me);
      expect(mine.likes).toContain("hiking");
      expect(mine.lessLikely).toContain("board games");
      // Nobody else can read what was learned about me.
      expect(JSON.stringify(await exportUserData(hikers[0]))).not.toMatch(/history|lessLikely/);
      expect(Object.keys(await db.get("SELECT * FROM matches LIMIT 1") as object)).not.toContain("learned");
    }),
  );
});
