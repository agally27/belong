import { describe, expect, it } from "vitest";
import { inDb, makeMember } from "./helpers";
import { getDb } from "@/lib/db";
import { setConsent } from "@/lib/services/core";
import { approveMemory, createIntention, createMemory, deleteMemory, listMemories, setMemorySharing, updateMemory } from "@/lib/services/memory";
import { expireSignals, listMySignals, networkSignals, setSignalRevoked, syncSignals } from "@/lib/services/signals";
import { listMatches, liveIntelligence, runNetwork } from "@/lib/services/network";
import { getMemberPreview } from "@/lib/services/members";
import { deleteAccount, exportUserData } from "@/lib/services/account";
import { getThread, sendToCompanion } from "@/lib/services/companion";
import { requestIntroduction, respondToIntroduction } from "@/lib/services/introductions";
import { assertConversationAccess, getMessages, sendMessage } from "@/lib/services/messaging";
import { blockUser, reportUser } from "@/lib/services/safety";
import { listUsers } from "@/lib/services/admin";

const SECRET = "My sister Imogen is unwell and I worry about her constantly";

describe("memory isolation", () => {
  it(
    "never lets one member read, edit or delete another member's memories",
    inDb(async () => {
      const a = await makeMember("Ann");
      const b = await makeMember("Bea");
      const mem = await createMemory(a, { category: "life", content: SECRET });
      expect(await listMemories(b)).toEqual([]);
      await expect(updateMemory(b, mem.id, { category: "life", content: "hacked" })).rejects.toThrow();
      await expect(deleteMemory(b, mem.id)).rejects.toThrow();
      await expect(approveMemory(b, mem.id, true)).rejects.toThrow();
      await expect(setMemorySharing(b, mem.id, true)).rejects.toThrow();
      expect((await listMemories(a))[0].content).toBe(SECRET);
    }),
  );

  it(
    "keeps always-private categories out of signals even if sharing is requested",
    inDb(async () => {
      const a = await makeMember("Ann");
      const mem = await createMemory(a, { category: "relationships", content: "My partner loves hiking", shareForMatching: true });
      expect(mem.shareForMatching).toBe(false);
      await expect(setMemorySharing(a, mem.id, true)).rejects.toThrow(/private/);
      expect((await listMySignals(a)).filter((s) => s.sourceType === "memory")).toEqual([]);
    }),
  );

  it(
    "keeps companion conversations private to their member",
    inDb(async () => {
      const a = await makeMember("Ann");
      const b = await makeMember("Bea");
      await sendToCompanion(a, "I love hiking, and " + SECRET);
      expect((await getThread(a)).length).toBe(2);
      expect(await getThread(b)).toEqual([]);
    }),
  );
});

describe("signals: only approved, generalised data reaches the network", () => {
  it(
    "shares nothing until the member approves a memory for matching",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: [] });
      await sendToCompanion(a, "I really love wild swimming in the sea");
      const proposed = await listMemories(a, "proposed");
      expect(proposed.length).toBe(1);
      expect((await listMySignals(a)).some((s) => s.topic === "wild-swimming")).toBe(false);
      await approveMemory(a, proposed[0].id, false);
      expect((await listMySignals(a)).some((s) => s.topic === "wild-swimming")).toBe(false);
      await setMemorySharing(a, proposed[0].id, true);
      expect((await listMySignals(a)).some((s) => s.topic === "wild-swimming" && s.kind === "interest")).toBe(true);
    }),
  );

  it(
    "never copies a member's own words into signals or matches",
    inDb(async (db) => {
      const a = await makeMember("Ann", { interests: ["hiking"] });
      const b = await makeMember("Bea", { interests: ["hiking"] });
      await createMemory(a, { category: "interests", content: `Loves hiking. ${SECRET}`, shareForMatching: true });
      await runNetwork();
      const dump = JSON.stringify([await db.all("SELECT * FROM signals"), await db.all("SELECT * FROM matches"), await listMatches(b)]);
      expect(dump).not.toContain("Imogen");
      expect(dump).toContain("hiking");
    }),
  );

  it(
    "withdrawing matching consent removes every signal and retires suggestions",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"] });
      const b = await makeMember("Bea", { interests: ["hiking", "coffee"] });
      await runNetwork();
      expect((await listMatches(b)).length).toBe(1);
      await setConsent(a, "matching_enabled", false);
      await syncSignals(a);
      await runNetwork();
      expect(await listMySignals(a)).toEqual([]);
      expect((await networkSignals()).has(a)).toBe(false);
      expect(await listMatches(b)).toEqual([]);
    }),
  );

  it(
    "honours per-category consent and never exposes members who have not consented",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking"], consents: ["matching_enabled"] });
      expect(await listMySignals(a)).toEqual([]);
      const c = await makeMember("Cy", { interests: ["hiking"], consents: "none" });
      expect((await networkSignals()).has(c)).toBe(false);
    }),
  );

  it(
    "lets a member revoke a single signal, and keeps it revoked",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking", "chess"] });
      const s = (await listMySignals(a)).find((x) => x.topic === "chess")!;
      await setSignalRevoked(a, s.id, true);
      await syncSignals(a);
      expect((await networkSignals()).get(a)!.some((x) => x.topic === "chess")).toBe(false);
      const b = await makeMember("Bea");
      await expect(setSignalRevoked(b, s.id, false)).rejects.toThrow();
    }),
  );

  it(
    "expires temporary signals",
    inDb(async (db) => {
      const a = await makeMember("Ann");
      await createIntention(a, { title: "Hiking company this weekend", mode: "moment", days: 3 });
      expect((await listMySignals(a)).some((s) => s.temporary && s.topic === "hiking")).toBe(true);
      await db.run("UPDATE signals SET expires_at = ? WHERE temporary = 1", [new Date(Date.now() - 1000).toISOString()]);
      await db.run("UPDATE intentions SET expires_at = ?", [new Date(Date.now() - 1000).toISOString()]);
      expect(await expireSignals()).toBe(1);
      expect((await networkSignals()).get(a)?.some((s) => s.temporary) ?? false).toBe(false);
    }),
  );

  it(
    "live intelligence reveals counts, never identities",
    inDb(async () => {
      const a = await makeMember("Ann");
      const b = await makeMember("Bea");
      await createIntention(a, { title: "Hiking company this weekend", mode: "moment", days: 3 });
      await createIntention(b, { title: "Hiking company tomorrow", mode: "moment", days: 3 });
      const live = await liveIntelligence(a);
      expect(live.mine[0].resonance).toBe(1);
      expect(JSON.stringify(live)).not.toContain(b);
      expect(JSON.stringify(live)).not.toContain("Bea");
    }),
  );
});

describe("member visibility and access control", () => {
  it(
    "hides members with no relationship, and exposes only preview fields",
    inDb(async () => {
      const a = await makeMember("Ann Example", { interests: ["hiking", "coffee"] });
      const b = await makeMember("Bea Sample", { interests: ["hiking", "coffee"] });
      const c = await makeMember("Cy", { interests: ["chess"] });
      await runNetwork();
      expect(await getMemberPreview(a, c)).toBeNull();
      const p = await getMemberPreview(a, b);
      expect(p?.name).toBe("Bea");
      expect(Object.keys(p!).sort()).toEqual(["area", "bio", "hue", "id", "interests", "isDemo", "name", "pronouns", "relationship"]);
    }),
  );

  it(
    "restricts conversations to their two connected members",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"] });
      const b = await makeMember("Bea", { interests: ["hiking", "coffee"] });
      const c = await makeMember("Cy", { interests: ["hiking", "coffee"] });
      await runNetwork();
      const match = (await listMatches(a)).find((m) => m.member.id === b)!;
      const intro = await requestIntroduction(a, match.id);
      const res = await respondToIntroduction(b, intro, "approved");
      await sendMessage(a, res.conversationId!, "Hello Bea");
      await expect(getMessages(c, res.conversationId!)).rejects.toThrow();
      await expect(sendMessage(c, res.conversationId!, "intruding")).rejects.toThrow();
      expect((await getMessages(b, res.conversationId!)).messages[0].content).toBe("Hello Bea");
    }),
  );

  it(
    "blocking ends the connection, closes the conversation and prevents re-matching",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"] });
      const b = await makeMember("Bea", { interests: ["hiking", "coffee"] });
      await runNetwork();
      const intro = await requestIntroduction(a, (await listMatches(a))[0].id);
      const res = await respondToIntroduction(b, intro, "approved");
      await blockUser(b, a);
      await expect(assertConversationAccess(a, res.conversationId!)).rejects.toThrow();
      await runNetwork();
      expect(await listMatches(a)).toEqual([]);
      expect(await getMemberPreview(a, b)).toBeNull();
    }),
  );

  it(
    "only lets members report people they have encountered",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"] });
      const b = await makeMember("Bea", { interests: ["hiking", "coffee"] });
      const c = await makeMember("Cy", { interests: ["chess"] });
      await runNetwork();
      await expect(reportUser(a, { targetId: c, reason: "spam" })).rejects.toThrow();
      expect(await reportUser(a, { targetId: b, reason: "spam", alsoBlock: true })).toBeTruthy();
      expect(await listMatches(a)).toEqual([]);
    }),
  );

  it(
    "blocks non-admins from admin functions",
    inDb(async () => {
      const a = await makeMember("Ann");
      await expect(listUsers(a)).rejects.toThrow(/Administrator/);
    }),
  );
});

describe("data rights", () => {
  it(
    "exports a member's own data and nobody else's words",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"] });
      const b = await makeMember("Bea", { interests: ["hiking", "coffee"] });
      await createMemory(b, { category: "life", content: SECRET });
      await runNetwork();
      const intro = await requestIntroduction(a, (await listMatches(a))[0].id);
      const res = await respondToIntroduction(b, intro, "approved");
      await sendMessage(a, res.conversationId!, "from Ann");
      await sendMessage(b, res.conversationId!, "from Bea, private words");
      const dump = JSON.stringify(await exportUserData(a));
      expect(dump).toContain("from Ann");
      expect(dump).not.toContain("private words");
      expect(dump).not.toContain("Imogen");
    }),
  );

  it(
    "erases an account and everything attached to it",
    inDb(async (db) => {
      const a = await makeMember("Ann", { interests: ["hiking"] });
      await createMemory(a, { category: "life", content: SECRET });
      await sendToCompanion(a, "I love hiking");
      await expect(deleteAccount(a, "wrong-password")).rejects.toThrow();
      await deleteAccount(a, "correct-horse-battery");
      for (const table of ["users", "profiles", "memories", "signals", "companion_messages", "consents", "sessions", "intentions"]) {
        const col = table === "users" ? "id" : "user_id";
        expect((await db.all(`SELECT * FROM ${table} WHERE ${col} = ?`, [a])).length, table).toBe(0);
      }
      const audit = JSON.stringify(await (await getDb()).all("SELECT * FROM audit_log"));
      expect(audit).not.toContain(a);
    }),
  );
});
