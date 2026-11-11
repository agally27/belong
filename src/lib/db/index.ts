import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "./types";
import { createSqliteDb } from "./sqlite";
import { migrate } from "./migrate";

export type { Db, Param } from "./types";

type Globals = { __belongDb?: Promise<Db>; __belongDbScope?: AsyncLocalStorage<Db> };
const g = globalThis as unknown as Globals;
// Lets start-up code (seeding) call services before the shared handle is published.
const scope = (g.__belongDbScope ??= new AsyncLocalStorage<Db>());

/** Runs `fn` with `db` as the database every service call inside it will use. */
export function withDb<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  return scope.run(db, fn);
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    const { createPostgresDb } = await import("./postgres");
    db = await createPostgresDb(url);
  } else {
    db = createSqliteDb(process.env.DATABASE_FILE ?? "./data/belong.db");
  }
  if (process.env.BELONG_AUTO_MIGRATE !== "false") await migrate(db);
  const { ensureBaseline } = await import("../seed/baseline");
  await withDb(db, () => ensureBaseline(db));
  if (process.env.BELONG_DEMO_MODE !== "false") {
    const { seedIfEmpty } = await import("../seed");
    await withDb(db, () => seedIfEmpty(db));
  }
  return db;
}

/** Process-wide database handle (lazy; migrates and seeds on first use). */
export function getDb(): Promise<Db> {
  const scoped = scope.getStore();
  if (scoped) return Promise.resolve(scoped);
  if (!g.__belongDb) {
    g.__belongDb = init().catch((e) => {
      g.__belongDb = undefined;
      throw e;
    });
  }
  return g.__belongDb;
}

/** Test hook: inject a database (e.g. in-memory SQLite). */
export function setDb(db: Db | undefined) {
  g.__belongDb = db ? Promise.resolve(db) : undefined;
}

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
export const json = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
/** Canonical ordering for symmetric pairs (user_a < user_b). */
export const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
