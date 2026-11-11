import { areComplementary, taxonomyMatcher, type SemanticMatcher } from "./semantic";
import { topicLabel } from "./topics";

/**
 * BELONG matching engine — pure, deterministic and independent of any AI API.
 * Its ONLY input is approved connection signals. It never sees memories,
 * companion conversations or profile text.
 */
export type SignalKind =
  | "interest"
  | "experience"
  | "personality"
  | "intention"
  | "moment"
  | "offer"
  | "seek"
  | "collaboration";

export interface MatchSignal {
  kind: SignalKind;
  topic: string;
  label: string;
  strength: number;
  temporary: boolean;
  expiresAt?: string | null;
}

export interface MatchWeights {
  shared: number;
  moments: number;
  complementary: number;
  threshold: number;
}

export const DEFAULT_WEIGHTS: MatchWeights = { shared: 0.4, moments: 0.35, complementary: 0.25, threshold: 22 };

export type Dimension = "shared" | "moments" | "complementary";

export interface MatchReason {
  dimension: Dimension;
  topics: string[];
  /** Phrasing from member A's point of view, e.g. "You both love hiking". */
  text: string;
  /** The same reason from member B's point of view. */
  textB: string;
  weight: number;
}

export interface MatchResult {
  score: number;
  dimensions: Record<Dimension, number>;
  reasons: MatchReason[];
  topics: string[];
}

const DURABLE: SignalKind[] = ["interest", "experience", "personality"];
const LIVE: SignalKind[] = ["intention", "moment"];

/** Drops expired signals. Callers must already have applied consent rules. */
export function liveSignals(signals: MatchSignal[], at = new Date()): MatchSignal[] {
  const iso = at.toISOString();
  return signals.filter((s) => !s.expiresAt || s.expiresAt > iso);
}

const saturate = (x: number, k: number) => 1 - Math.exp(-x / k);

export function computeMatch(
  rawA: MatchSignal[],
  rawB: MatchSignal[],
  weights: MatchWeights = DEFAULT_WEIGHTS,
  matcher: SemanticMatcher = taxonomyMatcher,
  at = new Date(),
): MatchResult {
  const A = liveSignals(rawA, at);
  const B = liveSignals(rawB, at);
  const reasons: MatchReason[] = [];
  const seen = new Set<string>();
  const add = (r0: Omit<MatchReason, "textB"> & { textB?: string }) => {
    const r: MatchReason = { ...r0, textB: r0.textB ?? r0.text };
    const key = `${r.dimension}:${[...r.topics].sort().join("+")}`;
    if (seen.has(key)) return;
    seen.add(key);
    reasons.push(r);
  };

  // 1. Shared interests — durable signals on the same or closely related topics.
  let shared = 0;
  const dA = A.filter((s) => DURABLE.includes(s.kind));
  const dB = B.filter((s) => DURABLE.includes(s.kind));
  const usedB = new Set<number>();
  for (const a of dA) {
    let best = 0;
    let bestIdx = -1;
    dB.forEach((b, i) => {
      if (usedB.has(i)) return;
      const sim = matcher.similarity(a.topic, b.topic) * Math.min(a.strength, b.strength);
      if (sim > best) {
        best = sim;
        bestIdx = i;
      }
    });
    if (bestIdx < 0 || best < 0.2) continue;
    usedB.add(bestIdx);
    shared += best;
    const b = dB[bestIdx];
    if (a.topic === b.topic) {
      const text =
        a.kind === "personality"
          ? `You're both ${topicLabel(a.topic)} people`
          : a.kind === "experience" && b.kind === "experience"
            ? `You've both been through ${a.label}`
            : `You both love ${topicLabel(a.topic)}`;
      add({ dimension: "shared", topics: [a.topic], text, weight: best });
    } else if (best >= 0.3) {
      add({
        dimension: "shared",
        topics: [a.topic, b.topic],
        text: `${cap(topicLabel(a.topic))} and ${topicLabel(b.topic)} — neighbouring passions`,
        weight: best,
      });
    }
  }

  // 2. Shared moments — what both people are hoping for right now.
  let moments = 0;
  const lA = A.filter((s) => LIVE.includes(s.kind));
  const lB = B.filter((s) => LIVE.includes(s.kind));
  for (const a of lA) {
    for (const b of lB) {
      const sim = matcher.similarity(a.topic, b.topic);
      if (sim >= 0.5) {
        const w = sim * Math.min(a.strength, b.strength);
        moments += w;
        add({
          dimension: "moments",
          topics: a.topic === b.topic ? [a.topic] : [a.topic, b.topic],
          text:
            a.topic === b.topic
              ? `Right now you're both looking for ${topicLabel(a.topic)} company`
              : `Your current plans overlap: ${topicLabel(a.topic)} and ${topicLabel(b.topic)}`,
          textB:
            a.topic === b.topic ? undefined : `Your current plans overlap: ${topicLabel(b.topic)} and ${topicLabel(a.topic)}`,
          weight: w,
        });
      }
    }
  }
  const liveVsDurable = (live: MatchSignal[], durable: MatchSignal[], liveIsA: boolean) => {
    for (const l of live) {
      for (const d of durable) {
        if (l.topic !== d.topic || d.kind === "personality") continue;
        const w = 0.4 * Math.min(l.strength, d.strength);
        moments += w;
        const mine = `You're looking for ${topicLabel(l.topic)} company right now — it's one of their lasting interests`;
        const theirs = `They're looking for ${topicLabel(l.topic)} company right now — it's one of your lasting interests`;
        add({
          dimension: "moments",
          topics: [l.topic],
          text: liveIsA ? mine : theirs,
          textB: liveIsA ? theirs : mine,
          weight: w,
        });
      }
    }
  };
  liveVsDurable(lA, dB, true);
  liveVsDurable(lB, dA, false);

  // 3. Complementary interests — offers meeting needs, and skills that pair well.
  let complementary = 0;
  const pairUp = (givers: MatchSignal[], seekers: MatchSignal[], giverIsA: boolean) => {
    for (const o of givers.filter((s) => s.kind === "offer")) {
      for (const k of seekers.filter((s) => s.kind === "seek")) {
        const sim = matcher.similarity(o.topic, k.topic);
        if (sim < 0.5) continue;
        const w = sim * Math.min(o.strength, k.strength);
        complementary += w;
        const give = `You can share ${topicLabel(o.topic)} — they're hoping to learn`;
        const get = `They can share ${topicLabel(o.topic)} — something you're hoping to learn`;
        add({
          dimension: "complementary",
          topics: [o.topic],
          text: giverIsA ? give : get,
          textB: giverIsA ? get : give,
          weight: w,
        });
      }
    }
  };
  pairUp(A, B, true);
  pairUp(B, A, false);
  const cA = A.filter((s) => s.kind === "collaboration");
  const cB = B.filter((s) => s.kind === "collaboration");
  for (const a of cA) {
    for (const b of cB) {
      const sim = Math.max(matcher.similarity(a.topic, b.topic), areComplementary(a.topic, b.topic) ? 0.9 : 0);
      if (sim < 0.5) continue;
      const w = sim * Math.min(a.strength, b.strength);
      complementary += w;
      add({
        dimension: "complementary",
        topics: a.topic === b.topic ? [a.topic] : [a.topic, b.topic],
        text:
          a.topic === b.topic
            ? `You're both open to collaborating on ${topicLabel(a.topic)}`
            : `A possible collaboration: your ${topicLabel(a.topic)} with their ${topicLabel(b.topic)}`,
        textB:
          a.topic === b.topic
            ? undefined
            : `A possible collaboration: your ${topicLabel(b.topic)} with their ${topicLabel(a.topic)}`,
        weight: w,
      });
    }
  }
  const interestsA = A.filter((s) => s.kind === "interest" || s.kind === "collaboration");
  const interestsB = B.filter((s) => s.kind === "interest" || s.kind === "collaboration");
  for (const a of interestsA) {
    for (const b of interestsB) {
      if (!areComplementary(a.topic, b.topic)) continue;
      if (a.kind === "collaboration" && b.kind === "collaboration") continue; // counted above
      const w = 0.5 * Math.min(a.strength, b.strength);
      complementary += w;
      add({
        dimension: "complementary",
        topics: [a.topic, b.topic],
        text: `Your ${topicLabel(a.topic)} pairs naturally with their ${topicLabel(b.topic)}`,
        textB: `Your ${topicLabel(b.topic)} pairs naturally with their ${topicLabel(a.topic)}`,
        weight: w,
      });
    }
  }

  const dimensions = {
    shared: round(saturate(shared, 1.6)),
    moments: round(saturate(moments, 0.7)),
    complementary: round(saturate(complementary, 0.8)),
  };
  const total = weights.shared + weights.moments + weights.complementary || 1;
  const blended =
    (weights.shared * dimensions.shared +
      weights.moments * dimensions.moments +
      weights.complementary * dimensions.complementary) /
    total;
  // Rescale so that a strong match in two dimensions reads as a high score.
  const score = Math.round(Math.min(1, blended * 1.45) * 100);
  reasons.sort((x, y) => y.weight - x.weight);
  const topics = [...new Set(reasons.flatMap((r) => r.topics))];
  return { score, dimensions, reasons: reasons.slice(0, 6), topics };
}

/** Reason text for the viewing member (A or B of the pair). */
export function reasonTexts(reasons: MatchReason[], viewerIsA: boolean): string[] {
  return reasons.map((r) => (viewerIsA ? r.text : r.textB));
}

const round = (n: number) => Math.round(n * 100) / 100;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
