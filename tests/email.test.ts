import { afterEach, describe, expect, it, vi } from "vitest";
import { inDb, makeMember } from "./helpers";
import { devOutbox } from "@/lib/adapters/notifications";
import { notify } from "@/lib/services/core";
import {
  flushEmailOutbox,
  getEmailPreferences,
  queueDailyDigests,
  readUnsubscribeToken,
  setEmailPreferences,
  unsubscribe,
  unsubscribeToken,
} from "@/lib/services/email-notifications";
import { requestIntroduction, respondToIntroduction } from "@/lib/services/introductions";
import { sendMessage } from "@/lib/services/messaging";
import { listMatches, runNetwork } from "@/lib/services/network";
import { deleteAccount } from "@/lib/services/account";

// Registration also sends a "confirm your email" message; these tests are about notification emails.
const mailFor = (email: string) => devOutbox.filter((m) => m.to === email && !m.subject.startsWith("Confirm your email"));
const emailOf = async (db: { get: <T>(s: string, p: string[]) => Promise<T | undefined> }, id: string) => (await db.get<{ email: string }>("SELECT email FROM users WHERE id = ?", [id]))!.email;

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_API_KEY;
  delete process.env.EMAIL_FROM;
});

describe("notification emails", () => {
  it(
    "send nothing unless a member opts in, and only the categories they chose",
    inDb(async (db) => {
      const a = await makeMember("Ann");
      await notify(a, "introduction", "Someone would like to be introduced", "body", "/introductions");
      expect(await db.all("SELECT * FROM email_outbox")).toEqual([]);
      expect(await getEmailPreferences(a)).toEqual({ categories: [], frequency: "instant" });
      await setEmailPreferences(a, { categories: ["messages"], frequency: "instant" });
      await notify(a, "introduction", "Someone would like to be introduced", "body", "/introductions");
      await notify(a, "safety", "A reminder", "body");
      expect(await db.all("SELECT * FROM email_outbox")).toEqual([]);
      await expect(setEmailPreferences(a, { categories: ["spam"], frequency: "instant" })).rejects.toThrow(/Unknown/);
    }),
  );

  it(
    "email a nudge with unsubscribe links and headers, never the message itself, and throttle chatty categories",
    inDb(async (db) => {
      const opts = { interests: ["hiking", "coffee"], postcode: "BS3" };
      const a = await makeMember("Ann", opts);
      const b = await makeMember("Bea", opts);
      await setEmailPreferences(b, { categories: ["introductions", "messages"], frequency: "instant" });
      await runNetwork();
      const m = (await listMatches(a)).find((x) => x.member.id === b)!;
      const intro = await requestIntroduction(a, m.id);
      const conv = (await respondToIntroduction(b, intro, "approved")).conversationId!;
      await sendMessage(a, conv, "my secret plans for Saturday");
      await sendMessage(a, conv, "and another thing");
      expect((await flushEmailOutbox()).sent).toBe(2); // introduction request + one message email (throttled)
      const mails = mailFor(await emailOf(db, b));
      expect(mails.map((x) => x.subject).sort()).toEqual(["New message", "Someone would like to be introduced"]);
      for (const mail of mails) {
        expect(mail.text).not.toContain("secret plans");
        expect(mail.text).toMatch(/\/email\/unsubscribe\?token=/);
        expect(mail.headers?.["List-Unsubscribe"]).toMatch(/^<http.*\/api\/email\/unsubscribe\?token=.+>$/);
        expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      }
      expect(mailFor(await emailOf(db, a))).toEqual([]); // Ann never opted in
      expect((await flushEmailOutbox()).sent).toBe(0); // nothing sent twice
    }),
  );

  it(
    "don't email unconfirmed addresses, and nothing is queued if the action rolls back",
    inDb(async (db) => {
      const a = await makeMember("Ann");
      await setEmailPreferences(a, { categories: ["circles"], frequency: "instant" });
      await db.run("UPDATE users SET email_verified_at = NULL WHERE id = ?", [a]);
      await notify(a, "circle", "Someone new joined", "");
      expect(await db.all("SELECT * FROM email_outbox")).toEqual([]);
      await db.run("UPDATE users SET email_verified_at = created_at WHERE id = ?", [a]);
      await expect(
        db.tx(async () => {
          await notify(a, "circle", "Someone new joined", "");
          throw new Error("action failed");
        }),
      ).rejects.toThrow("action failed");
      expect(await db.all("SELECT * FROM email_outbox")).toEqual([]);
    }),
  );

  it(
    "unsubscribe with a signed link, per category or entirely; forged links do nothing",
    inDb(async (db) => {
      const a = await makeMember("Ann");
      const b = await makeMember("Bea");
      await setEmailPreferences(a, { categories: ["introductions", "messages"], frequency: "instant" });
      await notify(a, "message", "New message", "");
      const token = await unsubscribeToken(a, "messages");
      expect(await readUnsubscribeToken(token)).toEqual({ userId: a, category: "messages" });
      // Tampering: Bea's id with Ann's signature.
      const [, , sig] = Buffer.from(token, "base64url").toString().split(".");
      const forged = Buffer.from(`${b}.messages.${sig}`).toString("base64url");
      expect(await unsubscribe(forged)).toBeNull();
      expect(await unsubscribe("rubbish")).toBeNull();
      expect(await unsubscribe(token)).toEqual({ category: "messages" });
      expect((await getEmailPreferences(a)).categories).toEqual(["introductions"]);
      expect((await db.get<{ status: string }>("SELECT status FROM email_outbox WHERE user_id = ?", [a]))!.status).toBe("skipped");
      await unsubscribe(await unsubscribeToken(a, "all"));
      expect((await getEmailPreferences(a)).categories).toEqual([]);
    }),
  );

  it(
    "send one daily summary of unread notifications in the chosen categories",
    inDb(async (db) => {
      const a = await makeMember("Ann");
      await setEmailPreferences(a, { categories: ["gatherings", "suggestions"], frequency: "daily" });
      await notify(a, "gathering", "Your companion has an idea", "A small get-together", "/gatherings");
      await notify(a, "match", "Your companion noticed someone", "", "/discover");
      await notify(a, "message", "New message", ""); // not a chosen category
      await db.run("UPDATE notifications SET read_at = ? WHERE title = 'Your companion noticed someone'", [new Date().toISOString()]); // already seen
      expect(await db.all("SELECT * FROM email_outbox")).toEqual([]); // daily, so nothing instant
      expect(await queueDailyDigests()).toBe(1);
      expect(await queueDailyDigests()).toBe(0); // once a day
      await flushEmailOutbox();
      const [mail] = mailFor(await emailOf(db, a));
      expect(mail.subject).toBe("Today on BELONG: Your companion has an idea");
      expect(mail.text).toContain("A small get-together");
      expect(mail.text).not.toMatch(/noticed someone|New message/);
      expect(mail.text).toMatch(/daily summary/);
    }),
  );

  it(
    "retry failed sends, then give up after three attempts",
    inDb(async (db) => {
      const a = await makeMember("Ann");
      process.env.EMAIL_PROVIDER = "resend";
      process.env.EMAIL_API_KEY = "test-key";
      process.env.EMAIL_FROM = "BELONG <hello@example.test>";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
      vi.spyOn(console, "error").mockImplementation(() => {});
      await setEmailPreferences(a, { categories: ["circles"], frequency: "instant" });
      await notify(a, "circle", "Welcome", "");
      for (let i = 0; i < 3; i++) await flushEmailOutbox();
      const row = (await db.get<{ status: string; attempts: number }>("SELECT status, attempts FROM email_outbox"))!;
      expect(row).toMatchObject({ status: "failed", attempts: 3 });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      const body = JSON.parse(String(fetchSpy.mock.calls[0][1]!.body));
      expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect((await flushEmailOutbox()).sent).toBe(0);
    }),
  );

  it(
    "never send the same email twice when two sends overlap, and are erased with the account",
    inDb(async (db) => {
      const a = await makeMember("Ann");
      await setEmailPreferences(a, { categories: ["circles", "introductions"], frequency: "instant" });
      await notify(a, "circle", "Welcome", "");
      await notify(a, "introduction", "Someone would like to be introduced", "");
      const [r1, r2] = await Promise.all([flushEmailOutbox(), flushEmailOutbox()]);
      expect(r1.sent + r2.sent).toBe(2);
      await deleteAccount(a, "correct-horse-battery");
      expect(await db.all("SELECT * FROM email_outbox")).toEqual([]);
      expect(await db.all("SELECT * FROM email_preferences")).toEqual([]);
    }),
  );
});
