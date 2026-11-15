import { createHash, randomBytes } from "node:crypto";
import { getDb, now } from "../db";
import { env } from "../config";
import { emailConfigured, getEmailProvider } from "../adapters/notifications";
import { AppError, audit } from "./core";
import { credentialsSchema, hashPassword } from "./auth";

/**
 * Email verification and password reset.
 *
 * - Tokens are 32 random bytes, sent once by email and stored only as a SHA-256 hash.
 * - Each is single-use and short-lived (reset: 1 hour, verify: 48 hours).
 * - Reset requests never reveal whether an account exists.
 */
type Purpose = "reset" | "verify";
const TTL_HOURS: Record<Purpose, number> = { reset: 1, verify: 48 };
const MAX_PER_HOUR = 3;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Whether members must confirm their email before contacting other people.
 * On when real email is configured, and in demo mode (where links appear in the
 * development outbox). Off otherwise, so nobody is locked out by an email that
 * could never arrive.
 */
export const verificationRequired = () => emailConfigured() || env.demoMode();

async function issue(userId: string, purpose: Purpose): Promise<string | null> {
  const db = await getDb();
  const recent = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM auth_tokens WHERE user_id = ? AND purpose = ? AND created_at > ?", [
    userId,
    purpose,
    new Date(Date.now() - 3600000).toISOString(),
  ]);
  if (Number(recent?.n ?? 0) >= MAX_PER_HOUR) return null; // quietly throttled
  const token = randomBytes(32).toString("base64url");
  await db.run("INSERT INTO auth_tokens (id, user_id, purpose, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)", [
    hash(token),
    userId,
    purpose,
    new Date(Date.now() + TTL_HOURS[purpose] * 3600000).toISOString(),
    now(),
  ]);
  return token;
}

/** Looks up a live token and marks it used. Returns the user id, or null. */
async function consume(token: string, purpose: Purpose): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const db = await getDb();
  return db.tx(async () => {
    const row = await db.get<{ user_id: string; expires_at: string; used_at: string | null; purpose: string }>("SELECT user_id, expires_at, used_at, purpose FROM auth_tokens WHERE id = ?", [hash(token)]);
    if (!row || row.purpose !== purpose || row.used_at || row.expires_at <= now()) return null;
    await db.run("UPDATE auth_tokens SET used_at = ? WHERE id = ?", [now(), hash(token)]);
    return row.user_id;
  });
}

const link = (path: string, token: string) => `${env.appUrl()}${path}?token=${encodeURIComponent(token)}`;

export async function sendVerificationEmail(userId: string): Promise<boolean> {
  const db = await getDb();
  const user = await db.get<{ email: string; email_verified_at: string | null; display_name: string | null }>(
    "SELECT u.email, u.email_verified_at, p.display_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?",
    [userId],
  );
  if (!user || user.email_verified_at) return false;
  const token = await issue(userId, "verify");
  if (!token) throw new AppError("We've sent a few links already. Please check your inbox (and spam), or try again in an hour.", "limit");
  await getEmailProvider().send({
    to: user.email,
    subject: "Confirm your email for BELONG",
    text: `Hello ${user.display_name?.split(" ")[0] ?? "there"},\n\nPlease confirm your email address so you can start meeting people on BELONG:\n\n${link("/verify-email", token)}\n\nThis link works once and expires in 48 hours. If you didn't create a BELONG account, you can ignore this email.\n\n— BELONG`,
  });
  return true;
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consume(token, "verify");
  if (!userId) return false;
  const db = await getDb();
  await db.run("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [now(), userId]);
  await audit(userId, "user.email_verified", "user", userId);
  return true;
}

export async function isVerified(userId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.get<{ email_verified_at: string | null }>("SELECT email_verified_at FROM users WHERE id = ?", [userId]);
  return Boolean(row?.email_verified_at);
}

/** Guard for anything that reaches another person (introductions, Circles, gatherings). */
export async function assertVerified(userId: string) {
  if (!verificationRequired() || (await isVerified(userId))) return;
  throw new AppError("Please confirm your email address first — we've sent you a link. You can send a new one from Settings.", "forbidden");
}

/** Always succeeds from the caller's point of view, so it can't be used to discover accounts. */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!email) return;
  const db = await getDb();
  const user = await db.get<{ id: string; status: string }>("SELECT id, status FROM users WHERE email = ?", [email]);
  if (!user || user.status !== "active") return;
  const token = await issue(user.id, "reset");
  if (!token) return;
  await getEmailProvider().send({
    to: email,
    subject: "Reset your BELONG password",
    text: `Someone (hopefully you) asked to reset the password for this BELONG account.\n\nChoose a new password here:\n\n${link("/reset-password", token)}\n\nThis link works once and expires in an hour. If you didn't ask for this, you can ignore this email — your password won't change.\n\n— BELONG`,
  });
  await audit(user.id, "user.password_reset_requested", "user", user.id);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const parsed = credentialsSchema.shape.password.safeParse(password);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const userId = await consume(token, "reset");
  if (!userId) throw new AppError("This link has expired or has already been used. Please ask for a new one.", "invalid");
  const db = await getDb();
  await db.tx(async () => {
    await db.run("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [await hashPassword(password), now(), userId]);
    // Sign out everywhere, and retire any other reset links.
    await db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
    await db.run("UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'reset' AND used_at IS NULL", [now(), userId]);
  });
  await audit(userId, "user.password_reset", "user", userId);
}

