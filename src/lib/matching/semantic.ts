import { TOPICS } from "./topics";

/**
 * Semantic similarity between two signal topics, in [0, 1].
 * The local implementation uses the curated taxonomy. A production
 * implementation can be backed by embeddings (see adapters/embeddings.ts)
 * without changing the matching engine.
 */
export interface SemanticMatcher {
  similarity(topicA: string, topicB: string): number;
}

export const taxonomyMatcher: SemanticMatcher = {
  similarity(a, b) {
    if (a === b) return 1;
    const ta = TOPICS[a];
    const tb = TOPICS[b];
    if (!ta || !tb) return 0;
    if (ta.related?.includes(b) || tb.related?.includes(a)) return 0.5;
    if (ta.category === tb.category) return 0.25;
    return 0;
  },
};

/** True when two different topics naturally complement one another. */
export function areComplementary(a: string, b: string): boolean {
  if (a === b) return false;
  return Boolean(TOPICS[a]?.complements?.includes(b) || TOPICS[b]?.complements?.includes(a));
}

/** Builds a matcher from precomputed embedding vectors (cosine similarity). */
export function embeddingMatcher(vectors: Record<string, number[]>, fallback = taxonomyMatcher): SemanticMatcher {
  const cos = (x: number[], y: number[]) => {
    let dot = 0;
    let nx = 0;
    let ny = 0;
    for (let i = 0; i < x.length; i++) {
      dot += x[i] * y[i];
      nx += x[i] * x[i];
      ny += y[i] * y[i];
    }
    return nx && ny ? dot / Math.sqrt(nx * ny) : 0;
  };
  return {
    similarity(a, b) {
      if (a === b) return 1;
      const va = vectors[a];
      const vb = vectors[b];
      if (!va || !vb) return fallback.similarity(a, b);
      return Math.max(0, Math.min(1, cos(va, vb)));
    },
  };
}
