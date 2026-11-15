import { describe, expect, it } from "vitest";
import { inDb, makeMember } from "./helpers";
import { computeMatch, DEFAULT_WEIGHTS, type MatchSignal } from "@/lib/matching/engine";
import { districtPoint } from "@/lib/geo";
import { cancelGatheringAdmin, getWeightsAdmin, listGatheringsAdmin, setWeights } from "@/lib/services/admin";
import { gatheringToCircle, listGatherings, nextSlotDate, proposeGatherings, respondToGathering } from "@/lib/services/gatherings";
import { createCircle } from "@/lib/services/circles";
import { listNotifications } from "@/lib/services/account";
import { getCircle } from "@/lib/services/circles";

const sig = (kind: MatchSignal["kind"], topic: string): MatchSignal => ({ kind, topic, label: topic, strength: 0.8, temporary: false, expiresAt: null });
const both = [sig("interest", "hiking"), sig("interest", "coffee"), sig("availability", "a:weekend_mornings")];
const ctx = { a: { point: districtPoint("BS3"), radiusMiles: 10 }, b: { point: districtPoint("BS3"), radiusMiles: 10 }, mutuals: 2 };

describe("adjustable practical-fit factors", () => {
  it("switching every factor off leaves just the three dimensions", () => {
    const off = { ...DEFAULT_WEIGHTS, factors: { distance: 0, rarity: 0, style: 0, timing: 0, mutuals: 0 } };
    const plain = computeMatch([sig("interest", "hiking"), sig("interest", "coffee")], [sig("interest", "hiking"), sig("interest", "coffee")], off);
    expect(computeMatch(both, both, off, undefined, undefined, { ...ctx, rarity: () => 1.5 }).score).toBe(plain.score);
  });

  it("stronger factors move the score further, and defaults match the original behaviour", () => {
    const at = (n: number) => computeMatch(both, both, { ...DEFAULT_WEIGHTS, factors: { distance: n, timing: n, mutuals: n } }, undefined, undefined, ctx).score;
    expect(at(2)).toBeGreaterThan(at(1));
    expect(at(1)).toBeGreaterThan(at(0));
    expect(computeMatch(both, both, DEFAULT_WEIGHTS, undefined, undefined, ctx).score).toBe(at(1));
  });

  it(
    "are saved, validated and fall back to defaults",
    inDb(async (db) => {
      const admin = await makeMember("Admin");
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
      expect((await getWeightsAdmin(admin)).factors?.distance).toBe(1);
      await setWeights(admin, { ...DEFAULT_WEIGHTS, factors: { distance: 2, mutuals: 0 } });
      const w = await getWeightsAdmin(admin);
      expect(w.factors).toMatchObject({ distance: 2, mutuals: 0, timing: 1 });
      await expect(setWeights(admin, { ...DEFAULT_WEIGHTS, factors: { style: 5 } })).rejects.toThrow(/between 0/);
    }),
  );
});

describe("gathering dates follow UK time", () => {
  it("keeps a 10am slot at 10am in London in both winter and summer", () => {
    const london = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(d);
    const winter = nextSlotDate("weekend_mornings", new Date("2026-11-16T12:00:00Z"));
    const summer = nextSlotDate("weekend_mornings", new Date("2026-07-06T12:00:00Z"));
    expect(london(winter)).toBe("10");
    expect(london(summer)).toBe("10");
    expect(summer.getUTCHours()).toBe(9);
    expect(london(nextSlotDate("weekday_evenings", new Date("2026-06-01T12:00:00Z")))).toBe("19");
  });
});

describe("gatherings: allowances and administration", () => {
  const walkers = async (n: number) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push(await makeMember(`Walker${i}`, { interests: ["hiking"], postcode: "BS3", free: ["weekend_mornings"] }));
    return ids;
  };

  it(
    "turning a gathering into a Circle respects each person's Circle allowance",
    inDb(async () => {
      const [a, b, c] = await walkers(3);
      await proposeGatherings();
      const g = (await listGatherings(a))[0];
      for (const u of [a, b, c]) await respondToGathering(u, g.id, true);
      // c is already in a Circle; the free plan allows one.
      await createCircle(c, { name: "Elsewhere", topic: "chess", capacity: 4 });
      const id = await gatheringToCircle(a, g.id, "Sunday Striders");
      const circle = (await getCircle(a, id))!;
      expect(circle.members.map((m) => m.name).sort()).toEqual(["Walker0", "Walker1"]);
      expect((await listNotifications(c)).some((n) => /allowance is full/.test(n.body))).toBe(true);
    }),
  );

  it(
    "won't let someone with no Circle room create one from a gathering",
    inDb(async () => {
      const [a, b, c] = await walkers(3);
      await proposeGatherings();
      const g = (await listGatherings(a))[0];
      for (const u of [a, b, c]) await respondToGathering(u, g.id, true);
      await createCircle(a, { name: "Mine already", topic: "chess", capacity: 4 });
      await expect(gatheringToCircle(a, g.id, "Nope")).rejects.toThrow(/allowance is full/);
    }),
  );

  it(
    "admins see counts (not invitees) and can cancel an upcoming gathering",
    inDb(async (db) => {
      const admin = await makeMember("Admin");
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
      const [a] = await walkers(3);
      await proposeGatherings();
      const { rows } = await listGatheringsAdmin(admin);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].invited)).toBe(3);
      expect(JSON.stringify(rows)).not.toMatch(/Walker/);
      await expect(listGatheringsAdmin(a)).rejects.toThrow(/Administrator/);
      await cancelGatheringAdmin(admin, rows[0].id);
      expect(await listGatherings(a)).toEqual([]);
      expect((await listNotifications(a)).some((n) => /^Cancelled/.test(n.title))).toBe(true);
      await expect(cancelGatheringAdmin(admin, rows[0].id)).rejects.toThrow(/upcoming/);
    }),
  );
});
