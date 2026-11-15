import { describe, expect, it } from "vitest";
import { withDb } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createPostgresDb, toPgSql } from "@/lib/db/postgres";
import { ensureBaseline } from "@/lib/seed/baseline";
import { seedDemo, DEMO_MEMBER_EMAIL, DEMO_PASSWORD } from "@/lib/seed";
import { login } from "@/lib/services/auth";
import { listIntroductions, requestIntroduction, simulateDemoResponse } from "@/lib/services/introductions";
import { listMatches, runNetwork } from "@/lib/services/network";
import { exportUserData } from "@/lib/services/account";
import { analytics } from "@/lib/services/admin";

/**
 * Proves the same schema, seed and services run on PostgreSQL.
 * Opt-in: set TEST_DATABASE_URL to an EMPTY, disposable database, e.g.
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/belong_test npm test
 * The test drops and recreates the public schema.
 */
const url = process.env.TEST_DATABASE_URL;

describe("placeholder rewriting", () => {
  it("numbers ? placeholders and leaves string literals alone", () => {
    expect(toPgSql("SELECT * FROM t WHERE a = ? AND b = '?' AND c = ?")).toBe("SELECT * FROM t WHERE a = $1 AND b = '?' AND c = $2");
  });
});

describe.skipIf(!url)("PostgreSQL driver", () => {
  it("migrates, seeds and runs the full journey on Postgres", async () => {
    const db = await createPostgresDb(url!);
    try {
      await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      expect(await migrate(db)).toEqual(["0001_init.sql", "0002_local_and_gatherings.sql", "0003_feedback.sql", "0004_host_tools.sql", "0005_life_stage_and_bridges.sql"]);
      expect(await migrate(db)).toEqual([]); // idempotent
      await withDb(db, async () => {
        await ensureBaseline(db);
        await seedDemo(db);
        const { user } = await login(DEMO_MEMBER_EMAIL, DEMO_PASSWORD);
        const matches = await listMatches(user.id);
        expect(matches.length).toBeGreaterThanOrEqual(3);
        const intro = await requestIntroduction(user.id, matches.find((m) => !m.introduction)!.id);
        expect((await simulateDemoResponse(user.id, intro)).status).toBe("connected");
        expect((await listIntroductions(user.id)).some((i) => i.status === "connected")).toBe(true);
        expect((await runNetwork()).membersConsidered).toBeGreaterThanOrEqual(10);
        expect((await exportUserData(user.id)).memories.length).toBeGreaterThan(0);
        const admin = await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'admin'");
        expect((await analytics(admin!.id)).funnel[0].n).toBeGreaterThanOrEqual(10);
        // Transactions roll back on error.
        await expect(
          db.tx(async () => {
            await db.run("UPDATE profiles SET display_name = 'ROLLED BACK'");
            throw new Error("boom");
          }),
        ).rejects.toThrow("boom");
        expect(await db.get("SELECT 1 AS x FROM profiles WHERE display_name = 'ROLLED BACK'")).toBeUndefined();
      });
    } finally {
      await db.close();
    }
  }, 120000);
});
