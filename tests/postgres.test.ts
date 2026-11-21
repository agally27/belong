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
      expect(await migrate(db)).toEqual(["0001_init.sql", "0002_local_and_gatherings.sql", "0003_feedback.sql", "0004_host_tools.sql", "0005_life_stage_and_bridges.sql", "0006_account_tokens.sql", "0007_email_notifications.sql"]);
      expect(await migrate(db)).toEqual([]); // idempotent
      // Several instances starting at once (e.g. serverless cold starts) don't trip over each other.
      await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      const others = await Promise.all([createPostgresDb(url!), createPostgresDb(url!), createPostgresDb(url!)]);
      const results = await Promise.all([db, ...others].map((d) => migrate(d)));
      expect(results.flat().sort()).toEqual(results.find((r) => r.length)!.slice().sort());
      expect(results.filter((r) => r.length).length).toBe(1);
      await Promise.all(others.map((d) => d.close()));
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
        // Batched summaries and paged admin queries.
        const { listConversations, getMessages } = await import("@/lib/services/messaging");
        const convs = await listConversations(user.id);
        expect(convs.length).toBeGreaterThan(0);
        expect(convs.some((c) => c.lastMessage)).toBe(true);
        expect((await getMessages(user.id, convs[0].id, 1)).messages).toHaveLength(1);
        const { listAudit, listUsers, introductionStats, gatheringStats, listSignalsAdmin } = await import("@/lib/services/admin");
        expect((await listAudit(admin!.id, 1)).rows.length).toBeGreaterThan(0);
        expect((await listUsers(admin!.id, "", 1)).rows.length).toBeGreaterThanOrEqual(10);
        expect((await introductionStats(admin!.id)).connected).toBeGreaterThan(0);
        expect((await gatheringStats(admin!.id)).byStatus.proposed).toBeGreaterThan(0);
        expect((await listSignalsAdmin(admin!.id, 2)).signals.page).toBe(2);
        // Notification emails: queue, claim and send on PostgreSQL.
        const emailsSvc = await import("@/lib/services/email-notifications");
        const { notify } = await import("@/lib/services/core");
        await emailsSvc.setEmailPreferences(user.id, { categories: ["circles"], frequency: "instant" });
        await notify(user.id, "circle", "Welcome to a Circle", "");
        const sentNow = await Promise.all([emailsSvc.flushEmailOutbox(), emailsSvc.flushEmailOutbox()]);
        expect(sentNow[0].sent + sentNow[1].sent).toBe(1);
        expect(await emailsSvc.unsubscribe(await emailsSvc.unsubscribeToken(user.id, "all"))).toEqual({ category: "all" });
        const { listCircles } = await import("@/lib/services/circles");
        expect((await listCircles(user.id)).mine.length).toBeGreaterThan(0);
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
