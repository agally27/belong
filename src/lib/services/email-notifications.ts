import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb, json, now, uid } from "../db";
import { env } from "../config";
import { getEmailProvider } from "../adapters/notifications";
import { AppError, audit } from "./core";

/**
 * Optional notification emails.
 *
 * - Opt-in only: nothing is emailed until a member chooses categories.
 * - Only to confirmed email addresses of active members.
 * - Content is the same privacy-light text as the in-app notification —
 *   never message text, memories, or anything about other members beyond that.
 * - Queued in `email_outbox` inside the same transaction as the event, then sent
 *   afterwards (see flushEmailOutbox), so rolled-back actions never send.
 * - Every email has a one-click unsubscribe link and List-Unsubscribe headers.
 */
export const EMAIL_CATEGORIES = {
  introductions: { label: "Introductions", hint: "Someone would like to be introduced, or you're now connected.", types: ["introduction", "connection"] },
  messages: { label: "New messages", hint: "At most one email an hour, and never the message itself.", types: ["message"] },
  gatherings: { label: "Get-togethers and events", hint: "Suggestions, confirmations, changes and day-before reminders.", types: ["gathering", "event"] },
  circles: { label: "Circles", hint: "Joining, new members and changes to your Circles.", types: ["circle"] },
  suggestions: { label: "New suggestions", hint: "When your companion notices someone you might get along with.", types: ["match"] },
} as const;

export type EmailCategory = keyof typeof EMAIL_CATEGORIES;
export type Frequency = "instant" | "daily";
const CATEGORY_IDS = Object.keys(EMAIL_CATEGORIES) as EmailCategory[];

export const categoryFor = (type: string): EmailCategory | null =>
  CATEGORY_IDS.find((c) => (EMAIL_CATEGORIES[c].types as readonly string[]).includes(type)) ?? null;

/** Minimum gap between instant emails in the same category, in minutes. */
const THROTTLE_MINUTES: Record<EmailCategory, number> = { introductions: 5, messages: 60, gatherings: 5, circles: 30, suggestions: 360 };
const MAX_ATTEMPTS = 3;

export interface EmailPreferences {
  categories: EmailCategory[];
  frequency: Frequency;
}

export async function getEmailPreferences(userId: string): Promise<EmailPreferences> {
  const db = await getDb();
  const row = await db.get<{ categories: string; frequency: string }>("SELECT categories, frequency FROM email_preferences WHERE user_id = ?", [userId]);
  return {
    categories: json<string[]>(row?.categories, []).filter((c): c is EmailCategory => CATEGORY_IDS.includes(c as EmailCategory)),
    frequency: row?.frequency === "daily" ? "daily" : "instant",
  };
}

export async function setEmailPreferences(userId: string, prefs: { categories: string[]; frequency: string }) {
  if (prefs.categories.some((c) => !CATEGORY_IDS.includes(c as EmailCategory))) throw new AppError("Unknown email category.");
  const categories = [...new Set(prefs.categories)] as EmailCategory[];
  const frequency: Frequency = prefs.frequency === "daily" ? "daily" : "instant";
  const db = await getDb();
  await db.run(
    `INSERT INTO email_preferences (user_id, categories, frequency, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET categories = excluded.categories, frequency = excluded.frequency, updated_at = excluded.updated_at`,
    [userId, JSON.stringify(categories), frequency, now()],
  );
  await audit(userId, "email.preferences_updated", "user", userId, { categories, frequency });
}

/** Called by notify() for every in-app notification. Queues an instant email if the member asked for one. */
export async function enqueueNotificationEmail(userId: string, type: string, title: string, body: string, href?: string) {
  const category = categoryFor(type);
  if (!category) return;
  const prefs = await getEmailPreferences(userId);
  if (prefs.frequency !== "instant" || !prefs.categories.includes(category)) return;
  const db = await getDb();
  const user = await db.get<{ status: string; email_verified_at: string | null }>("SELECT status, email_verified_at FROM users WHERE id = ?", [userId]);
  if (!user || user.status !== "active" || !user.email_verified_at) return;
  const since = new Date(Date.now() - THROTTLE_MINUTES[category] * 60000).toISOString();
  const recent = await db.get("SELECT 1 AS x FROM email_outbox WHERE user_id = ? AND category = ? AND kind = 'instant' AND status != 'failed' AND created_at > ?", [userId, category, since]);
  if (recent) return; // they'll see the rest in the app
  await db.run(
    "INSERT INTO email_outbox (id, user_id, kind, category, subject, body, href, status, attempts, created_at) VALUES (?, ?, 'instant', ?, ?, ?, ?, 'pending', 0, ?)",
    [uid(), userId, category, title, body, href ?? null, now()],
  );
}

/* ------------------------------ unsubscribe ------------------------------ */

/** Signing key for unsubscribe links: generated once and kept in the database (never sent to browsers). */
async function signingKey(): Promise<Buffer> {
  const db = await getDb();
  const row = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'email_signing_key'");
  if (row) return Buffer.from(row.value, "hex");
  const key = randomBytes(32).toString("hex");
  await db.run("INSERT INTO app_settings (key, value, updated_at) VALUES ('email_signing_key', ?, ?) ON CONFLICT (key) DO NOTHING", [key, now()]);
  const stored = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'email_signing_key'");
  return Buffer.from(stored!.value, "hex");
}

/** A link that unsubscribes one member from one category ("all" for every category) without signing in. */
export async function unsubscribeToken(userId: string, category: EmailCategory | "all"): Promise<string> {
  const payload = `${userId}.${category}`;
  const sig = createHmac("sha256", await signingKey()).update(payload).digest("base64url").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export async function readUnsubscribeToken(token: string): Promise<{ userId: string; category: EmailCategory | "all" } | null> {
  let decoded: string;
  try {
    decoded = Buffer.from(String(token ?? ""), "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [userId, category, sig] = decoded.split(".");
  if (!userId || !category || !sig || (category !== "all" && !CATEGORY_IDS.includes(category as EmailCategory))) return null;
  const expected = createHmac("sha256", await signingKey()).update(`${userId}.${category}`).digest("base64url").slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, category: category as EmailCategory | "all" };
}

/** Applies an unsubscribe link. Returns what was turned off, or null if the link isn't valid. */
export async function unsubscribe(token: string): Promise<{ category: EmailCategory | "all" } | null> {
  const t = await readUnsubscribeToken(token);
  if (!t) return null;
  const db = await getDb();
  if (!(await db.get("SELECT 1 AS x FROM users WHERE id = ?", [t.userId]))) return null;
  const prefs = await getEmailPreferences(t.userId);
  await setEmailPreferences(t.userId, { categories: t.category === "all" ? [] : prefs.categories.filter((c) => c !== t.category), frequency: prefs.frequency });
  await db.run("UPDATE email_outbox SET status = 'skipped' WHERE user_id = ? AND status = 'pending'" + (t.category === "all" ? "" : " AND category = ?"), t.category === "all" ? [t.userId] : [t.userId, t.category]);
  await audit(t.userId, "email.unsubscribed", "user", t.userId, { category: t.category });
  return { category: t.category };
}

/* -------------------------------- sending -------------------------------- */

async function compose(userId: string, category: EmailCategory | "all", subject: string, body: string, href: string | null) {
  const db = await getDb();
  const user = await db.get<{ email: string; status: string; email_verified_at: string | null; display_name: string | null }>(
    "SELECT u.email, u.status, u.email_verified_at, p.display_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?",
    [userId],
  );
  if (!user || user.status !== "active" || !user.email_verified_at) return null;
  const base = env.appUrl();
  const token = await unsubscribeToken(userId, category);
  const unsubscribeUrl = `${base}/email/unsubscribe?token=${token}`;
  const what = category === "all" ? "a daily summary of your BELONG notifications" : `emails about ${EMAIL_CATEGORIES[category].label.toLowerCase()}`;
  const text = [
    `Hello ${user.display_name?.split(" ")[0] ?? "there"},`,
    "",
    body,
    "",
    href ? `Open BELONG: ${base}${href}` : `Open BELONG: ${base}/dashboard`,
    "",
    "—",
    `You're getting this because you asked for ${what}.`,
    `Choose what we email you: ${base}/settings/notifications`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
  return {
    to: user.email,
    subject,
    text,
    headers: {
      "List-Unsubscribe": `<${base}/api/email/unsubscribe?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** Sends pending emails. Safe to call often and from several places (each row is claimed before sending). */
export async function flushEmailOutbox(limit = 25): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = await getDb();
  const rows = await db.all<{ id: string; user_id: string; kind: string; category: string; subject: string; body: string; href: string | null; attempts: number }>(
    "SELECT id, user_id, kind, category, subject, body, href, attempts FROM email_outbox WHERE status = 'pending' ORDER BY created_at LIMIT ?",
    [limit],
  );
  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const r of rows) {
    // Claim the row so a concurrent flush can't send it too.
    const claimed = await db.tx(async () => {
      const cur = await db.get<{ status: string }>("SELECT status FROM email_outbox WHERE id = ?", [r.id]);
      if (cur?.status !== "pending") return false;
      await db.run("UPDATE email_outbox SET status = 'sending', attempts = attempts + 1 WHERE id = ?", [r.id]);
      return true;
    });
    if (!claimed) continue;
    const msg = await compose(r.user_id, (r.kind === "digest" ? "all" : r.category) as EmailCategory | "all", r.subject, r.body, r.href);
    if (!msg) {
      await db.run("UPDATE email_outbox SET status = 'skipped' WHERE id = ?", [r.id]);
      result.skipped++;
      continue;
    }
    try {
      await getEmailProvider().send(msg);
      await db.run("UPDATE email_outbox SET status = 'sent', sent_at = ?, error = NULL WHERE id = ?", [now(), r.id]);
      result.sent++;
    } catch (e) {
      const giveUp = Number(r.attempts) + 1 >= MAX_ATTEMPTS;
      await db.run("UPDATE email_outbox SET status = ?, error = ? WHERE id = ?", [giveUp ? "failed" : "pending", String(e).slice(0, 300), r.id]);
      if (giveUp) result.failed++;
      console.error("[belong:email] send failed", e);
    }
  }
  return result;
}

/**
 * Daily summaries for members who chose "once a day". Built from their unread
 * in-app notifications in the chosen categories since the last summary.
 * Run from the scheduled network job; sends at most one per member per ~20 hours.
 */
export async function queueDailyDigests(): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 20 * 3600000).toISOString();
  const members = await db.all<{ user_id: string; categories: string; last_digest_at: string | null }>(
    `SELECT e.user_id, e.categories, e.last_digest_at FROM email_preferences e JOIN users u ON u.id = e.user_id
     WHERE e.frequency = 'daily' AND e.categories != '[]' AND u.status = 'active' AND u.email_verified_at IS NOT NULL
       AND (e.last_digest_at IS NULL OR e.last_digest_at <= ?)`,
    [cutoff],
  );
  let queued = 0;
  for (const m of members) {
    const cats = json<string[]>(m.categories, []).filter((c): c is EmailCategory => CATEGORY_IDS.includes(c as EmailCategory));
    const types = cats.flatMap((c) => EMAIL_CATEGORIES[c].types as readonly string[]);
    const since = m.last_digest_at ?? new Date(Date.now() - 86400000).toISOString();
    const items = types.length
      ? await db.all<{ title: string; body: string }>(
          `SELECT title, body FROM notifications WHERE user_id = ? AND read_at IS NULL AND created_at > ? AND type IN (${types.map(() => "?").join(", ")}) ORDER BY created_at DESC LIMIT 20`,
          [m.user_id, since, ...types],
        )
      : [];
    await db.tx(async () => {
      await db.run("UPDATE email_preferences SET last_digest_at = ? WHERE user_id = ?", [now(), m.user_id]);
      if (!items.length) return;
      const lines = items.map((i) => `• ${i.title}${i.body ? ` — ${i.body}` : ""}`);
      await db.run(
        "INSERT INTO email_outbox (id, user_id, kind, category, subject, body, href, status, attempts, created_at) VALUES (?, ?, 'digest', 'all', ?, ?, '/notifications', 'pending', 0, ?)",
        [uid(), m.user_id, items.length === 1 ? `Today on BELONG: ${items[0].title}` : `Today on BELONG: ${items.length} updates`, `Here's what happened since your last summary:\n\n${lines.join("\n")}`, now()],
      );
      queued++;
    });
  }
  return queued;
}
