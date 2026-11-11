import { getDb, inDays, json, now } from "../db";
import { DEFAULT_PLANS, type PlanLimits } from "../config";
import { getPaymentProvider } from "../adapters/payments";
import { AppError, audit, flag, notFound, notify, track } from "./core";

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  pricePence: number;
  currency: string;
  interval: string;
  features: string[];
  limits: PlanLimits;
  active: boolean;
}

type PlanRow = {
  id: string;
  name: string;
  tagline: string;
  price_pence: number;
  currency: string;
  billing_interval: string;
  features: string;
  limits: string;
  active: number;
};

const FREE_LIMITS = DEFAULT_PLANS[0].limits;

const toPlan = (r: PlanRow): Plan => ({
  id: r.id,
  name: r.name,
  tagline: r.tagline,
  pricePence: Number(r.price_pence),
  currency: r.currency,
  interval: r.billing_interval,
  features: json<string[]>(r.features, []),
  limits: { ...FREE_LIMITS, ...json<Partial<PlanLimits>>(r.limits, {}) },
  active: Boolean(r.active),
});

export async function listPlans(includeInactive = false): Promise<Plan[]> {
  const db = await getDb();
  const rows = await db.all<PlanRow>("SELECT * FROM plans ORDER BY sort");
  return rows.map(toPlan).filter((p) => includeInactive || p.active);
}

export interface Subscription {
  plan: Plan;
  status: "active" | "cancelling" | "cancelled";
  provider: string;
  startedAt: string;
  renewsAt: string | null;
}

export async function getSubscription(userId: string): Promise<Subscription> {
  const db = await getDb();
  const row = await db.get<PlanRow & { sub_status: string; provider: string; started_at: string; renews_at: string | null }>(
    "SELECT p.*, s.status AS sub_status, s.provider, s.started_at, s.renews_at FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ?",
    [userId],
  );
  if (!row) {
    const free = (await listPlans(true)).find((p) => p.id === "free")!;
    return { plan: free, status: "active", provider: "none", startedAt: now(), renewsAt: null };
  }
  return {
    plan: toPlan(row),
    status: row.sub_status as Subscription["status"],
    provider: row.provider,
    startedAt: row.started_at,
    renewsAt: row.renews_at,
  };
}

export async function getLimits(userId: string): Promise<PlanLimits> {
  return (await getSubscription(userId)).plan.limits;
}

/**
 * Starts a plan change. With the mock provider this completes immediately
 * (clearly labelled as simulated in the UI). With Stripe configured it returns
 * a hosted checkout URL and the webhook completes the change.
 */
export async function startPlanChange(userId: string, planId: string): Promise<{ redirectUrl?: string; completed: boolean }> {
  if (!(await flag("subscriptions"))) throw new AppError("Membership changes are paused right now.", "forbidden");
  const plan = (await listPlans()).find((p) => p.id === planId);
  if (!plan) throw notFound("That membership isn't available.");
  const current = await getSubscription(userId);
  if (current.plan.id === plan.id && current.status === "active") throw new AppError("You're already on this membership.", "conflict");
  if (plan.pricePence === 0) {
    await applyPlan(userId, plan.id, "none", null);
    return { completed: true };
  }
  const provider = getPaymentProvider();
  const session = await provider.createCheckout({ userId, planId: plan.id, pricePence: plan.pricePence, currency: plan.currency });
  if (session.completed) {
    await applyPlan(userId, plan.id, provider.name, session.reference);
    return { completed: true };
  }
  return { completed: false, redirectUrl: session.url };
}

/** Applies a plan to a member. Called directly for mock payments and by the payment webhook in production. */
export async function applyPlan(userId: string, planId: string, provider: string, reference: string | null) {
  const db = await getDb();
  const plan = (await listPlans(true)).find((p) => p.id === planId);
  if (!plan) throw notFound("Unknown plan.");
  const ts = now();
  await db.run(
    "INSERT INTO subscriptions (user_id, plan_id, status, provider, provider_ref, started_at, renews_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET plan_id = excluded.plan_id, status = 'active', provider = excluded.provider, provider_ref = excluded.provider_ref, started_at = excluded.started_at, renews_at = excluded.renews_at, updated_at = excluded.updated_at",
    [userId, planId, provider, reference, ts, plan.pricePence > 0 ? inDays(30) : null, ts],
  );
  await audit(userId, "subscription.changed", "plan", planId, { provider });
  await track(userId, "plan_changed", { plan: planId });
  await notify(userId, "membership", `You're now on ${plan.name}`, plan.tagline, "/membership");
}

export async function cancelSubscription(userId: string) {
  const db = await getDb();
  const sub = await getSubscription(userId);
  if (sub.plan.pricePence === 0) throw new AppError("You're on the free membership already.", "conflict");
  await getPaymentProvider().cancel({ userId });
  await db.run("UPDATE subscriptions SET status = 'cancelling', updated_at = ? WHERE user_id = ?", [now(), userId]);
  await audit(userId, "subscription.cancelled", "plan", sub.plan.id);
}

/** Admin: edit pricing, copy and limits centrally. */
export async function updatePlan(
  actorId: string,
  planId: string,
  patch: { name?: string; tagline?: string; pricePence?: number; features?: string[]; limits?: Partial<PlanLimits>; active?: boolean },
) {
  const db = await getDb();
  const plan = (await listPlans(true)).find((p) => p.id === planId);
  if (!plan) throw notFound("Unknown plan.");
  if (patch.pricePence !== undefined && (!Number.isInteger(patch.pricePence) || patch.pricePence < 0)) {
    throw new AppError("Price must be a whole number of pence.");
  }
  const next = { ...plan, ...patch, limits: { ...plan.limits, ...(patch.limits ?? {}) } };
  if (planId === "free") {
    next.pricePence = 0;
    next.active = true;
  }
  await db.run(
    "UPDATE plans SET name = ?, tagline = ?, price_pence = ?, features = ?, limits = ?, active = ?, updated_at = ? WHERE id = ?",
    [next.name, next.tagline, next.pricePence, JSON.stringify(next.features), JSON.stringify(next.limits), next.active ? 1 : 0, now(), planId],
  );
  await audit(actorId, "plan.updated", "plan", planId, { pricePence: next.pricePence });
}
