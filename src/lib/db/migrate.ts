import fs from "node:fs";
import path from "node:path";
import type { Db } from "./types";

export function migrationsDir(): string {
  return process.env.BELONG_MIGRATIONS_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "db", "migrations");
}

/** Applies any pending .sql migrations in filename order. Idempotent. */
export async function migrate(db: Db, dir = migrationsDir()): Promise<string[]> {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set((await db.all<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name));
  const files = fs
    .readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(/*turbopackIgnore: true*/ path.join(dir, f), "utf8");
    await db.tx(async () => {
      await db.exec(sql);
      await db.run("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", [f, new Date().toISOString()]);
    });
    applied.push(f);
  }
  return applied;
}
