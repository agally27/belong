export type Param = string | number | null;

/**
 * Minimal async database interface. Every service talks to the database only
 * through this interface, so the driver (SQLite locally, PostgreSQL/Supabase in
 * production) can be swapped without touching application code.
 * SQL uses `?` placeholders; the Postgres driver rewrites them to `$n`.
 */
export interface Db {
  readonly dialect: "sqlite" | "postgres";
  all<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T | undefined>;
  run(sql: string, params?: Param[]): Promise<void>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
