import fs from "node:fs";
import path from "node:path";
import type { Db } from "./types";

export function migrationsDir(): string {
  return process.env.BELONG_MIGRATIONS_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "db", "migrations");
}

/** Arbitrary constant identifying BELONG's migration lock in PostgreSQL. */
const PG_LOCK = 724_019_331;

/**
 * Applies any pending .sql migrations in filename order. Idempotent.
 * On PostgreSQL each step holds a transaction-scoped advisory lock and re-checks
 * what's applied, so several app instances starting at once (e.g. Vercel cold
 * starts) can't apply the same migration twice.
 */
export async function migrate(db: Db, dir = migrationsDir()): Promise<string[]> {
  const lock = async () => {
    if (db.dialect === "postgres") await db.exec(`SELECT pg_advisory_xact_lock(${PG_LOCK})`);
  };
  await db.tx(async () => {
    await lock();
    await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  });
  const files = fs
    .readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied: string[] = [];
  for (const f of files) {
    const sql = fs.readFileSync(/*turbopackIgnore: true*/ path.join(dir, f), "utf8");
    const did = await db.tx(async () => {
      await lock();
      if (await db.get("SELECT name FROM schema_migrations WHERE name = ?", [f])) return false;
      await db.exec(sql);
      await db.run("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", [f, new Date().toISOString()]);
      return true;
    });
    if (did) applied.push(f);
  }
  return applied;
}
