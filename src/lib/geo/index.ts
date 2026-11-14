import outcodes from "./outcodes.json";

/**
 * Coarse UK geography. BELONG works at postcode-DISTRICT level only ("BS3"),
 * using each district's published centre point. A full postcode typed by a
 * member is reduced to its district before anything is stored.
 * Data: UK postcode districts with centroids (derived from ONS / Ordnance
 * Survey open data, via github.com/academe/UK-Postcodes).
 */
const DISTRICTS = outcodes as unknown as Record<string, [number, number]>;

export interface Point {
  lat: number;
  lng: number;
}

/** "bs3 1ab", "BS31AB" or "bs3" → "BS3". Returns null when it isn't a known UK district. */
export function toDistrict(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw) return null;
  // A full postcode ends with digit + two letters (the inward code): drop it.
  const candidates = /\d[A-Z]{2}$/.test(raw) && raw.length >= 5 ? [raw.slice(0, -3), raw] : [raw];
  for (const c of candidates) if (DISTRICTS[c]) return c;
  return null;
}

export function districtPoint(district: string | null | undefined): Point | null {
  const p = district ? DISTRICTS[district] : undefined;
  return p ? { lat: p[0], lng: p[1] } : null;
}

/** Great-circle distance in miles. */
export function milesBetween(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Deliberately vague wording — never a precise figure. */
export function distanceBand(miles: number): string {
  if (miles < 1.5) return "very close by";
  if (miles < 4) return "a few miles away";
  if (miles < 10) return "under 10 miles away";
  if (miles < 25) return "under 25 miles away";
  return "further afield";
}

export const RADIUS_OPTIONS = [2, 5, 10, 25, 50] as const;
