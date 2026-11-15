import { describe, expect, it } from "vitest";
import { computeMatch, DEFAULT_WEIGHTS, liveSignals, reasonTexts, type MatchSignal } from "@/lib/matching/engine";
import { areComplementary, embeddingMatcher, taxonomyMatcher } from "@/lib/matching/semantic";
import { extractTopics, TOPIC_LIST, TOPICS } from "@/lib/matching/topics";

const sig = (kind: MatchSignal["kind"], topic: string, extra: Partial<MatchSignal> = {}): MatchSignal => ({
  kind,
  topic,
  label: topic,
  strength: 0.8,
  temporary: kind === "intention" || kind === "moment" || kind === "collaboration",
  expiresAt: null,
  ...extra,
});

describe("topic taxonomy", () => {
  it("has unique ids and valid cross-references", () => {
    expect(new Set(TOPIC_LIST.map((t) => t.id)).size).toBe(TOPIC_LIST.length);
    for (const t of TOPIC_LIST) {
      for (const ref of [...(t.related ?? []), ...(t.complements ?? [])]) expect(TOPICS[ref], `${t.id} -> ${ref}`).toBeDefined();
    }
  });

  it("extracts topics from natural language", () => {
    expect(extractTopics("I love hiking and taking photographs")).toEqual(expect.arrayContaining(["hiking", "photography"]));
    expect(extractTopics("Anyone fancy a board game this weekend?")).toContain("board-games");
    expect(extractTopics("I just moved here and don't know anyone")).toContain("new-in-town");
    expect(extractTopics("Nothing relevant here at all")).toEqual([]);
  });

  it("does not match keywords inside other words", () => {
    expect(extractTopics("I work in a film studio car park")).not.toContain("camping");
    expect(extractTopics("The dogma of it all")).not.toContain("dogs");
  });
});

describe("semantic matcher", () => {
  it("scores identical, related and unrelated topics", () => {
    expect(taxonomyMatcher.similarity("hiking", "hiking")).toBe(1);
    expect(taxonomyMatcher.similarity("hiking", "wild-swimming")).toBe(0.5);
    expect(taxonomyMatcher.similarity("hiking", "chess")).toBe(0);
    expect(areComplementary("photography", "hiking")).toBe(true);
    expect(areComplementary("hiking", "hiking")).toBe(false);
  });

  it("supports embedding vectors with taxonomy fallback", () => {
    const m = embeddingMatcher({ hiking: [1, 0], chess: [1, 0] });
    expect(m.similarity("hiking", "chess")).toBeCloseTo(1);
    expect(m.similarity("hiking", "wild-swimming")).toBe(0.5);
  });
});

describe("matching engine", () => {
  it("dimension 1: finds shared interests", () => {
    const m = computeMatch([sig("interest", "hiking"), sig("interest", "coffee")], [sig("interest", "hiking"), sig("interest", "coffee")]);
    expect(m.dimensions.shared).toBeGreaterThan(0.5);
    expect(m.dimensions.moments).toBe(0);
    expect(m.reasons.some((r) => r.dimension === "shared" && r.text === "You both love hiking")).toBe(true);
  });

  it("dimension 2: finds shared moments from temporary signals", () => {
    const m = computeMatch([sig("moment", "board-games")], [sig("moment", "board-games")]);
    expect(m.dimensions.moments).toBeGreaterThan(0.5);
    expect(m.reasons[0].dimension).toBe("moments");
    expect(m.score).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.threshold);
  });

  it("dimension 3: finds complementary offers and needs, phrased for each side", () => {
    const m = computeMatch([sig("offer", "guitar")], [sig("seek", "guitar")]);
    expect(m.dimensions.complementary).toBeGreaterThan(0.5);
    expect(reasonTexts(m.reasons, true)[0]).toMatch(/^You can share guitar/);
    expect(reasonTexts(m.reasons, false)[0]).toMatch(/^They can share guitar/);
  });

  it("dimension 3: pairs naturally complementary interests", () => {
    const m = computeMatch([sig("interest", "photography")], [sig("interest", "hiking")]);
    expect(m.reasons.some((r) => r.dimension === "complementary")).toBe(true);
  });

  it("scores unrelated people at zero", () => {
    const m = computeMatch([sig("interest", "chess")], [sig("interest", "wild-swimming")]);
    expect(m.score).toBe(0);
    expect(m.reasons).toEqual([]);
  });

  it("ignores expired temporary signals", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const a = [sig("moment", "hiking", { expiresAt: past })];
    expect(liveSignals(a)).toEqual([]);
    expect(computeMatch(a, [sig("moment", "hiking")]).score).toBe(0);
  });

  it("is symmetric in score", () => {
    const a = [sig("interest", "hiking"), sig("offer", "guitar"), sig("moment", "coffee")];
    const b = [sig("interest", "hiking"), sig("seek", "guitar"), sig("interest", "coffee")];
    expect(computeMatch(a, b).score).toBe(computeMatch(b, a).score);
  });

  it("respects configurable weights", () => {
    const a = [sig("interest", "hiking"), sig("moment", "coffee")];
    const b = [sig("interest", "hiking"), sig("moment", "coffee")];
    const sharedOnly = computeMatch(a, b, { shared: 1, moments: 0, complementary: 0, threshold: 0 });
    const momentsOnly = computeMatch(a, b, { shared: 0, moments: 1, complementary: 0, threshold: 0 });
    expect(sharedOnly.score).not.toBe(momentsOnly.score);
  });

  it("stays within 0–100 for heavily overlapping members", () => {
    const many = TOPIC_LIST.slice(0, 20).map((t) => sig("interest", t.id));
    const m = computeMatch(many, many);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(m.reasons.length).toBeLessThanOrEqual(6);
  });
});

describe("simulated companion: negation", () => {
  it("separates liked from disliked topics by clause", async () => {
    const { positiveTopics } = await import("@/lib/ai/mock");
    expect(positiveTopics("I don't like hiking")).toEqual({ liked: [], disliked: ["hiking"] });
    expect(positiveTopics("I love board games but I hate running")).toEqual({ liked: ["board-games"], disliked: ["running"] });
    expect(positiveTopics("Not really into yoga. Pottery is my thing though!")).toEqual({ liked: ["pottery"], disliked: ["yoga"] });
    expect(positiveTopics("I can't stand cooking, never have")).toEqual({ liked: [], disliked: ["cooking"] });
    expect(positiveTopics("I really enjoy cycling")).toEqual({ liked: ["cycling"], disliked: [] });
  });

  it("never proposes memories or intentions for things the member dislikes", async () => {
    const { mockCompanionReply } = await import("@/lib/ai/mock");
    const base = { companionName: "Sol", tone: "warm", proactivity: "balanced", memberName: "Ann", interests: [], memories: [], intentions: [], history: [], waitingSuggestions: 0, waitingIntroductions: 0, canProposeMemories: true };
    const r1 = mockCompanionReply({ ...base, message: "I don't like hiking at all" });
    expect(r1.memories).toEqual([]);
    expect(r1.intention).toBeNull();
    expect(r1.text).toMatch(/isn't for you/);
    expect(r1.text).not.toMatch(/lovely/);
    const r2 = mockCompanionReply({ ...base, message: "I love pottery but I hate running. I'd love to find someone to do pottery with this weekend" });
    expect(r2.memories.map((m) => m.content).join(" ")).not.toMatch(/running/);
    expect(r2.intention?.title).toMatch(/pottery/i);
  });
});
