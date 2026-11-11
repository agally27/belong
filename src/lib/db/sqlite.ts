import fs from "node:fs";
import path from "node:path";
import type { Db, Param } from "./types";

type Stmt = { all(...p: Param[]): unknown[]; get(...p: Param[]): unknown; run(...p: Param[]): unknown };
type SqliteDatabase = { prepare(sql: string): Stmt; exec(sql: string): void; close(): void };

function openDatabase(file: string): SqliteDatabase {
  // node:sqlite is built into Node >= 22.5. Loaded via process.getBuiltinModule
  // so bundlers never try to resolve it.
  const mod = process.getBuiltinModule("node:sqlite") as unknown as {
    DatabaseSync: new (file: string) => SqliteDatabase;
  };
  return new mod.DatabaseSync(file);
}

export function createSqliteDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const raw = openDatabase(file);
  raw.exec("PRAGMA foreign_keys = ON;");
  if (file !== ":memory:") raw.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  const cache = new Map<string, Stmt>();
  const prep = (sql: string) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  let depth = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const db: Db = {
    dialect: "sqlite",
    async all<T>(sql: string, params: Param[] = []) {
      return prep(sql)
        .all(...params)
        .map((r) => ({ ...(r as object) })) as T[];
    },
    async get<T>(sql: string, params: Param[] = []) {
      const r = prep(sql).get(...params);
      return r ? ({ ...(r as object) } as T) : undefined;
    },
    async run(sql: string, params: Param[] = []) {
      prep(sql).run(...params);
    },
    async exec(sql: string) {
      raw.exec(sql);
    },
    async tx<T>(fn: () => Promise<T>): Promise<T> {
      if (depth > 0) return fn(); // nested: join the outer transaction
      // Serialise top-level transactions: one connection, one writer.
      const runTx = async () => {
        depth++;
        raw.exec("BEGIN IMMEDIATE");
        try {
          const out = await fn();
          raw.exec("COMMIT");
          return out;
        } catch (e) {
          raw.exec("ROLLBACK");
          throw e;
        } finally {
          depth--;
        }
      };
      const p = queue.then(runTx, runTx);
      queue = p.catch(() => undefined);
      return p;
    },
    async close() {
      raw.close();
    },
  };
  return db;
}
