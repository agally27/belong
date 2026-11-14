"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import type { ActionState } from "@/components/forms";
import { CONSENTS, type ConsentKey } from "@/lib/config";
import { clearSessionCookie, requireAdmin, requireUser, sessionToken, setSessionCookie } from "@/lib/session";
import * as account from "@/lib/services/account";
import * as admin from "@/lib/services/admin";
import * as auth from "@/lib/services/auth";
import * as circles from "@/lib/services/circles";
import * as companion from "@/lib/services/companion";
import { AppError, setConsent, track } from "@/lib/services/core";
import * as events from "@/lib/services/events";
import * as gatherings from "@/lib/services/gatherings";
import * as intros from "@/lib/services/introductions";
import * as memory from "@/lib/services/memory";
import * as messaging from "@/lib/services/messaging";
import * as network from "@/lib/services/network";
import * as profile from "@/lib/services/profile";
import * as safety from "@/lib/services/safety";
import { setSignalRevoked, syncSignals } from "@/lib/services/signals";
import * as subs from "@/lib/services/subscriptions";

/* --------------------------------- helpers -------------------------------- */

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const bool = (f: FormData, k: string) => ["on", "true", "1", "yes"].includes(String(f.get(k) ?? ""));
const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);

function fail(e: unknown): ActionState {
  if (e instanceof AppError) return { error: e.message };
  if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Please check what you entered." };
  console.error("[belong:action]", e);
  return { error: "Something went wrong on our side. Please try again." };
}

/** Runs a mutation, converts known errors to form state, and refreshes the page data. */
async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message: message || undefined };
  } catch (e) {
    return fail(e);
  }
}

/** After a member changes what they share, let the network take another look. */
async function refreshNetwork(userId: string) {
  await network.runNetwork({ forUserId: userId, actorId: userId });
}

/* ---------------------------------- auth ---------------------------------- */

export async function registerAction(_: ActionState, f: FormData): Promise<ActionState> {
  try {
    const { token } = await auth.register({
      email: str(f, "email"),
      password: String(f.get("password") ?? ""),
      displayName: str(f, "displayName"),
      ageConfirmed: bool(f, "ageConfirmed") as true,
      termsAccepted: bool(f, "termsAccepted") as true,
    });
    await setSessionCookie(token);
  } catch (e) {
    return fail(e);
  }
  redirect("/onboarding");
}

export async function loginAction(_: ActionState, f: FormData): Promise<ActionState> {
  let home = "/dashboard";
  try {
    const { token, user } = await auth.login(str(f, "email"), String(f.get("password") ?? ""));
    await setSessionCookie(token);
    home = user.role === "admin" && !user.onboardedAt ? "/admin" : user.onboardedAt ? "/dashboard" : "/onboarding";
  } catch (e) {
    return fail(e);
  }
  redirect(home);
}

export async function logoutAction() {
  await auth.destroySession(await sessionToken());
  await clearSessionCookie();
  redirect("/");
}

export async function changePasswordAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    if (String(f.get("next") ?? "") !== String(f.get("confirm") ?? "")) throw new AppError("The new passwords don't match.");
    await auth.changePassword(user.id, String(f.get("current") ?? ""), String(f.get("next") ?? ""));
    await setSessionCookie(await auth.createSession(user.id));
    return "Password updated. Other devices have been signed out.";
  });
}

/* ------------------------------- onboarding ------------------------------- */

function profileInput(f: FormData) {
  return {
    displayName: str(f, "displayName"),
    pronouns: str(f, "pronouns"),
    ageRange: (str(f, "ageRange") || null) as never,
    bio: str(f, "bio"),
    area: str(f, "area"),
    region: str(f, "region"),
    interests: list(f, "interests"),
    values: str(f, "values")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 8),
    personality: {
      group: str(f, "group") || undefined,
      energy: str(f, "energy") || undefined,
      pace: str(f, "pace") || undefined,
    },
    lookingFor: list(f, "lookingFor"),
    postcode: str(f, "postcode"),
    radiusMiles: Number(f.get("radiusMiles") ?? 10),
    onlineOk: bool(f, "onlineOk"),
    availability: list(f, "availability"),
  };
}

export async function completeOnboardingAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const input = profileInput(f);
    if (input.interests.length < 2) throw new AppError("Choose at least two interests so your companion has somewhere to start.");
    await profile.updateProfile(user.id, input);
    await profile.updateCompanion(user.id, {
      name: str(f, "companionName") || "Sol",
      tone: str(f, "tone") || "warm",
      style: (str(f, "style") || "lavender") as never,
      proactivity: "balanced",
    });
    for (const c of CONSENTS) await setConsent(user.id, c.key, bool(f, `consent_${c.key}`));
    await profile.completeOnboarding(user.id);
    await companion.ensureWelcome(user.id);
    await refreshNetwork(user.id);
    await track(user.id, "onboarding_completed");
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect("/companion?welcome=1");
}

/* --------------------------- profile & companion --------------------------- */

export async function updateProfileAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await profile.updateProfile(user.id, profileInput(f));
    await refreshNetwork(user.id);
    return "Profile saved.";
  });
}

export async function updateCompanionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await profile.updateCompanion(user.id, {
      name: str(f, "name"),
      tone: str(f, "tone"),
      style: str(f, "style") as never,
      proactivity: str(f, "proactivity") as never,
    });
    return "Companion updated.";
  });
}

export async function sendCompanionMessageAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => companion.sendToCompanion(user.id, str(f, "message")));
}

export async function clearCompanionThreadAction(): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await companion.clearThread(user.id);
    await companion.ensureWelcome(user.id);
  });
}

/* --------------------------- memories & intentions -------------------------- */

export async function approveMemoryAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await memory.approveMemory(user.id, str(f, "id"), bool(f, "share"));
    if (bool(f, "share")) await refreshNetwork(user.id);
  });
}

export async function dismissMemoryAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => companion.dismissProposedMemory(user.id, str(f, "id")));
}

export async function createMemoryAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await memory.createMemory(user.id, { category: str(f, "category") as never, content: str(f, "content"), shareForMatching: bool(f, "share") });
    await refreshNetwork(user.id);
    return "Memory saved.";
  });
}

export async function updateMemoryAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await memory.updateMemory(user.id, str(f, "id"), { category: str(f, "category") as never, content: str(f, "content"), shareForMatching: bool(f, "share") });
    await refreshNetwork(user.id);
    return "Memory updated.";
  });
}

export async function setMemorySharingAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await memory.setMemorySharing(user.id, str(f, "id"), bool(f, "value"));
    await refreshNetwork(user.id);
  });
}

export async function deleteMemoryAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await memory.deleteMemory(user.id, str(f, "id"));
    await refreshNetwork(user.id);
  });
}

export async function deleteAllMemoriesAction(): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await memory.deleteAllMemories(user.id);
    await refreshNetwork(user.id);
  });
}

export async function approveIntentionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await memory.approveIntention(user.id, str(f, "id"), bool(f, "share"), Number(f.get("days") ?? 7));
    await refreshNetwork(user.id);
  });
}

export async function dismissIntentionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => companion.dismissProposedIntention(user.id, str(f, "id")));
}

export async function createIntentionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    const created = await memory.createIntention(user.id, { title: str(f, "title"), mode: str(f, "mode") as never, days: Number(f.get("days") ?? 7), shared: true });
    await refreshNetwork(user.id);
    return created.topics.length
      ? "Shared with the network as a temporary signal."
      : "Saved. Your companion couldn't link this to a topic yet, so nothing is shared — try naming the activity.";
  });
}

export async function endIntentionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await memory.endIntention(user.id, str(f, "id"));
    await refreshNetwork(user.id);
  });
}

/* ----------------------------- privacy & consent ---------------------------- */

export async function setConsentAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await setConsent(user.id, str(f, "key") as ConsentKey, bool(f, "value"));
    await syncSignals(user.id);
    await refreshNetwork(user.id);
  });
}

export async function setSignalRevokedAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await setSignalRevoked(user.id, str(f, "id"), bool(f, "revoked"));
    await refreshNetwork(user.id);
  });
}

export async function deleteAccountAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    if (str(f, "confirm") !== "DELETE") throw new AppError("Type DELETE to confirm.");
    await account.deleteAccount(user.id, String(f.get("password") ?? ""));
    await clearSessionCookie();
  } catch (e) {
    return fail(e);
  }
  redirect("/?deleted=1");
}

/* ------------------------- discovery & introductions ------------------------ */

export async function dismissMatchAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => network.setMatchState(user.id, str(f, "id"), "dismissed"));
}

export async function requestIntroductionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await intros.requestIntroduction(user.id, str(f, "matchId"), str(f, "note"));
    return "Introduction requested. We'll let you know when they answer.";
  });
}

export async function respondIntroductionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    const res = await intros.respondToIntroduction(user.id, str(f, "id"), str(f, "decision") === "approved" ? "approved" : "declined");
    return res.status === "connected" ? "You're connected! You can message each other now." : undefined;
  });
}

export async function withdrawIntroductionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => intros.withdrawIntroduction(user.id, str(f, "id")));
}

export async function simulateDemoResponseAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await intros.simulateDemoResponse(user.id, str(f, "id"), str(f, "decision") === "declined" ? "declined" : "approved");
  });
}

/* --------------------------- messaging & connections ------------------------- */

export async function sendMessageAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => messaging.sendMessage(user.id, str(f, "conversationId"), str(f, "content")));
}

export async function endConnectionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => messaging.endConnection(user.id, str(f, "id")));
}

export async function blockUserAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await safety.blockUser(user.id, str(f, "targetId"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect("/connections?blocked=1");
}

export async function unblockUserAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => safety.unblockUser(user.id, str(f, "targetId")));
}

export async function reportUserAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await safety.reportUser(user.id, {
      targetId: str(f, "targetId"),
      reason: str(f, "reason"),
      detail: str(f, "detail"),
      contextType: (str(f, "contextType") || "profile") as never,
      contextId: str(f, "contextId") || undefined,
      alsoBlock: bool(f, "alsoBlock"),
    });
    return "Thank you. Our team will review this, and they won't be told it was you.";
  });
}

/* ------------------------------ circles & events ---------------------------- */

export async function createCircleAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  try {
    id = await circles.createCircle(user.id, { name: str(f, "name"), description: str(f, "description"), topic: str(f, "topic"), area: str(f, "area"), capacity: Number(f.get("capacity") ?? 6) });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(`/circles/${id}`);
}

export async function joinCircleAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => circles.joinCircle(user.id, str(f, "id")));
}

export async function leaveCircleAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await circles.leaveCircle(user.id, str(f, "id"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect("/circles");
}

export async function createEventAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  try {
    id = await events.createEvent(user.id, {
      title: str(f, "title"),
      description: str(f, "description"),
      topic: str(f, "topic"),
      area: str(f, "area"),
      format: (str(f, "format") || "in_person") as never,
      startsAt: str(f, "startsAt"),
      capacity: Number(f.get("capacity") ?? 8),
      circleId: str(f, "circleId") || undefined,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(`/events/${id}`);
}

export async function rsvpAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => events.setRsvp(user.id, str(f, "id"), bool(f, "going")));
}

export async function respondGatheringAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    const res = await gatherings.respondToGathering(user.id, str(f, "id"), bool(f, "accept"));
    return bool(f, "accept") && res.status === "proposed" ? "You're in. It goes ahead as soon as enough people say yes." : undefined;
  });
}

export async function simulateGatheringAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(() => gatherings.simulateDemoGathering(user.id, str(f, "id")));
}

export async function gatheringToCircleAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  try {
    id = await gatherings.gatheringToCircle(user.id, str(f, "id"), str(f, "name"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(`/circles/${id}`);
}

/* -------------------------- notifications & support ------------------------- */

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  const user = await requireUser();
  return run(() => account.markAllNotificationsRead(user.id));
}

export async function supportTicketAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await account.createSupportTicket(user.id, str(f, "subject"), str(f, "body"));
    return "Thanks — we've got your message and will reply by email.";
  });
}

/* -------------------------------- membership -------------------------------- */

export async function changePlanAction(_: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  let url: string | undefined;
  try {
    const res = await subs.startPlanChange(user.id, str(f, "planId"));
    url = res.redirectUrl;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  if (url) redirect(url);
  return { ok: true, message: "Your membership has been updated." };
}

export async function cancelPlanAction(): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    await subs.cancelSubscription(user.id);
    return "Your membership will not renew. You keep your benefits until the end of the period.";
  });
}

/* ----------------------------------- admin ---------------------------------- */

export async function adminSetUserStatusAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(() => admin.setUserStatus(a.id, str(f, "userId"), str(f, "status") === "suspended" ? "suspended" : "active"));
}

export async function adminSetUserPlanAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(() => admin.setUserPlan(a.id, str(f, "userId"), str(f, "planId")));
}

export async function adminSetUserRoleAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(() => admin.setUserRole(a.id, str(f, "userId"), str(f, "role") === "admin" ? "admin" : "member"));
}

export async function adminRunNetworkAction(): Promise<ActionState> {
  const a = await requireAdmin();
  return run(async () => {
    const r = await admin.runNetworkAdmin(a.id);
    return `Compared ${r.pairsCompared} pairs across ${r.membersConsidered} members: ${r.matchesCreated} new, ${r.matchesUpdated} updated, ${r.matchesRetired} retired, ${r.signalsExpired} signals expired, ${r.gatheringsProposed} gatherings proposed.`;
  });
}

export async function adminSetWeightsAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(async () => {
    await admin.setWeights(a.id, { shared: Number(f.get("shared")), moments: Number(f.get("moments")), complementary: Number(f.get("complementary")), threshold: Number(f.get("threshold")) });
    await admin.runNetworkAdmin(a.id);
    return "Weights saved and the network re-run.";
  });
}

export async function adminResolveReportAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(() => admin.resolveReport(a.id, str(f, "id"), str(f, "action") as never, str(f, "note")));
}

export async function adminSetFlagAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(() => admin.setFlag(a.id, str(f, "key"), bool(f, "value")));
}

export async function adminUpdatePlanAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(async () => {
    const pounds = Number(str(f, "price"));
    if (!Number.isFinite(pounds) || pounds < 0) throw new AppError("Enter a valid price.");
    const num = (k: string) => Math.trunc(Number(f.get(k)));
    await subs.updatePlan(a.id, str(f, "id"), {
      name: str(f, "name"),
      tagline: str(f, "tagline"),
      pricePence: Math.round(pounds * 100),
      features: str(f, "features")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      limits: { introsPerMonth: num("introsPerMonth"), circles: num("circles"), activeIntentions: num("activeIntentions"), graphInsights: bool(f, "graphInsights"), hostEvents: bool(f, "hostEvents") },
      active: bool(f, "active"),
    });
    return "Plan saved.";
  });
}

export async function adminSetCircleStatusAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(() => admin.setCircleStatus(a.id, str(f, "id"), str(f, "status") === "closed" ? "closed" : "open"));
}

export async function adminCloseTicketAction(_: ActionState, f: FormData): Promise<ActionState> {
  const a = await requireAdmin();
  return run(() => admin.closeTicket(a.id, str(f, "id")));
}
