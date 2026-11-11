import { getDb, json } from "../db";
import { isBlockedPair } from "./core";

/**
 * What one member may see of another. This is deliberately small: a first
 * name, general area, the bio and interests they chose to put on their
 * profile. Never memories, companion chats, email or exact location.
 */
export interface MemberPreview {
  id: string;
  name: string;
  area: string | null;
  bio: string | null;
  pronouns: string | null;
  hue: number;
  interests: string[];
  isDemo: boolean;
}

type Row = {
  user_id: string;
  display_name: string;
  area: string | null;
  bio: string | null;
  pronouns: string | null;
  hue: number;
  interests: string;
  is_demo: number;
  status: string;
};

const toPreview = (r: Row): MemberPreview => ({
  id: r.user_id,
  name: r.display_name.split(" ")[0],
  area: r.area,
  bio: r.bio,
  pronouns: r.pronouns,
  hue: Number(r.hue),
  interests: json<string[]>(r.interests, []),
  isDemo: Boolean(r.is_demo),
});

const SELECT =
  "SELECT p.user_id, p.display_name, p.area, p.bio, p.pronouns, p.hue, p.interests, u.is_demo, u.status FROM profiles p JOIN users u ON u.id = p.user_id";

/** Internal: previews for ids the caller is already entitled to see. */
export async function previewsById(ids: string[]): Promise<Map<string, MemberPreview>> {
  const out = new Map<string, MemberPreview>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const db = await getDb();
  const rows = await db.all<Row>(`${SELECT} WHERE p.user_id IN (${unique.map(() => "?").join(",")})`, unique);
  for (const r of rows) out.set(r.user_id, toPreview(r));
  return out;
}

export type Relationship = "self" | "connected" | "introduction" | "suggested" | "circle" | "none";

export async function relationship(viewerId: string, targetId: string): Promise<Relationship> {
  if (viewerId === targetId) return "self";
  const db = await getDb();
  const both = [viewerId, targetId, targetId, viewerId];
  if (await db.get("SELECT 1 AS x FROM connections WHERE status = 'active' AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))", both)) return "connected";
  if (await db.get("SELECT 1 AS x FROM introductions WHERE status = 'pending' AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))", both)) return "introduction";
  if (await db.get("SELECT 1 AS x FROM matches WHERE status = 'suggested' AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))", both)) return "suggested";
  if (
    await db.get(
      "SELECT 1 AS x FROM circle_members a JOIN circle_members b ON a.circle_id = b.circle_id WHERE a.user_id = ? AND b.user_id = ?",
      [viewerId, targetId],
    )
  )
    return "circle";
  return "none";
}

/**
 * Server-side permission check for viewing another member. Returns null when
 * the viewer has no relationship with them, or either has blocked the other.
 */
export async function getMemberPreview(
  viewerId: string,
  targetId: string,
): Promise<(MemberPreview & { relationship: Relationship }) | null> {
  const rel = await relationship(viewerId, targetId);
  if (rel === "none") return null;
  if (rel !== "self" && (await isBlockedPair(viewerId, targetId))) return null;
  const db = await getDb();
  const row = await db.get<Row>(`${SELECT} WHERE p.user_id = ?`, [targetId]);
  if (!row || row.status !== "active") return null;
  return { ...toPreview(row), relationship: rel };
}
