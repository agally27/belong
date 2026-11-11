import { AsyncLocalStorage } from "node:async_hooks";
import type { Db, Param } from "./types";

type Queryable = { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };

/** Rewrites `?` placeholders to `$1..$n` (ignores `?` inside string literals). */
export function toPgSql(sql: string): string {
  let i = 0;
  let inStr = false;
  let out = "";
  for (const ch of sql) {
    if (ch === "'") inStr = !inStr;
    out += ch === "?" && !inStr ? `$${++i}` : ch;
  }
  return out;
}

/**
 * PostgreSQL / Supabase driver. Activated by setting DATABASE_URL.
 * Uses the same portable schema as SQLite (see db/migrations).
 */
export async function createPostgresDb(url: string): Promise<Db> {
  const pg = await import("pg");
  const Pool = pg.default?.Pool ?? pg.Pool;
  const ssl = /sslmode=require|supabase\.co/.test(url) ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString: url, max: 10, ssl });
  const als = new AsyncLocalStorage<Queryable>();
  const q = (): Queryable => als.getStore() ?? pool;
  return {
    dialect: "postgres",
    async all<T>(sql: string, params: Param[] = []) {
      return (await q().query(toPgSql(sql), params)).rows as T[];
    },
    async get<T>(sql: string, params: Param[] = []) {
      return (await q().query(toPgSql(sql), params)).rows[0] as T | undefined;
    },
    async run(sql: string, params: Param[] = []) {
      await q().query(toPgSql(sql), params);
    },
    async exec(sql: string) {
      await q().query(sql);
    },
    async tx<T>(fn: () => Promise<T>): Promise<T> {
      if (als.getStore()) return fn();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await als.run(client, fn);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
