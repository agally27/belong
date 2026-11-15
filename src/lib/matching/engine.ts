import { distanceBand, milesBetween, type Point } from "../geo";
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
  | "collaboration"
  | "availability";

export interface MatchSignal {
  kind: SignalKind;
  topic: string;
  label: string;
  strength: number;
  temporary: boolean;
  expiresAt?: string | null;
}

/**
 * Practical-fit factor strengths: 0 switches a factor off, 1 is the default
 * effect, 2 doubles it. Kept as strengths (not raw percentages) so they stay
 * understandable in the admin console.
 */
export interface FactorStrengths {
  distance: number;
  rarity: number;
  style: number;
  timing: number;
  mutuals: number;
  /** Learned from how each member has responded to past suggestions. */
  history: number;
  /** "How did it go?" feedback after meeting. */
  feedback: number;
}

export interface MatchWeights {
  shared: number;
  moments: number;
  complementary: number;
  threshold: number;
  factors?: Partial<FactorStrengths>;
}

export const DEFAULT_FACTORS: FactorStrengths = { distance: 1, rarity: 1, style: 1, timing: 1, mutuals: 1, history: 1, feedback: 1 };
export const DEFAULT_WEIGHTS: MatchWeights = { shared: 0.4, moments: 0.35, complementary: 0.25, threshold: 22, factors: DEFAULT_FACTORS };

export const factorsOf = (w: MatchWeights): FactorStrengths => ({ ...DEFAULT_FACTORS, ...(w.factors ?? {}) });

export type Dimension = "shared" | "moments" | "complementary";
/** "context" reasons explain the practical fit (distance, timing, style, people in common). They adjust the score but are not a dimension. */
export type ReasonKind = Dimension | "context";

/** Coarse, consented context about one member. Never more precise than a postcode district. */
export interface MemberContext {
  point?: Point | null;
  radiusMiles?: number;
  onlineOk?: boolean;
}

export interface MatchOptions {
  a?: MemberContext;
  b?: MemberContext;
  /** Rarity weight for a topic: > 1 for unusual interests, < 1 for very common ones. */
  rarity?: (topic: string) => number;
  /** Number of connections the two members have in common (only counted with consent). */
  mutuals?: number;
}

export interface MatchContextResult {
  /** Approximate distance between district centres, if both shared an area. */
  miles: number | null;
  /** Outside each other's travel radius, matched only because both are open to online. */
  remote: boolean;
  /** -1 (clashing) … 1 (very similar) social style. */
  style: number;
  sharedSlots: string[];
  mutuals: number;
  /** Combined multiplier applied to the three-dimension score. */
  multiplier: number;
}

export interface MatchReason {
  dimension: ReasonKind;
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
  context: MatchContextResult;
}

const DURABLE: SignalKind[] = ["interest", "experience"];
export const SLOT_LABEL: Record<string, string> = {
  weekday_mornings: "weekday mornings",
  weekday_afternoons: "weekday afternoons",
  weekday_evenings: "weekday evenings",
  weekend_mornings: "weekend mornings",
  weekend_afternoons: "weekend afternoons",
  weekend_evenings: "weekend evenings",
};
const ENERGY = ["quiet-evening", "easy-going", "high-energy"];
const NO_CONTEXT: MatchContextResult = { miles: null, remote: false, style: 0, sharedSlots: [], mutuals: 0, multiplier: 1 };
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
  options: MatchOptions = {},
): MatchResult {
  const A = liveSignals(rawA, at);
  const B = liveSignals(rawB, at);
  const rarityStrength = factorsOf(weights).rarity;
  const rar = (topic: string) => 1 + rarityStrength * (Math.max(0.6, Math.min(1.6, options.rarity?.(topic) ?? 1)) - 1);

  // Hard filter first: people who could never practically meet are not suggested at all.
  let miles: number | null = null;
  let remote = false;
  const pa = options.a?.point;
  const pb = options.b?.point;
  if (pa && pb) {
    miles = milesBetween(pa, pb);
    const reach = Math.min(options.a?.radiusMiles ?? 10, options.b?.radiusMiles ?? 10);
    if (miles > reach) {
      if (!(options.a?.onlineOk && options.b?.onlineOk)) {
        return { score: 0, dimensions: { shared: 0, moments: 0, complementary: 0 }, reasons: [], topics: [], context: { ...NO_CONTEXT, miles } };
      }
      remote = true;
    }
  }
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
    best *= rar(a.topic);
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
        const w = sim * Math.min(a.strength, b.strength) * rar(a.topic);
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
        const w = 0.4 * Math.min(l.strength, d.strength) * rar(l.topic);
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
  const base = Math.min(1, blended * 1.45);
  reasons.sort((x, y) => y.weight - x.weight);
  const main = reasons.slice(0, 5);
  const topics = [...new Set(main.flatMap((r) => r.topics))];
  if (!main.length) return { score: 0, dimensions, reasons: [], topics: [], context: { ...NO_CONTEXT, miles, remote } };

  // Practical fit. These never create a match on their own — they nudge a real one up or down.
  const extra: MatchReason[] = [];
  const ctx = (text: string, textB = text) => extra.push({ dimension: "context", topics: [], text, textB, weight: 0 });
  let multiplier = 1;
  const k = factorsOf(weights);

  // Distance: nearer is easier. Wording stays vague on purpose.
  if (miles !== null) {
    if (remote) {
      multiplier *= Math.max(0.2, 1 - 0.2 * k.distance);
      ctx("You live further apart, but you're both open to connecting online");
    } else {
      const reach = Math.min(options.a?.radiusMiles ?? 10, options.b?.radiusMiles ?? 10);
      multiplier *= 1 + 0.15 * k.distance * (1 - miles / Math.max(reach, 1));
      ctx(`You're ${distanceBand(miles)}`);
    }
  }

  // Social style: similar group size and pace help; energy can differ by a step, but opposite ends rarely click one-to-one.
  const styleOf = (s: MatchSignal[]) => s.filter((x) => x.kind === "personality").map((x) => x.topic.replace(/^p:/, ""));
  const sa = styleOf(A);
  const sb = styleOf(B);
  let style = 0;
  if (sa.length && sb.length) {
    const sharedStyles = sa.filter((x) => sb.includes(x) && !ENERGY.includes(x));
    style += 0.4 * sharedStyles.length;
    const ea = ENERGY.indexOf(sa.find((x) => ENERGY.includes(x)) ?? "");
    const eb = ENERGY.indexOf(sb.find((x) => ENERGY.includes(x)) ?? "");
    if (ea >= 0 && eb >= 0) style += ea === eb ? 0.2 : Math.abs(ea - eb) === 1 ? 0.1 : -0.4;
    if (sa.includes("one-to-one") !== sb.includes("one-to-one") && (sa.includes("big-gathering") || sb.includes("big-gathering"))) style -= 0.3;
    style = Math.max(-1, Math.min(1, style));
    multiplier *= Math.max(0.2, 1 + 0.12 * k.style * style);
    if (sharedStyles.length) ctx(`You're both ${sharedStyles[0]} people`);
  }

  // Timing: overlapping free time makes meeting realistic.
  const slotsOf = (s: MatchSignal[]) => s.filter((x) => x.kind === "availability").map((x) => x.topic.replace(/^a:/, ""));
  const la = slotsOf(A);
  const lb = slotsOf(B);
  const sharedSlots = la.filter((x) => lb.includes(x));
  if (la.length && lb.length) {
    multiplier *= sharedSlots.length ? 1 + k.timing * Math.min(0.12, 0.05 * sharedSlots.length) : Math.max(0.2, 1 - 0.15 * k.timing);
    if (sharedSlots.length) ctx(`You're both usually free on ${SLOT_LABEL[sharedSlots[0]] ?? sharedSlots[0]}`);
  }

  // People in common: a friend of a friend is an easier first hello.
  const mutuals = Math.max(0, options.mutuals ?? 0);
  if (mutuals) multiplier *= 1 + k.mutuals * Math.min(0.15, 0.08 * mutuals);

  const score = Math.round(Math.min(1, base * multiplier) * 100);
  return {
    score,
    dimensions,
    reasons: [...main, ...extra],
    topics,
    context: { miles, remote, style: round(style), sharedSlots, mutuals, multiplier: round(multiplier) },
  };
}

/** Reason text for the viewing member (A or B of the pair). */
export function reasonTexts(reasons: MatchReason[], viewerIsA: boolean): string[] {
  return reasons.map((r) => (viewerIsA ? r.text : r.textB));
}

const round = (n: number) => Math.round(n * 100) / 100;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
