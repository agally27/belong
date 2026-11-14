import { describe, expect, it } from "vitest";
import { inDb, makeMember } from "./helpers";
import { changePassword, createSession, destroySession, getUserBySessionToken, hashPassword, login, register, verifyPassword } from "@/lib/services/auth";
import { getConsents, setConsent } from "@/lib/services/core";
import { approveIntention, listIntentions, listMemories, createIntention } from "@/lib/services/memory";
import { getThread, sendToCompanion } from "@/lib/services/companion";
import { listMatches, runNetwork } from "@/lib/services/network";
import { listIntroductions, requestIntroduction, respondToIntroduction, simulateDemoResponse, withdrawIntroduction } from "@/lib/services/introductions";
import { connectionAssistant, listConnections, listConversations, sendMessage } from "@/lib/services/messaging";
import { createCircle, getCircle, joinCircle, leaveCircle, listCircles } from "@/lib/services/circles";
import { createEvent, listEvents, setRsvp } from "@/lib/services/events";
import { applyPlan, getSubscription, listPlans, startPlanChange, updatePlan } from "@/lib/services/subscriptions";
import { analytics, listReports, overview, resolveReport, setFlag, setUserStatus, setWeights } from "@/lib/services/admin";
import { getGraph, listNotifications, unreadNotificationCount } from "@/lib/services/account";
import { reportUser } from "@/lib/services/safety";
import { listMySignals } from "@/lib/services/signals";
import { listGatherings } from "@/lib/services/gatherings";
import { seedDemo, DEMO_MEMBER_EMAIL, DEMO_PASSWORD } from "@/lib/seed";

const reg = (email: string, password = "correct-horse-battery") =>
  register({ email, password, displayName: "Test Person", ageConfirmed: true, termsAccepted: true });

describe("authentication", () => {
  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("s3cret-password");
    expect(h).not.toContain("s3cret");
    expect(await verifyPassword("s3cret-password", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it(
    "registers, logs in, and manages sessions",
    inDb(async (db) => {
      const { user, token } = await reg("New@Example.com");
      expect(user.email).toBe("new@example.com");
      expect((await getUserBySessionToken(token))?.id).toBe(user.id);
      expect(JSON.stringify(await db.all("SELECT * FROM sessions"))).not.toContain(token); // only a hash is stored
      await destroySession(token);
      expect(await getUserBySessionToken(token)).toBeNull();
      await expect(login("new@example.com", "wrong-password-here")).rejects.toThrow(/don't match/);
      await expect(login("nobody@example.com", "whatever-password")).rejects.toThrow(/don't match/);
      const again = await login("NEW@example.com", "correct-horse-battery");
      expect(again.user.id).toBe(user.id);
    }),
  );

  it(
    "rejects weak input and duplicates, and starts with every consent withdrawn",
    inDb(async () => {
      await expect(reg("bad-email")).rejects.toThrow();
      await expect(reg("a@example.com", "short")).rejects.toThrow();
      await expect(register({ email: "a@example.com", password: "long-enough-pass", displayName: "A B", ageConfirmed: false as never, termsAccepted: true })).rejects.toThrow();
      const { user } = await reg("a@example.com");
      await expect(reg("a@example.com")).rejects.toThrow(/already exists/);
      expect(Object.values(await getConsents(user.id)).every((v) => v === false)).toBe(true);
    }),
  );

  it(
    "expires sessions, rejects suspended members and rotates sessions on password change",
    inDb(async (db) => {
      const admin = await makeMember("Admin");
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
      const { user, token } = await reg("s@example.com");
      await changePassword(user.id, "correct-horse-battery", "another-long-password");
      expect(await getUserBySessionToken(token)).toBeNull();
      const t2 = await createSession(user.id);
      await db.run("UPDATE sessions SET expires_at = ?", [new Date(Date.now() - 1000).toISOString()]);
      expect(await getUserBySessionToken(t2)).toBeNull();
      const t3 = await createSession(user.id);
      await setUserStatus(admin, user.id, "suspended");
      expect(await getUserBySessionToken(t3)).toBeNull();
      await expect(login("s@example.com", "another-long-password")).rejects.toThrow(/suspended/);
    }),
  );
});

describe("the BELONG journey", () => {
  it(
    "goes from a conversation to a connection, with mutual approval",
    inDb(async () => {
      // 1–2. Two members join and meet their companions.
      const alex = await makeMember("Alex", { interests: [] });
      const priya = await makeMember("Priya", { interests: ["hiking"] });
      await createIntention(priya, { title: "Looking for people to share hiking with", mode: "intention", days: 14 });

      // 3–4. Alex discusses an interest; the companion identifies an intention.
      await sendToCompanion(alex, "I'd love to find someone to go hiking with this weekend");
      const thread = await getThread(alex);
      const proposal = thread.at(-1)!.intention!;
      expect(proposal.status).toBe("proposed");
      expect(thread.at(-1)!.simulated).toBe(true);

      // Nothing is shared before approval.
      expect((await listMySignals(alex)).some((s) => s.temporary)).toBe(false);
      await runNetwork();
      expect(await listMatches(alex)).toEqual([]);

      // 5. Alex approves: a temporary connection signal is created.
      await approveIntention(alex, proposal.id, true, 4);
      expect((await listMySignals(alex)).some((s) => s.temporary && s.topic === "hiking")).toBe(true);

      // 6–8. The matching engine discovers the compatible signal.
      const run = await runNetwork();
      expect(run.matchesCreated).toBe(1);
      const [match] = await listMatches(alex);
      expect(match.member.name).toBe("Priya");
      expect(match.reasons.some((r) => r.dimension === "moments")).toBe(true);
      expect(await unreadNotificationCount(priya)).toBeGreaterThan(0);

      // 9. An introduction is proposed. One approval is NOT enough.
      const intro = await requestIntroduction(alex, match.id, "Leigh Woods on Sunday?");
      expect(await listConnections(alex)).toEqual([]);
      expect(await listConversations(alex)).toEqual([]);
      const incoming = (await listIntroductions(priya))[0];
      expect(incoming.myDecision).toBe("pending");
      expect(incoming.theirDecision).toBe("approved");

      // 10–11. Both approve: the connection exists.
      const res = await respondToIntroduction(priya, intro, "approved");
      expect(res.status).toBe("connected");
      expect((await listConnections(alex))[0].member.name).toBe("Priya");

      // 12. Messaging is available, with assistant ideas.
      await sendMessage(alex, res.conversationId!, "Hello!");
      expect((await listConversations(priya))[0].unread).toBe(1);
      const ideas = await connectionAssistant(alex, res.conversationId!);
      expect(ideas!.starters.length).toBeGreaterThan(0);
      expect(ideas!.simulated).toBe(true);

      // Connected pairs are no longer suggested to each other.
      await runNetwork();
      expect(await listMatches(alex)).toEqual([]);
      expect((await getGraph(alex))!.nodes.length).toBe(2);
    }),
  );
});

describe("introductions require mutual approval", () => {
  const pairUp = async () => {
    const a = await makeMember("Ann", { interests: ["hiking", "coffee"] });
    const b = await makeMember("Bea", { interests: ["hiking", "coffee"] });
    await runNetwork();
    return { a, b, matchId: (await listMatches(a))[0].id };
  };

  it(
    "a decline creates no connection and closes the introduction",
    inDb(async () => {
      const { a, b, matchId } = await pairUp();
      const intro = await requestIntroduction(a, matchId);
      expect((await respondToIntroduction(b, intro, "declined")).status).toBe("declined");
      expect(await listConnections(a)).toEqual([]);
      await expect(respondToIntroduction(b, intro, "approved")).rejects.toThrow(/already/);
      await runNetwork();
      expect(await listMatches(a)).toEqual([]); // not re-suggested
    }),
  );

  it(
    "outsiders cannot answer, and the requester cannot approve on the other's behalf",
    inDb(async () => {
      const { a, matchId } = await pairUp();
      const c = await makeMember("Cy");
      const intro = await requestIntroduction(a, matchId);
      await expect(respondToIntroduction(c, intro, "approved")).rejects.toThrow();
      expect((await respondToIntroduction(a, intro, "approved")).status).toBe("pending");
      expect(await listConnections(a)).toEqual([]);
      await expect(requestIntroduction(c, matchId)).rejects.toThrow();
    }),
  );

  it(
    "both asking independently counts as mutual approval",
    inDb(async () => {
      const { a, b, matchId } = await pairUp();
      await requestIntroduction(a, matchId);
      await requestIntroduction(b, matchId);
      expect((await listConnections(a)).length).toBe(1);
    }),
  );

  it(
    "withdrawal is limited to the requester; demo simulation refuses real members",
    inDb(async () => {
      const { a, b, matchId } = await pairUp();
      const intro = await requestIntroduction(a, matchId);
      await expect(withdrawIntroduction(b, intro)).rejects.toThrow();
      await expect(simulateDemoResponse(a, intro)).rejects.toThrow(/fictional/);
      await withdrawIntroduction(a, intro);
      expect(await listConnections(a)).toEqual([]);
    }),
  );

  it(
    "enforces the monthly introduction allowance of the member's plan",
    inDb(async () => {
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"] });
      for (const n of ["Bo", "Cy", "Di", "Ed"]) await makeMember(n, { interests: ["hiking", "coffee"] });
      await runNetwork();
      const matches = await listMatches(a);
      expect(matches.length).toBe(4);
      for (const m of matches.slice(0, 3)) await requestIntroduction(a, m.id);
      await expect(requestIntroduction(a, matches[3].id)).rejects.toThrow(/introductions included/);
      await applyPlan(a, "premium", "mock", null);
      await expect(requestIntroduction(a, matches[3].id)).resolves.toBeTruthy();
    }),
  );
});

describe("companion", () => {
  it(
    "proposes memories without saving them as active, and respects the memory consent",
    inDb(async () => {
      const a = await makeMember("Ann");
      await sendToCompanion(a, "I really enjoy pottery and I can teach guitar");
      expect((await listMemories(a, "proposed")).length).toBeGreaterThan(0);
      expect(await listMemories(a, "active")).toEqual([]);
      await setConsent(a, "companion_memory", false);
      const before = (await listMemories(a)).length;
      await sendToCompanion(a, "I also love chess and baking");
      expect((await listMemories(a)).length).toBe(before);
    }),
  );

  it(
    "responds to distress with human support, not proposals",
    inDb(async () => {
      const a = await makeMember("Ann");
      await sendToCompanion(a, "Sometimes I think about hiking away and that there's no reason to live");
      const last = (await getThread(a)).at(-1)!;
      expect(last.content).toContain("116 123");
      expect(last.intention).toBeNull();
      expect(await listMemories(a)).toEqual([]);
      expect(await listIntentions(a)).toEqual([]);
    }),
  );

  it(
    "is honest about being an AI",
    inDb(async () => {
      const a = await makeMember("Ann");
      await sendToCompanion(a, "Are you a real person?");
      expect((await getThread(a)).at(-1)!.content).toMatch(/AI companion/);
    }),
  );
});

describe("circles and events", () => {
  it(
    "keeps circles to 4–8 people and enforces capacity and plan limits",
    inDb(async () => {
      const host = await makeMember("Host", { interests: ["hiking"] });
      await expect(createCircle(host, { name: "Too big", topic: "hiking", capacity: 12 })).rejects.toThrow();
      await expect(createCircle(host, { name: "Too small", topic: "hiking", capacity: 2 })).rejects.toThrow();
      const id = await createCircle(host, { name: "Walkers", topic: "hiking", capacity: 4 });
      await expect(createCircle(host, { name: "Second", topic: "hiking", capacity: 4 })).rejects.toThrow(/membership includes/);
      const joiners = [];
      for (const n of ["Bo", "Cy", "Di"]) {
        const u = await makeMember(n, { interests: ["hiking"] });
        await joinCircle(u, id);
        joiners.push(u);
      }
      const late = await makeMember("Late", { interests: ["hiking"] });
      await expect(joinCircle(late, id)).rejects.toThrow(/full/);
      expect((await getCircle(late, id))!.members).toEqual([]); // non-members see no names
      expect((await getCircle(joiners[0], id))!.members.length).toBe(4);
      expect((await listCircles(joiners[0])).mine[0].fit).toMatch(/hiking/);
      await leaveCircle(host, id);
      expect((await getCircle(joiners[0], id))!.isHost).toBe(true); // host role passes on
      await sendMessage(joiners[0], (await getCircle(joiners[0], id))!.conversationId!, "Hello circle");
      await expect(sendMessage(late, (await getCircle(joiners[0], id))!.conversationId!, "x")).rejects.toThrow();
    }),
  );

  it(
    "handles RSVPs, capacity and circle-only events",
    inDb(async () => {
      const host = await makeMember("Host");
      const guest = await makeMember("Guest");
      const soon = new Date(Date.now() + 86400000).toISOString();
      await expect(createEvent(host, { title: "Open walk", topic: "hiking", startsAt: soon, capacity: 2 })).rejects.toThrow(/Plus/);
      await applyPlan(host, "plus", "mock", null);
      const id = await createEvent(host, { title: "Open walk", topic: "hiking", startsAt: soon, capacity: 2 });
      await expect(createEvent(host, { title: "Past", topic: "hiking", startsAt: "2020-01-01T10:00:00Z", capacity: 4 })).rejects.toThrow();
      await setRsvp(guest, id, true);
      const third = await makeMember("Third");
      await expect(setRsvp(third, id, true)).rejects.toThrow(/full/);
      await setRsvp(guest, id, false);
      await setRsvp(third, id, true);
      const circle = await createCircle(host, { name: "Private", topic: "chess", capacity: 4 });
      await createEvent(host, { title: "Circle only", topic: "chess", startsAt: soon, capacity: 4, circleId: circle });
      expect((await listEvents(guest)).map((e) => e.title)).toEqual(["Open walk"]);
      expect((await listEvents(host)).length).toBe(2);
    }),
  );
});

describe("membership", () => {
  it(
    "offers three tiers with centrally editable pricing",
    inDb(async (db) => {
      const admin = await makeMember("Admin");
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
      const plans = await listPlans();
      expect(plans.map((p) => [p.id, p.pricePence])).toEqual([["free", 0], ["plus", 799], ["premium", 1499]]);
      await updatePlan(admin, "plus", { pricePence: 899 });
      expect((await listPlans()).find((p) => p.id === "plus")!.pricePence).toBe(899);
      await updatePlan(admin, "free", { pricePence: 500 });
      expect((await listPlans()).find((p) => p.id === "free")!.pricePence).toBe(0);
      const member = await makeMember("Member");
      expect((await startPlanChange(member, "plus")).completed).toBe(true);
      const sub = await getSubscription(member);
      expect(sub.plan.id).toBe("plus");
      expect(sub.provider).toBe("mock");
    }),
  );
});

describe("administration", () => {
  it(
    "moderates reports, toggles flags and tunes matching weights",
    inDb(async (db) => {
      const admin = await makeMember("Admin");
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
      const a = await makeMember("Ann", { interests: ["hiking", "coffee"] });
      const b = await makeMember("Bea", { interests: ["hiking", "coffee"] });
      await runNetwork();
      await reportUser(a, { targetId: b, reason: "harassment", detail: "unkind" });
      const [report] = await listReports(admin);
      await resolveReport(admin, report.id, "suspend", "confirmed");
      expect((await listReports(admin))[0].status).toBe("resolved");
      expect(await listMatches(a)).toEqual([]); // suspended members leave the network
      expect((await listNotifications(a)).some((n) => n.type === "safety")).toBe(true);

      await setUserStatus(admin, b, "active");
      await runNetwork();
      expect((await listMatches(a)).length).toBe(1);
      await setWeights(admin, { shared: 0, moments: 1, complementary: 0, threshold: 50 });
      await runNetwork();
      expect(await listMatches(a)).toEqual([]);
      await expect(setWeights(admin, { shared: 5, moments: 0, complementary: 0, threshold: 10 })).rejects.toThrow();

      await setFlag(admin, "circles", false);
      await expect(createCircle(a, { name: "Nope", topic: "hiking", capacity: 4 })).rejects.toThrow(/paused/);
      const o = await overview(admin);
      expect(o.members).toBe(2);
      expect((await analytics(admin)).funnel[0].n).toBe(2);
    }),
  );
});

describe("demo seed", () => {
  it(
    "creates at least ten labelled fictional members with a working journey",
    inDb(async (db) => {
      await seedDemo(db);
      const members = await db.all<{ id: string; is_demo: number }>("SELECT id, is_demo FROM users WHERE role = 'member'");
      expect(members.length).toBeGreaterThanOrEqual(10);
      expect(members.every((m) => m.is_demo === 1)).toBe(true);
      for (const table of ["memories", "signals", "companions", "profiles"]) {
        const n = await db.get<{ n: number }>(`SELECT COUNT(DISTINCT user_id) AS n FROM ${table}`);
        expect(Number(n!.n), table).toBeGreaterThanOrEqual(10);
      }
      const { user } = await login(DEMO_MEMBER_EMAIL, DEMO_PASSWORD);
      const matches = await listMatches(user.id);
      expect(matches.length).toBeGreaterThanOrEqual(3);
      const dims = new Set(matches.flatMap((m) => m.reasons.map((r) => r.dimension)));
      expect([...dims].sort()).toEqual(["complementary", "context", "moments", "shared"]);
      // The seeded world also contains a companion-proposed gathering for Alex.
      expect((await listGatherings(user.id)).length).toBeGreaterThanOrEqual(1);
      const incoming = (await listIntroductions(user.id)).find((i) => i.status === "pending" && !i.requestedByMe)!;
      expect(incoming.member.name).toBe("Tom");
      expect((await listConnections(user.id))[0].member.name).toBe("Eleanor");
      // A demo member can be simulated — clearly a demo-only path.
      const mine = await requestIntroduction(user.id, matches.find((m) => !m.introduction)!.id);
      expect((await simulateDemoResponse(user.id, mine)).status).toBe("connected");
    }),
  );
});
