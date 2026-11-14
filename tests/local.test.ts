import { describe, expect, it } from "vitest";
import { inDb, makeMember } from "./helpers";
import { districtPoint, distanceBand, milesBetween, toDistrict } from "@/lib/geo";
import { computeMatch, type MatchSignal } from "@/lib/matching/engine";
import { setConsent } from "@/lib/services/core";
import { getGatherings } from "./local.helpers";
import { gatheringToCircle, nextSlotDate, proposeGatherings, respondToGathering, simulateDemoGathering, sweepGatherings } from "@/lib/services/gatherings";
import { requestIntroduction, respondToIntroduction } from "@/lib/services/introductions";
import { getMessages, listConversations, sendMessage } from "@/lib/services/messaging";
import { listMatches, runNetwork } from "@/lib/services/network";
import { getProfile } from "@/lib/services/profile";
import { blockUser } from "@/lib/services/safety";
import { listMySignals, syncSignals } from "@/lib/services/signals";
import { getCircle } from "@/lib/services/circles";

const sig = (kind: MatchSignal["kind"], topic: string): MatchSignal => ({ kind, topic, label: topic, strength: 0.8, temporary: false, expiresAt: null });
const BS3 = districtPoint("BS3")!;
const BS5 = districtPoint("BS5")!;
const LS1 = districtPoint("LS1")!;
const both = [sig("interest", "hiking"), sig("interest", "coffee")];
const opt = (a: object, b: object, extra: object = {}) => [undefined, undefined, undefined, { a, b, ...extra }] as const;

describe("coarse geography", () => {
  it("keeps only the postcode district", () => {
    expect(toDistrict("bs3 1ab")).toBe("BS3");
    expect(toDistrict("BS31AB")).toBe("BS3");
    expect(toDistrict("sw1a 1aa")).toBe("SW1A");
    expect(toDistrict("bs3")).toBe("BS3");
    expect(toDistrict("not a postcode")).toBeNull();
  });

  it("measures distance and describes it vaguely", () => {
    expect(milesBetween(BS3, BS5)).toBeGreaterThan(1);
    expect(milesBetween(BS3, BS5)).toBeLessThan(5);
    expect(milesBetween(BS3, LS1)).toBeGreaterThan(150);
    expect(distanceBand(2.7)).toBe("a few miles away");
    expect(distanceBand(2.7)).not.toMatch(/\d\.\d/);
  });
});

describe("engine: practical fit", () => {
  it("never suggests people outside either person's travel distance", () => {
    const far = computeMatch(both, both, ...opt({ point: BS3, radiusMiles: 10 }, { point: LS1, radiusMiles: 50 }));
    expect(far.score).toBe(0);
    expect(far.reasons).toEqual([]);
  });

  it("allows distant matches only when both are open to online, and scores them lower", () => {
    const near = computeMatch(both, both, ...opt({ point: BS3, radiusMiles: 10 }, { point: BS5, radiusMiles: 10 }));
    const remote = computeMatch(both, both, ...opt({ point: BS3, radiusMiles: 10, onlineOk: true }, { point: LS1, radiusMiles: 10, onlineOk: true }));
    const oneSided = computeMatch(both, both, ...opt({ point: BS3, radiusMiles: 10, onlineOk: true }, { point: LS1, radiusMiles: 10 }));
    expect(remote.context.remote).toBe(true);
    expect(remote.score).toBeGreaterThan(0);
    expect(remote.score).toBeLessThan(near.score);
    expect(oneSided.score).toBe(0);
  });

  it("prefers nearer people and says so without a precise figure", () => {
    const close = computeMatch(both, both, ...opt({ point: BS3, radiusMiles: 10 }, { point: BS3, radiusMiles: 10 }));
    const further = computeMatch(both, both, ...opt({ point: BS3, radiusMiles: 10 }, { point: districtPoint("BA1")!, radiusMiles: 25 }));
    expect(close.score).toBeGreaterThanOrEqual(further.score);
    expect(close.reasons.some((r) => r.dimension === "context" && r.text === "You're very close by")).toBe(true);
  });

  it("treats members who haven't shared an area neutrally", () => {
    const m = computeMatch(both, both, ...opt({ point: null }, { point: BS3 }));
    expect(m.context.miles).toBeNull();
    expect(m.score).toBe(computeMatch(both, both).score);
  });

  it("weights rare shared interests above common ones", () => {
    const rare = computeMatch([sig("interest", "birdwatching")], [sig("interest", "birdwatching")], undefined, undefined, undefined, { rarity: () => 1.3 });
    const common = computeMatch([sig("interest", "coffee")], [sig("interest", "coffee")], undefined, undefined, undefined, { rarity: () => 0.65 });
    expect(rare.score).toBeGreaterThan(common.score);
  });

  it("rewards compatible social styles and overlapping free time, and penalises clashes", () => {
    const base = computeMatch(both, both).score;
    const p = (...t: string[]) => t.map((x) => sig("personality", `p:${x}`));
    const a = (...t: string[]) => t.map((x) => sig("availability", `a:${x}`));
    const similar = computeMatch([...both, ...p("small-group", "quiet-evening")], [...both, ...p("small-group", "easy-going")]);
    const clash = computeMatch([...both, ...p("one-to-one", "quiet-evening")], [...both, ...p("big-gathering", "high-energy")]);
    expect(similar.score).toBeGreaterThan(base);
    expect(clash.score).toBeLessThan(base);
    expect(similar.reasons.some((r) => r.text === "You're both small-group people")).toBe(true);
    const sameTime = computeMatch([...both, ...a("weekend_mornings")], [...both, ...a("weekend_mornings", "weekday_evenings")]);
    const neverFree = computeMatch([...both, ...a("weekend_mornings")], [...both, ...a("weekday_evenings")]);
    expect(sameTime.score).toBeGreaterThan(base);
    expect(neverFree.score).toBeLessThan(base);
    expect(sameTime.reasons.some((r) => /weekend mornings/.test(r.text))).toBe(true);
  });

  it("style, timing and mutual friends never create a match by themselves", () => {
    const only = computeMatch([sig("personality", "p:small-group"), sig("availability", "a:weekend_mornings")], [sig("personality", "p:small-group"), sig("availability", "a:weekend_mornings")], undefined, undefined, undefined, { mutuals: 3 });
    expect(only.score).toBe(0);
    expect(computeMatch(both, both, undefined, undefined, undefined, { mutuals: 2 }).score).toBeGreaterThan(computeMatch(both, both).score);
  });
});

describe("local matching in the network", () => {
  it(
    "stores only the district, and matches within reach",
    inDb(async (db) => {
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"], postcode: "BS3 1AB", radius: 10 });
      const near = await makeMember("Bea", { interests: ["hiking", "coffee"], postcode: "BS5", radius: 10 });
      await makeMember("Leeds Lee", { interests: ["hiking", "coffee"], postcode: "LS1", radius: 50 });
      expect((await getProfile(a))!.district).toBe("BS3");
      expect(JSON.stringify(await db.all("SELECT * FROM profiles"))).not.toContain("1AB");
      await runNetwork();
      const matches = await listMatches(a);
      expect(matches.map((m) => m.member.id)).toEqual([near]);
      expect(matches[0].reasons.some((r) => r.dimension === "context" && /miles away|close by/.test(r.text))).toBe(true);
      // The other member's district is never exposed.
      expect(JSON.stringify(matches)).not.toContain("BS5");
    }),
  );

  it(
    "ignores location for members who withdraw area consent",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"], postcode: "BS3" });
      const far = await makeMember("Lee", { interests: ["hiking", "coffee"], postcode: "LS1" });
      await runNetwork();
      expect(await listMatches(a)).toEqual([]);
      await setConsent(far, "share_area", false);
      await runNetwork();
      expect((await listMatches(a)).length).toBe(1);
      expect((await listMatches(a))[0].reasons.some((r) => /away|close by/.test(r.text))).toBe(false);
    }),
  );

  it(
    "rejects unknown postcodes and shares availability only with consent",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking"], postcode: "BS3", free: ["weekend_mornings"] });
      expect((await listMySignals(a)).some((s) => s.kind === "availability")).toBe(true);
      await setConsent(a, "share_availability", false);
      await syncSignals(a);
      expect((await listMySignals(a)).some((s) => s.kind === "availability")).toBe(false);
      await expect(makeMember("Bad", { postcode: "ZZ99" })).rejects.toThrow(/recognise/);
    }),
  );
});

describe("friends of friends", () => {
  const trio = async () => {
    const opts = { interests: ["hiking", "coffee"], postcode: "BS3" };
    const a = await makeMember("Ann", opts);
    const friend = await makeMember("Fay", opts);
    const b = await makeMember("Bea", opts);
    await runNetwork();
    for (const x of [a, b]) {
      const m = (await listMatches(x)).find((y) => y.member.id === friend)!;
      await respondToIntroduction(friend, await requestIntroduction(x, m.id), "approved");
    }
    await runNetwork();
    return { a, b, friend };
  };

  it(
    "names a mutual connection only when all three allow it",
    inDb(async () => {
      const { a, b, friend } = await trio();
      let m = (await listMatches(a)).find((x) => x.member.id === b)!;
      expect(m.mutuals).toEqual(["Fay"]);
      expect(m.reasons.some((r) => r.text === "You both know Fay")).toBe(true);

      await setConsent(friend, "mutual_connections", false);
      m = (await listMatches(a)).find((x) => x.member.id === b)!;
      expect(m.mutuals).toEqual([]);
      expect(m.mutualCount).toBe(1);
      expect(m.reasons.some((r) => r.text === "You have a connection in common")).toBe(true);
      expect(JSON.stringify(m)).not.toContain("Fay");

      await setConsent(b, "mutual_connections", false);
      m = (await listMatches(a)).find((x) => x.member.id === b)!;
      expect(m.mutualCount).toBe(0);
      expect(m.reasons.some((r) => /in common|both know/.test(r.text))).toBe(false);
    }),
  );

  it(
    "gives a friend-of-a-friend a higher score than a stranger",
    inDb(async () => {
      const { a, b } = await trio();
      const stranger = await makeMember("Sam", { interests: ["hiking", "coffee"], postcode: "BS3" });
      await runNetwork();
      const matches = await listMatches(a);
      const score = (id: string) => matches.find((m) => m.member.id === id)!.score;
      expect(score(b)).toBeGreaterThanOrEqual(score(stranger));
      expect(matches.find((m) => m.member.id === b)!.mutualCount).toBe(1);
    }),
  );
});

describe("companion-proposed gatherings", () => {
  const walkers = async (n = 4, extra: object = {}) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push(await makeMember(`Walker${i}`, { interests: ["hiking"], postcode: i % 2 ? "BS3" : "BS4", free: ["weekend_mornings", "weekday_evenings"], energy: ["quiet", "balanced", "lively"][i % 3], ...extra }));
    return ids;
  };

  it("picks the next date for a slot with notice", () => {
    const d = nextSlotDate("weekend_mornings", new Date("2026-11-16T12:00:00Z")); // a Monday
    expect([0, 6]).toContain(d.getUTCDay());
    expect(d.getUTCHours()).toBe(10);
    expect(d.getTime() - Date.parse("2026-11-16T12:00:00Z")).toBeGreaterThanOrEqual(3 * 86400000);
    expect([2, 3, 4]).toContain(nextSlotDate("weekday_evenings", new Date("2026-11-13T12:00:00Z")).getUTCDay());
  });

  it(
    "proposes a gathering, hides who is invited, and confirms only with enough yeses",
    inDb(async () => {
      const [a, b, c, d] = await walkers(4);
      expect(await proposeGatherings()).toBe(1);
      expect(await proposeGatherings()).toBe(0); // no duplicates while one is open
      let mine = (await getGatherings(a))[0];
      expect(mine.invited).toBe(4);
      expect(mine.members).toEqual([]);
      expect(mine.conversationId).toBeNull();
      expect(JSON.stringify(mine)).not.toMatch(/Walker[123]/);
      expect(mine.slotLabel).toMatch(/weekend mornings|weekday evenings/);

      expect((await respondToGathering(a, mine.id, true)).status).toBe("proposed");
      expect((await respondToGathering(b, mine.id, true)).status).toBe("proposed");
      expect((await getGatherings(a))[0].members).toEqual([]); // still hidden
      expect(await listConversations(a)).toEqual([]);
      expect((await respondToGathering(c, mine.id, true)).status).toBe("confirmed");

      mine = (await getGatherings(a))[0];
      expect(mine.status).toBe("confirmed");
      expect(mine.members.map((m) => m.name).sort()).toEqual(["Walker1", "Walker2"]);
      await sendMessage(a, mine.conversationId!, "See you Saturday!");
      // Invited but hasn't said yes: sees no names and cannot read the chat.
      const pending = (await getGatherings(d))[0];
      expect(pending.members).toEqual([]);
      await expect(getMessages(d, mine.conversationId!)).rejects.toThrow();

      // A drop-out below the minimum pauses it again.
      expect((await respondToGathering(c, mine.id, false)).status).toBe("proposed");
      await expect(getMessages(c, mine.conversationId!)).rejects.toThrow();
      expect((await respondToGathering(d, mine.id, true)).status).toBe("confirmed");
    }),
  );

  it(
    "respects consent, one-to-one preference, distance, free time and blocks",
    inDb(async () => {
      const [a, b] = await walkers(2);
      const optedOut = await makeMember("OptOut", { interests: ["hiking"], postcode: "BS3", free: ["weekend_mornings"], consents: ["matching_enabled", "share_interests", "share_area", "share_availability"] });
      await makeMember("Solo", { interests: ["hiking"], postcode: "BS3", free: ["weekend_mornings"], group: "one_to_one" });
      await makeMember("Leeds", { interests: ["hiking"], postcode: "LS1", free: ["weekend_mornings"] });
      await makeMember("Busy", { interests: ["hiking"], postcode: "BS3", free: [] });
      await makeMember("NoArea", { interests: ["hiking"], free: ["weekend_mornings"] });
      expect(await proposeGatherings()).toBe(0); // only two eligible people
      expect(await getGatherings(optedOut)).toEqual([]);
      const c = await makeMember("Third", { interests: ["hiking"], postcode: "BS3", free: ["weekend_mornings"] });
      await blockUser(c, a);
      expect(await proposeGatherings()).toBe(0); // the third has blocked one of them
      const d = await makeMember("Fourth", { interests: ["hiking"], postcode: "BS4", free: ["weekend_mornings"] });
      expect(await proposeGatherings()).toBe(1);
      const invited = [a, b, c, d].filter(async () => true);
      const counts = await Promise.all(invited.map(async (u) => (await getGatherings(u)).length));
      expect(counts.reduce((x, y) => x + y, 0)).toBe(3); // never both the blocker and the blocked
    }),
  );

  it(
    "lapses quietly without enough interest, and becomes a Circle when it worked",
    inDb(async (db) => {
      const [a, b, c] = await walkers(3);
      await proposeGatherings();
      const g = (await getGatherings(a))[0];
      await expect(gatheringToCircle(a, g.id, "Too soon")).rejects.toThrow();
      for (const u of [a, b, c]) await respondToGathering(u, g.id, true);
      const outsider = await makeMember("Outsider");
      await expect(respondToGathering(outsider, g.id, true)).rejects.toThrow();
      await expect(simulateDemoGathering(a, g.id)).rejects.toThrow(); // nobody fictional here
      const circleId = await gatheringToCircle(a, g.id, "Sunday Striders");
      const circle = (await getCircle(b, circleId))!;
      expect(circle.name).toBe("Sunday Striders");
      expect(circle.members.length).toBe(3);
      expect(await gatheringToCircle(b, g.id, "Again")).toBe(circleId);

      // A second proposal on another topic that nobody answers.
      const more = [];
      for (let i = 0; i < 3; i++) more.push(await makeMember(`Chess${i}`, { interests: ["chess"], postcode: "BS3", free: ["weekday_evenings"] }));
      await proposeGatherings();
      const idle = (await getGatherings(more[0]))[0];
      await db.run("UPDATE gatherings SET respond_by = ? WHERE id = ?", [new Date(Date.now() - 1000).toISOString(), idle.id]);
      await sweepGatherings();
      expect(await getGatherings(more[0])).toEqual([]);
      await expect(respondToGathering(more[0], idle.id, true)).rejects.toThrow(/no longer open/);
    }),
  );
});
