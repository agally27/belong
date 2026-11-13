import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { cancelPlanAction, changePlanAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { Badge, Card, Notice, PageHeader, formatDate } from "@/components/ui";
import { formatPrice } from "@/lib/config";
import { getPaymentProvider } from "@/lib/adapters/payments";
import { flag } from "@/lib/services/core";
import { introsThisMonth } from "@/lib/services/introductions";
import { getSubscription, listPlans } from "@/lib/services/subscriptions";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Membership" };

const lim = (n: number) => (n < 0 ? "Unlimited" : String(n));

export default async function MembershipPage() {
  const user = await requireMember();
  if (!(await flag("subscriptions"))) notFound();
  const [plans, sub, used] = [await listPlans(), await getSubscription(user.id), await introsThisMonth(user.id)];
  const simulated = getPaymentProvider().simulated;
  const rank = (id: string) => plans.findIndex((p) => p.id === id);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Membership" title="Your membership" description="Your companion, privacy controls and safety tools are free for everyone. Paid memberships give you more room to explore." />

      {simulated && (
        <Notice tone="sky">
          <strong>Simulated payments.</strong> No payment provider is connected, so upgrades here complete instantly and no money is taken. Real billing is switched on by the owner.
        </Notice>
      )}

      <Card className="bg-gradient-to-br from-lavender-50 to-paper">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Current membership</p>
            <p className="mt-1 font-display text-3xl text-charcoal">{sub.plan.name}</p>
            <p className="mt-1 text-sm text-ink-500">
              {sub.plan.pricePence === 0
                ? "Free, for as long as you like."
                : sub.status === "cancelling"
                  ? `Cancelled — your benefits continue until ${sub.renewsAt ? formatDate(sub.renewsAt) : "the end of the period"}.`
                  : `${formatPrice(sub.plan.pricePence, sub.plan.currency)} / ${sub.plan.interval}${sub.renewsAt ? ` · renews ${formatDate(sub.renewsAt)}` : ""}`}
            </p>
          </div>
          {sub.plan.pricePence > 0 && sub.status === "active" && (
            <ActionButton action={cancelPlanAction} variant="ghost" confirm="Cancel your paid membership? You'll keep your benefits until the end of the period.">
              Cancel membership
            </ActionButton>
          )}
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
          {[
            ["Introductions this month", sub.plan.limits.introsPerMonth < 0 ? `${used} used · unlimited` : `${used} of ${sub.plan.limits.introsPerMonth} used`],
            ["Circles", lim(sub.plan.limits.circles)],
            ["Shared intentions", lim(sub.plan.limits.activeIntentions)],
            ["Graph insights", sub.plan.limits.graphInsights ? "Included" : "Not included"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-paper px-4 py-3">
              <dt className="text-xs text-ink-500">{k}</dt>
              <dd className="mt-0.5 font-medium text-charcoal">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const current = p.id === sub.plan.id;
          return (
            <Card key={p.id} className={`flex flex-col ${current ? "border-lavender-300 ring-2 ring-lavender-100" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl text-charcoal">{p.name}</h2>
                {current && <Badge tone="lavender">Your plan</Badge>}
              </div>
              <p className="mt-3 font-display text-4xl text-charcoal">
                {formatPrice(p.pricePence, p.currency)}
                {p.pricePence > 0 && <span className="font-sans text-sm text-ink-500"> / {p.interval}</span>}
              </p>
              <p className="mt-2 text-sm text-ink-500">{p.tagline}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check size={16} className="mt-0.5 shrink-0 text-sage-500" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {current ? (
                  <p className="text-sm text-ink-500">You&apos;re on this membership.</p>
                ) : (
                  <ActionButton
                    action={changePlanAction}
                    fields={{ planId: p.id }}
                    variant={rank(p.id) > rank(sub.plan.id) ? "accent" : "outline"}
                    size="md"
                    confirm={rank(p.id) < rank(sub.plan.id) ? `Switch to ${p.name}? Your limits will change straight away.` : undefined}
                    pendingLabel="Updating…"
                  >
                    {rank(p.id) > rank(sub.plan.id) ? `Upgrade to ${p.name.replace("BELONG ", "")}` : `Switch to ${p.name.replace("BELONG ", "")}`}
                    {simulated && p.pricePence > 0 ? " (simulated)" : ""}
                  </ActionButton>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
