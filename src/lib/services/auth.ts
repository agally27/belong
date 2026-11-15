import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { getDb, inDays, now, uid } from "../db";
import { CONSENTS } from "../config";
import { AppError, audit, flag, track } from "./core";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface User {
  id: string;
  email: string;
  role: "member" | "admin";
  status: "active" | "suspended";
  isDemo: boolean;
  onboardedAt: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  status: string;
  is_demo: number;
  onboarded_at: string | null;
  email_verified_at?: string | null;
  created_at: string;
};

export const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  role: r.role as User["role"],
  status: r.status as User["status"],
  isDemo: Boolean(r.is_demo),
  onboardedAt: r.onboarded_at,
  emailVerifiedAt: r.email_verified_at ?? null,
  createdAt: r.created_at,
});

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  password: z
    .string()
    .min(10, "Use at least 10 characters for your password.")
    .max(200, "That password is too long."),
});

export const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(2, "Tell us what to call you.").max(40, "Please use a shorter name."),
  ageConfirmed: z.literal(true, { error: "BELONG is for adults aged 18 and over." }),
  termsAccepted: z.literal(true, { error: "Please accept the terms to continue." }),
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<string> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  await db.run("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [
    hashToken(token),
    userId,
    inDays(SESSION_DAYS),
    now(),
  ]);
  return token;
}

export async function getUserBySessionToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const db = await getDb();
  const row = await db.get<UserRow>(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?",
    [hashToken(token), now()],
  );
  if (!row || row.status !== "active") return null;
  return toUser(row);
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  const db = await getDb();
  await db.run("DELETE FROM sessions WHERE id = ?", [hashToken(token)]);
}

export async function register(input: z.input<typeof registerSchema>): Promise<{ user: User; token: string }> {
  const data = registerSchema.parse(input);
  if (!(await flag("registration_open"))) throw new AppError("Registration is currently closed.", "forbidden");
  const db = await getDb();
  const existing = await db.get("SELECT id FROM users WHERE email = ?", [data.email]);
  if (existing) throw new AppError("An account with that email already exists. Try signing in.", "conflict");
  const id = uid();
  const ts = now();
  const hash = await hashPassword(data.password);
  await db.tx(async () => {
    await db.run(
      "INSERT INTO users (id, email, password_hash, role, status, is_demo, created_at, last_active_at) VALUES (?, ?, ?, 'member', 'active', 0, ?, ?)",
      [id, data.email, hash, ts, ts],
    );
    await db.run(
      "INSERT INTO profiles (user_id, display_name, hue, updated_at) VALUES (?, ?, ?, ?)",
      [id, data.displayName, Math.floor(Math.random() * 360), ts],
    );
    await db.run(
      "INSERT INTO companions (user_id, name, created_at, updated_at) VALUES (?, 'Sol', ?, ?)",
      [id, ts, ts],
    );
    // Consent is opt-in: everything starts withdrawn until onboarding asks.
    for (const c of CONSENTS) {
      await db.run("INSERT INTO consents (user_id, key, granted, updated_at) VALUES (?, ?, 0, ?)", [id, c.key, ts]);
    }
    await db.run(
      "INSERT INTO subscriptions (user_id, plan_id, status, provider, started_at, updated_at) VALUES (?, 'free', 'active', 'none', ?, ?)",
      [id, ts, ts],
    );
  });
  await audit(id, "user.registered", "user", id);
  const { sendVerificationEmail } = await import("./verification");
  try {
    await sendVerificationEmail(id);
  } catch (e) {
    console.error("[belong:email] verification email failed", e);
  }
  await track(null, "signup");
  const token = await createSession(id);
  const row = await db.get<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  return { user: toUser(row!), token };
}

// Simple in-memory throttle; replace with a shared store (e.g. Upstash) when scaling horizontally.
const attempts = new Map<string, { n: number; until: number }>();

export async function login(emailRaw: string, password: string): Promise<{ user: User; token: string }> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const fail = new AppError("That email and password don't match. Please try again.", "forbidden");
  const a = attempts.get(email);
  if (a && a.n >= 8 && a.until > Date.now()) {
    throw new AppError("Too many attempts. Please wait a few minutes and try again.", "limit");
  }
  const db = await getDb();
  const row = await db.get<UserRow>("SELECT * FROM users WHERE email = ?", [email]);
  const ok = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !ok) {
    attempts.set(email, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 10 * 60_000 });
    throw fail;
  }
  if (row.status !== "active") throw new AppError("This account is currently suspended. Contact support for help.", "forbidden");
  attempts.delete(email);
  await db.run("UPDATE users SET last_active_at = ? WHERE id = ?", [now(), row.id]);
  await audit(row.id, "user.login", "user", row.id);
  return { user: toUser(row), token: await createSession(row.id) };
}

export async function changePassword(userId: string, current: string, next: string) {
  const parsed = credentialsSchema.shape.password.safeParse(next);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const db = await getDb();
  const row = await db.get<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw new AppError("Your current password isn't right.", "forbidden");
  }
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(next), userId]);
  await db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  await audit(userId, "user.password_changed", "user", userId);
}

export async function getUser(id: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.get<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  return row ? toUser(row) : null;
}
