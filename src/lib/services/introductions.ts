import { env } from "../config";
import { getDb, json, now, pair, uid } from "../db";
import { reasonTexts, type MatchReason } from "../matching/engine";
import { AppError, audit, flag, forbidden, isBlockedPair, notFound, notify, track } from "./core";
import { previewsById, type MemberPreview } from "./members";
import { getLimits } from "./subscriptions";
import { assertVerified } from "./verification";

/**
 * Introductions. The invariant this module protects:
 * a connection is created ONLY when both members have explicitly approved.
 */
type IntroRow = {
  id: string;
  match_id: string | null;
  requested_by: string;
  user_a: string;
  user_b: string;
  a_decision: string;
  b_decision: string;
  status: string;
  note: string | null;
  reasons: string;
  created_at: string;
  decided_at: string | null;
};

export interface IntroductionView {
  id: string;
  member: MemberPreview;
  status: "pending" | "connected" | "declined" | "withdrawn";
  requestedByMe: boolean;
  myDecision: "pending" | "approved" | "declined";
  theirDecision: "pending" | "approved" | "declined";
  note: string | null;
  reasons: string[];
  createdAt: string;
  connectionId: string | null;
  conversationId: string | null;
}

export async function introsThisMonth(userId: string): Promise<number> {
  const db = await getDb();
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const row = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM introductions WHERE requested_by = ? AND created_at >= ?", [userId, start]);
  return Number(row?.n ?? 0);
}

/** A member asks to be introduced to a suggested connection. Their own approval is recorded; the other member must still approve. */
export async function requestIntroduction(userId: string, matchId: string, note?: string): Promise<string> {
  const db = await getDb();
  const match = await db.get<{ id: string; user_a: string; user_b: string; status: string; reasons: string }>(
    "SELECT id, user_a, user_b, status, reasons FROM matches WHERE id = ?",
    [matchId],
  );
  if (!match || (match.user_a !== userId && match.user_b !== userId)) throw forbidden("That suggestion isn't available to you.");
  if (match.status !== "suggested") throw new AppError("This suggestion is no longer available.", "conflict");
  await assertVerified(userId);
  const other = match.user_a === userId ? match.user_b : match.user_a;
  if (await isBlockedPair(userId, other)) throw forbidden("This introduction isn't available.");
  const cleanNote = (note ?? "").trim().slice(0, 300) || null;
  const existing = await db.get<IntroRow>("SELECT * FROM introductions WHERE match_id = ? AND status = 'pending'", [matchId]);
  if (existing) {
    // The other member already asked: treat this as approval.
    await respondToIntroduction(userId, existing.id, "approved");
    return existing.id;
  }
  const limits = await getLimits(userId);
  if (limits.introsPerMonth >= 0 && (await introsThisMonth(userId)) >= limits.introsPerMonth) {
    throw new AppError(
      `You've used all ${limits.introsPerMonth} introductions included in your membership this month. Upgrade for more, or wait until next month.`,
      "limit",
    );
  }
  const id = uid();
  const iAmA = match.user_a === userId;
  await db.run(
    "INSERT INTO introductions (id, match_id, requested_by, user_a, user_b, a_decision, b_decision, status, note, reasons, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
    [id, matchId, userId, match.user_a, match.user_b, iAmA ? "approved" : "pending", iAmA ? "pending" : "approved", cleanNote, match.reasons, now()],
  );
  await audit(userId, "introduction.requested", "introduction", id);
  await track(userId, "introduction_requested");
  await notify(other, "introduction", "Someone would like to be introduced", "Their companion and yours think you'd get along. See why, and decide in your own time.", "/introductions");
  return id;
}

async function loadIntro(userId: string, introId: string): Promise<IntroRow> {
  const db = await getDb();
  const row = await db.get<IntroRow>("SELECT * FROM introductions WHERE id = ?", [introId]);
  if (!row || (row.user_a !== userId && row.user_b !== userId)) throw forbidden("That introduction isn't yours.");
  return row;
}

/** Records one member's decision. Creates the connection only if BOTH have approved. */
export async function respondToIntroduction(
  userId: string,
  introId: string,
  decision: "approved" | "declined",
): Promise<{ status: string; connectionId?: string; conversationId?: string }> {
  const db = await getDb();
  return db.tx(async () => {
    const intro = await loadIntro(userId, introId);
    if (intro.status !== "pending") throw new AppError("This introduction has already been decided.", "conflict");
    const iAmA = intro.user_a === userId;
    const other = iAmA ? intro.user_b : intro.user_a;
    if (decision === "approved" && (await isBlockedPair(userId, other))) throw forbidden("This introduction isn't available.");
    if (decision === "approved") await assertVerified(userId);
    await db.run(`UPDATE introductions SET ${iAmA ? "a_decision" : "b_decision"} = ? WHERE id = ?`, [decision, introId]);
    await audit(userId, `introduction.${decision}`, "introduction", introId);

    if (decision === "declined") {
      await db.run("UPDATE introductions SET status = 'declined', decided_at = ? WHERE id = ?", [now(), introId]);
      if (intro.match_id) await db.run("UPDATE matches SET status = 'declined', updated_at = ? WHERE id = ?", [now(), intro.match_id]);
      if (intro.requested_by !== userId) {
        // Kept deliberately gentle and unspecific.
        await notify(intro.requested_by, "introduction", "An introduction didn't go ahead this time", "It happens, and it's never a judgement on you. Your companion will keep looking.", "/discover");
      }
      return { status: "declined" };
    }

    const fresh = (await db.get<IntroRow>("SELECT * FROM introductions WHERE id = ?", [introId]))!;
    // Mutual approval gate — the only place a connection is ever created.
    if (fresh.a_decision !== "approved" || fresh.b_decision !== "approved") return { status: "pending" };

    const ts = now();
    const [ua, ub] = pair(fresh.user_a, fresh.user_b);
    const reasons = json<MatchReason[]>(fresh.reasons, []);
    const topics = [...new Set(reasons.flatMap((r) => r.topics))].filter((t) => !t.startsWith("p:"));
    let connectionId = uid();
    const prior = await db.get<{ id: string }>("SELECT id FROM connections WHERE user_a = ? AND user_b = ?", [ua, ub]);
    if (prior) {
      connectionId = prior.id;
      await db.run("UPDATE connections SET status = 'active', introduction_id = ?, shared_topics = ? WHERE id = ?", [introId, JSON.stringify(topics), connectionId]);
    } else {
      await db.run("INSERT INTO connections (id, user_a, user_b, introduction_id, shared_topics, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)", [
        connectionId,
        ua,
        ub,
        introId,
        JSON.stringify(topics),
        ts,
      ]);
    }
    let conversation = await db.get<{ id: string }>("SELECT id FROM conversations WHERE connection_id = ?", [connectionId]);
    if (!conversation) {
      conversation = { id: uid() };
      await db.run("INSERT INTO conversations (id, kind, connection_id, created_at) VALUES (?, 'direct', ?, ?)", [conversation.id, connectionId, ts]);
    }
    await db.run("UPDATE introductions SET status = 'connected', decided_at = ? WHERE id = ?", [ts, introId]);
    if (fresh.match_id) await db.run("UPDATE matches SET status = 'connected', updated_at = ? WHERE id = ?", [ts, fresh.match_id]);
    await track(null, "connection_created");
    for (const u of [fresh.user_a, fresh.user_b]) {
      await notify(u, "connection", "You're connected", "You both said yes. You can message each other now — your companion has a few ideas to get you started.", `/messages/${conversation.id}`);
    }
    return { status: "connected", connectionId, conversationId: conversation.id };
  });
}

export async function withdrawIntroduction(userId: string, introId: string) {
  const intro = await loadIntro(userId, introId);
  if (intro.requested_by !== userId) throw forbidden("Only the person who asked can withdraw.");
  if (intro.status !== "pending") throw new AppError("This introduction has already been decided.", "conflict");
  const db = await getDb();
  await db.run("UPDATE introductions SET status = 'withdrawn', decided_at = ? WHERE id = ?", [now(), introId]);
  await audit(userId, "introduction.withdrawn", "introduction", introId);
}

export async function listIntroductions(userId: string): Promise<IntroductionView[]> {
  const db = await getDb();
  const rows = await db.all<IntroRow>("SELECT * FROM introductions WHERE user_a = ? OR user_b = ? ORDER BY created_at DESC", [userId, userId]);
  const blocked = new Set(
    (
      await db.all<{ blocker_id: string; blocked_id: string }>("SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?", [userId, userId])
    ).map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)),
  );
  const previews = await previewsById(rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a)));
  const convs = await db.all<{ id: string; connection_id: string; introduction_id: string | null }>(
    "SELECT cv.id, cv.connection_id, c.introduction_id FROM conversations cv JOIN connections c ON c.id = cv.connection_id WHERE (c.user_a = ? OR c.user_b = ?) AND c.status = 'active'",
    [userId, userId],
  );
  const convByIntro = new Map(convs.map((c) => [c.introduction_id, c]));
  const out: IntroductionView[] = [];
  for (const r of rows) {
    const iAmA = r.user_a === userId;
    const otherId = iAmA ? r.user_b : r.user_a;
    const member = previews.get(otherId);
    if (!member || blocked.has(otherId)) continue;
    const conv = convByIntro.get(r.id);
    out.push({
      id: r.id,
      member,
      status: r.status as IntroductionView["status"],
      requestedByMe: r.requested_by === userId,
      myDecision: (iAmA ? r.a_decision : r.b_decision) as IntroductionView["myDecision"],
      theirDecision: (iAmA ? r.b_decision : r.a_decision) as IntroductionView["theirDecision"],
      // A personal note is only shown to its recipient while pending or once connected.
      note: r.note,
      reasons: reasonTexts(json<MatchReason[]>(r.reasons, []), iAmA).filter(Boolean),
      createdAt: r.created_at,
      connectionId: conv?.connection_id ?? null,
      conversationId: conv?.id ?? null,
    });
  }
  return out;
}

/**
 * DEMO ONLY: lets a fictional demo member "answer" an introduction so the
 * journey can be shown end to end. Refuses for real members, and is switched
 * off entirely by the demo_simulation flag or BELONG_DEMO_MODE=false.
 */
export async function simulateDemoResponse(actorId: string, introId: string, decision: "approved" | "declined" = "approved") {
  if (!env.demoMode() || !(await flag("demo_simulation"))) throw forbidden("Demo simulation is switched off.");
  const intro = await loadIntro(actorId, introId);
  const other = intro.user_a === actorId ? intro.user_b : intro.user_a;
  const db = await getDb();
  const user = await db.get<{ is_demo: number }>("SELECT is_demo FROM users WHERE id = ?", [other]);
  if (!user) throw notFound();
  if (!user.is_demo) throw forbidden("Only fictional demo members can be simulated.");
  await audit(actorId, "demo.simulated_response", "introduction", introId, { decision });
  return respondToIntroduction(other, introId, decision);
}
