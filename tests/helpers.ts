import { withDb, type Db } from "@/lib/db";
import { createSqliteDb } from "@/lib/db/sqlite";
import { migrate } from "@/lib/db/migrate";
import { ensureBaseline } from "@/lib/seed/baseline";
import { CONSENTS, type ConsentKey } from "@/lib/config";
import { register } from "@/lib/services/auth";
import { setConsent } from "@/lib/services/core";
import { completeOnboarding, updateProfile } from "@/lib/services/profile";

/** A fresh, migrated in-memory database with baseline reference data. */
export async function freshDb(): Promise<Db> {
  const db = createSqliteDb(":memory:");
  await migrate(db);
  await ensureBaseline(db);
  return db;
}

/** Runs a test body against an isolated in-memory database. */
export function inDb<T>(fn: (db: Db) => Promise<T>): () => Promise<T> {
  return async () => {
    const db = await freshDb();
    try {
      return await withDb(db, () => fn(db));
    } finally {
      await db.close();
    }
  };
}

let n = 0;

export async function makeMember(
  name: string,
  opts: { interests?: string[]; consents?: ConsentKey[] | "all" | "none"; onboard?: boolean; area?: string; postcode?: string; radius?: number; online?: boolean; free?: string[]; group?: string; energy?: string } = {},
): Promise<string> {
  const { user } = await register({
    email: `${name.toLowerCase().replace(/\W/g, "")}${n++}@test.example`,
    password: "correct-horse-battery",
    displayName: name,
    ageConfirmed: true,
    termsAccepted: true,
  });
  const consents =
    opts.consents === "none"
      ? []
      : opts.consents === "all" || !opts.consents
        ? CONSENTS.filter((c) => c.group === "Agent network" || c.key === "companion_memory").map((c) => c.key)
        : opts.consents;
  for (const key of consents) await setConsent(user.id, key, true);
  await updateProfile(user.id, { displayName: name, interests: opts.interests ?? [], area: opts.area ?? "Testville", personality: { group: opts.group ?? "small", energy: opts.energy }, postcode: opts.postcode, radiusMiles: opts.radius ?? 10, onlineOk: opts.online ?? false, availability: opts.free ?? [] });
  if (opts.onboard !== false) await completeOnboarding(user.id);
  return user.id;
}
