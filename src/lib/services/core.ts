import { getDb, json, now, uid } from "../db";
import { DEFAULT_WEIGHTS, type MatchWeights } from "../matching/engine";
import type { ConsentKey } from "../config";
import { CONSENTS } from "../config";

/** Error whose message is safe to show to a member. */
export class AppError extends Error {
  constructor(
    message: string,
    public code: "forbidden" | "not_found" | "invalid" | "limit" | "conflict" = "invalid",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (m = "You don't have access to that.") => new AppError(m, "forbidden");
export const notFound = (m = "We couldn't find that.") => new AppError(m, "not_found");

export async function audit(
  actorId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  meta: Record<string, unknown> = {},
) {
  const db = await getDb();
  await db.run(
    "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [uid(), actorId, action, targetType ?? null, targetId ?? null, JSON.stringify(meta), now()],
  );
}

/** First-party product analytics: counts only, and only with consent. */
export async function track(userId: string | null, name: string, props: Record<string, unknown> = {}) {
  const db = await getDb();
  let subject: string | null = null;
  if (userId) {
    if (!(await hasConsent(userId, "product_analytics"))) userId = null;
    subject = userId;
  }
  await db.run("INSERT INTO analytics_events (id, user_id, name, props, created_at) VALUES (?, ?, ?, ?, ?)", [
    uid(),
    subject,
    name,
    JSON.stringify(props),
    now(),
  ]);
}

export async function getFlags(): Promise<Record<string, boolean>> {
  const db = await getDb();
  const rows = await db.all<{ key: string; enabled: number }>("SELECT key, enabled FROM feature_flags");
  return Object.fromEntries(rows.map((r) => [r.key, Boolean(r.enabled)]));
}

export async function flag(key: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.get<{ enabled: number }>("SELECT enabled FROM feature_flags WHERE key = ?", [key]);
  return row ? Boolean(row.enabled) : false;
}

export async function getWeights(): Promise<MatchWeights> {
  const db = await getDb();
  const row = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'matching_weights'");
  const stored = json<Partial<MatchWeights>>(row?.value, {});
  return { ...DEFAULT_WEIGHTS, ...stored, factors: { ...DEFAULT_WEIGHTS.factors, ...(stored.factors ?? {}) } };
}

export async function getConsents(userId: string): Promise<Record<ConsentKey, boolean>> {
  const db = await getDb();
  const rows = await db.all<{ key: string; granted: number }>("SELECT key, granted FROM consents WHERE user_id = ?", [
    userId,
  ]);
  const stored = new Map(rows.map((r) => [r.key, Boolean(r.granted)]));
  // Anything never explicitly granted is treated as NOT granted.
  return Object.fromEntries(CONSENTS.map((c) => [c.key, stored.get(c.key) ?? false])) as Record<ConsentKey, boolean>;
}

export async function hasConsent(userId: string, key: ConsentKey): Promise<boolean> {
  const db = await getDb();
  const row = await db.get<{ granted: number }>("SELECT granted FROM consents WHERE user_id = ? AND key = ?", [
    userId,
    key,
  ]);
  return Boolean(row?.granted);
}

export async function setConsent(userId: string, key: ConsentKey, granted: boolean) {
  if (!CONSENTS.some((c) => c.key === key)) throw new AppError("Unknown consent.");
  const db = await getDb();
  await db.run(
    "INSERT INTO consents (user_id, key, granted, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET granted = excluded.granted, updated_at = excluded.updated_at",
    [userId, key, granted ? 1 : 0, now()],
  );
  await audit(userId, granted ? "consent.granted" : "consent.withdrawn", "consent", key);
}

/** Either member has blocked the other. */
export async function isBlockedPair(a: string, b: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.get(
    "SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
    [a, b, b, a],
  );
  return Boolean(row);
}

export async function notify(userId: string, type: string, title: string, body = "", href?: string) {
  const db = await getDb();
  await db.run(
    "INSERT INTO notifications (id, user_id, type, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [uid(), userId, type, title, body, href ?? null, now()],
  );
  const { deliverNotification } = await import("../adapters/notifications");
  await deliverNotification(userId, { type, title, body, href });
  // Optional email, queued in the same transaction and sent afterwards.
  const { enqueueNotificationEmail } = await import("./email-notifications");
  await enqueueNotificationEmail(userId, type, title, body, href);
}
