/**
 * Integration points for services the owner will configure later.
 * Each has a safe local default so the app runs without credentials.
 */

/** Embeddings — upgrades the taxonomy matcher to true semantic matching. */
export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Returns null locally; the matching engine then uses the built-in taxonomy matcher. */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  // Integration point: when EMBEDDINGS_API_KEY is set, return a provider (e.g. Voyage AI)
  // and feed its vectors to embeddingMatcher() in src/lib/matching/semantic.ts.
  return null;
}

/** Maps — BELONG only ever works with named areas, never coordinates. */
export interface MapsProvider {
  readonly name: string;
  /** Approximate distance between two named areas, or null if unknown. */
  distanceKm(areaA: string, areaB: string): Promise<number | null>;
}

const sameAreaMaps: MapsProvider = {
  name: "area-name",
  async distanceKm(a, b) {
    return a.trim().toLowerCase() === b.trim().toLowerCase() ? 0 : null;
  },
};

export function getMapsProvider(): MapsProvider {
  // Integration point: geocode area names server-side when MAPS_API_KEY is set.
  return sameAreaMaps;
}

/** File storage — for future profile photos. Avatars are generated locally today. */
export interface StorageProvider {
  readonly name: string;
  upload(key: string, data: Uint8Array, contentType: string): Promise<string>;
}

export function getStorageProvider(): StorageProvider | null {
  // Integration point: Supabase Storage / S3 when STORAGE_BUCKET is set.
  return null;
}
