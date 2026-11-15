import { describe, expect, it } from "vitest";
import { inDb, makeMember } from "./helpers";
import { computeMatch, DEFAULT_WEIGHTS, type MatchSignal } from "@/lib/matching/engine";
import { extractTopics, INTEREST_TOPICS, LIFE_STAGES } from "@/lib/matching/topics";
import { setConsent } from "@/lib/services/core";
import { likelyYes } from "@/lib/services/feedback";
import { createCircle, joinCircle } from "@/lib/services/circles";
import { listGatherings, proposeBridges, respondToGathering } from "@/lib/services/gatherings";
import { requestIntroduction, respondToIntroduction } from "@/lib/services/introductions";
import { listMatches, runNetwork } from "@/lib/services/network";
import { updateProfile, getProfile, type Profile } from "@/lib/services/profile";
import { blockUser } from "@/lib/services/safety";
import { listMySignals, syncSignals } from "@/lib/services/signals";
import { getMessages } from "@/lib/services/messaging";
import { seedDemo, DEMO_MEMBER_EMAIL, DEMO_PASSWORD } from "@/lib/seed";
import { login } from "@/lib/services/auth";

/** The editable parts of a profile, for re-saving it with changes. */
const keep = (p: Profile) => ({ displayName: p.displayName, interests: p.interests, personality: p.personality as never, availability: p.availability as never });
const sig = (kind: MatchSignal["kind"], topic: string): MatchSignal => ({ kind, topic, label: topic, strength: 0.8, temporary: false, expiresAt: null });

describe("life stages", () => {
  it("are offered separately from interests and recognised in conversation", () => {
    expect(INTEREST_TOPICS.some((t) => t.stage)).toBe(false);
    expect(LIFE_STAGES.map((t) => t.id)).toEqual(expect.arrayContaining(["new-in-town", "parenting", "retirement", "career-change"]));
    expect(extractTopics("I just retired last spring")).toContain("retirement");
    expect(extractTopics("We moved here in the summer")).toContain("new-in-town");
  });

  it("count for more than a shared hobby, with their own wording, and can be tuned", () => {
    const stage = computeMatch([sig("experience", "new-in-town")], [sig("experience", "new-in-town")]);
    const hobby = computeMatch([sig("interest", "chess")], [sig("interest", "chess")]);
    expect(stage.score).toBeGreaterThan(hobby.score);
    expect(stage.reasons[0].text).toBe("You're both new to the area");
    const off = computeMatch([sig("experience", "new-in-town")], [sig("experience", "new-in-town")], { ...DEFAULT_WEIGHTS, factors: { lifeStage: 0 } });
    expect(off.score).toBe(hobby.score);
  });

  it(
    "are shared only when chosen on the profile and allowed",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["coffee"], postcode: "BS3" });
      const p = (await getProfile(a))!;
      await updateProfile(a, { ...keep(p), postcode: "BS3", lifeStages: ["retirement", "hiking"] });
      expect((await getProfile(a))!.lifeStages).toEqual(["retirement"]); // not a life stage → dropped
      expect((await listMySignals(a)).some((s) => s.topic === "retirement" && s.kind === "experience")).toBe(true);
      await setConsent(a, "share_life_stage", false);
      await syncSignals(a);
      expect((await listMySignals(a)).some((s) => s.topic === "retirement")).toBe(false);
      await expect(updateProfile(a, { ...keep(p), lifeStages: ["retirement", "parenting", "studying", "remote-work"] })).rejects.toThrow(/up to three/);
    }),
  );

  it(
    "bring two newcomers together even with few hobbies in common",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["coffee"], postcode: "BS3" });
      const b = await makeMember("Bea", { interests: ["chess"], postcode: "BS3" });
      await runNetwork();
      expect(await listMatches(a)).toEqual([]);
      for (const u of [a, b]) {
        const p = (await getProfile(u))!;
        await updateProfile(u, { ...keep(p), postcode: "BS3", lifeStages: ["new-in-town"] });
      }
      await runNetwork();
      const [m] = await listMatches(a);
      expect(m.member.id).toBe(b);
      expect(m.reasons.some((r) => r.text === "You're both new to the area")).toBe(true);
    }),
  );
});

describe("reciprocity: both likely to say yes", () => {
  const pairSignals = [sig("interest", "hiking"), sig("interest", "coffee")];
  it("favours responsive pairs, uses the less likely of the two, and stays bounded and silent", () => {
    const at = (a?: number, b?: number, k = 1) => computeMatch(pairSignals, pairSignals, { ...DEFAULT_WEIGHTS, factors: { reciprocity: k } }, undefined, undefined, { likelyYesA: a, likelyYesB: b });
    const base = computeMatch(pairSignals, pairSignals).score;
    expect(at().score).toBe(base);
    expect(at(0.5, 0.5).score).toBe(base);
    expect(at(0.9, 0.9).score).toBeGreaterThan(base);
    expect(at(0.9, 0.1).score).toBeLessThan(base); // one unresponsive person drags it down
    expect(at(0.9, 0.1).score).toBe(at(0.1, 0.1).score);
    expect(at(0.9, 0.9, 0).score).toBe(base);
    expect(at(0, 0).score).toBeGreaterThanOrEqual(Math.round(base * 0.9) - 1);
    expect(JSON.stringify(at(0.1, 0.9).reasons)).not.toMatch(/respond|likely/i);
  });

  it(
    "is learned from how people answer introductions, starting neutral",
    inDb(async (db) => {
      const opts = { interests: ["hiking", "coffee"], postcode: "BS3" };
      const asker = await makeMember("Asker", opts);
      const keen = await makeMember("Keen", opts);
      const quiet = await makeMember("Quiet", opts);
      await makeMember("New", opts);
      await runNetwork();
      const matches = await listMatches(asker);
      const ask = async (id: string) => requestIntroduction(asker, matches.find((m) => m.member.id === id)!.id);
      await respondToIntroduction(keen, await ask(keen), "approved");
      await ask(quiet);
      let scores = await likelyYes();
      expect(scores.get(keen)).toBeGreaterThan(0.5);
      expect(scores.has(quiet)).toBe(false); // still within the week to answer
      await db.run("UPDATE introductions SET created_at = ? WHERE status = 'pending'", [new Date(Date.now() - 8 * 86400000).toISOString()]);
      scores = await likelyYes();
      expect(scores.get(quiet)).toBeLessThan(0.5);
      expect(scores.has(asker)).toBe(false); // asking doesn't count
    }),
  );
});

describe("bridges between friend groups", () => {
  const groups = async (topicB = "dogs") => {
    const mk = (n: string) => makeMember(n, { interests: ["hiking"], postcode: "BS3", free: ["weekend_mornings"] });
    const [h1, h2, h3] = [await mk("Hal"), await mk("Hen"), await mk("Hugo")];
    const [d1, d2, d3] = [await mk("Dot"), await mk("Dee"), await mk("Dan")];
    const walkers = await createCircle(h1, { name: "Walkers", topic: "hiking", capacity: 6 });
    for (const u of [h2, h3]) await joinCircle(u, walkers);
    const other = await createCircle(d1, { name: "Others", topic: topicB, capacity: 6 });
    for (const u of [d2, d3]) await joinCircle(u, other);
    return { side1: [h1, h2, h3], side2: [d1, d2, d3], walkers, other };
  };

  it(
    "proposes one joint get-together for nearby Circles with related interests",
    inDb(async () => {
      const { side1, side2 } = await groups("dogs");
      expect(await proposeBridges()).toBe(1);
      expect(await proposeBridges()).toBe(0); // one open bridge per Circle, and a cooldown per pair
      const g = (await listGatherings(side1[0]))[0];
      expect(g.bridge).toEqual({ mine: "Walkers", other: "Others" });
      expect((await listGatherings(side2[0]))[0].bridge).toEqual({ mine: "Others", other: "Walkers" });
      expect(g.invited).toBe(6);
      expect(g.members).toEqual([]);
      expect(g.canBecomeCircle).toBe(false);
    }),
  );

  it(
    "needs at least two yeses from EACH Circle, and keeps names hidden until then",
    inDb(async () => {
      const { side1, side2 } = await groups("hiking");
      await proposeBridges();
      const id = (await listGatherings(side1[0]))[0].id;
      for (const u of side1) expect((await respondToGathering(u, id, true)).status).toBe("proposed");
      expect((await listGatherings(side1[0]))[0].members).toEqual([]);
      expect((await respondToGathering(side2[0], id, true)).status).toBe("proposed");
      expect((await respondToGathering(side2[1], id, true)).status).toBe("confirmed");
      const g = (await listGatherings(side2[0]))[0];
      expect(g.members.length).toBe(4);
      await expect(getMessages(side2[2], g.conversationId!)).rejects.toThrow(); // hasn't said yes
      expect((await respondToGathering(side2[1], id, false)).status).toBe("proposed"); // back below two on that side
    }),
  );

  it(
    "skips Circles whose interests are unrelated",
    inDb(async () => {
      await groups("chess");
      expect(await proposeBridges()).toBe(0);
    }),
  );

  it(
    "never invites two people where one has blocked the other",
    inDb(async () => {
      const { side1, side2 } = await groups("hiking");
      await blockUser(side1[0], side2[0]);
      expect(await proposeBridges()).toBe(1);
      expect(await listGatherings(side1[0])).toEqual([]);
      expect(await listGatherings(side2[0])).toEqual([]);
      expect((await listGatherings(side1[1]))[0].invited).toBe(4);
    }),
  );

  it(
    "doesn't bridge Circles that already have someone in common",
    inDb(async () => {
      const { side1, other } = await groups("hiking");
      await setConsent(side1[2], "group_suggestions", true);
      // Hugo leaves room and joins the other Circle too (premium allows two).
      const { applyPlan } = await import("@/lib/services/subscriptions");
      await applyPlan(side1[2], "premium", "mock", null);
      await joinCircle(side1[2], other);
      expect(await proposeBridges()).toBe(0);
    }),
  );
});

describe("demo world", () => {
  it(
    "shows Alex a bridge between Sunday Walkers and Southville Dog Walkers",
    inDb(async (db) => {
      await seedDemo(db);
      const { user } = await login(DEMO_MEMBER_EMAIL, DEMO_PASSWORD);
      const bridges = (await listGatherings(user.id)).filter((g) => g.bridge);
      expect(bridges.map((b) => b.bridge)).toContainEqual({ mine: "Sunday Walkers", other: "Southville Dog Walkers" });
      expect(bridges[0].title).toMatch(/^Joint meet-up/);
      // Nobody is ever invited to two get-togethers at the same time.
      const { runNetwork } = await import("@/lib/services/network");
      await runNetwork();
      const clashes = await db.all(
        `SELECT i.user_id, g.starts_at, COUNT(*) AS n FROM gathering_invites i JOIN gatherings g ON g.id = i.gathering_id
         WHERE i.status != 'declined' AND g.status IN ('proposed', 'confirmed') GROUP BY i.user_id, g.starts_at HAVING COUNT(*) > 1`,
      );
      expect(clashes).toEqual([]);
    }),
  );
});

describe("bridges and ordinary gatherings together", () => {
  it(
    "a bridge invite doesn't use up someone's allowance of open suggestions",
    inDb(async () => {
      const mk = (n: string, interests: string[]) => makeMember(n, { interests, postcode: "BS3", free: ["weekend_mornings"] });
      const me = await mk("Me", ["hiking", "coffee", "chess"]);
      const [h2, h3] = [await mk("H2", ["hiking"]), await mk("H3", ["hiking"])];
      const [d1, d2, d3] = [await mk("D1", ["dogs"]), await mk("D2", ["dogs"]), await mk("D3", ["dogs"])];
      const c1 = await createCircle(me, { name: "Walkers", topic: "hiking", capacity: 6 });
      for (const u of [h2, h3]) await joinCircle(u, c1);
      const c2 = await createCircle(d1, { name: "Dogs", topic: "dogs", capacity: 6 });
      for (const u of [d2, d3]) await joinCircle(u, c2);
      const { proposeGatherings } = await import("@/lib/services/gatherings");
      expect(await proposeBridges()).toBe(1);
      // Two more ordinary suggestions are still possible for "Me".
      for (const n of ["C1", "C2"]) await mk(n, ["coffee"]);
      expect(await proposeGatherings()).toBeGreaterThanOrEqual(1);
      expect((await listGatherings(me)).filter((g) => !g.bridge).length).toBeGreaterThanOrEqual(1);
    }),
  );
});
