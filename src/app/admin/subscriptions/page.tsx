import type { Metadata } from "next";
import { adminUpdatePlanAction } from "@/app/actions";
import { BarList } from "@/components/charts";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Notice, PageHeader, Stat } from "@/components/ui";
import { formatPrice } from "@/lib/config";
import { getPaymentProvider } from "@/lib/adapters/payments";
import { subscriptionSummary } from "@/lib/services/admin";
import { listPlans } from "@/lib/services/subscriptions";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function AdminSubscriptionsPage() {
  const admin = await requireAdmin();
  const [summary, plans] = [await subscriptionSummary(admin.id), await listPlans(true)];
  const provider = getPaymentProvider();
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Commercial" title="Subscriptions" description="Membership tiers, pricing and limits are edited here and take effect immediately across the product." />
      {provider.simulated && (
        <Notice tone="sky">
          <strong>Payments are simulated.</strong> No payment provider is connected, so the revenue figure below is indicative only — no money has been collected. See INTEGRATION_CHECKLIST.md to connect Stripe.
        </Notice>
      )}
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-3">
          <Stat label={provider.simulated ? "Indicative monthly revenue" : "Monthly recurring revenue"} value={formatPrice(summary.mrrPence) === "Free" ? "£0.00" : formatPrice(summary.mrrPence)} />
          <Stat label="Paying members" value={summary.tiers.filter((t) => t.id !== "free").reduce((s, t) => s + t.members, 0)} />
        </div>
        <BarList title="Members by tier" data={summary.tiers.map((t) => ({ label: t.name, n: t.members }))} />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <ActionForm action={adminUpdatePlanAction} className="space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Name">
                <input name="name" defaultValue={p.name} className="field text-sm" required />
              </Field>
              <Field label="Price per month (£)" hint={p.id === "free" ? "The free tier is always £0." : undefined}>
                <input name="price" type="number" step="0.01" min="0" defaultValue={(p.pricePence / 100).toFixed(2)} className="field text-sm" disabled={p.id === "free"} />
                {p.id === "free" && <input type="hidden" name="price" value="0" />}
              </Field>
              <Field label="Tagline">
                <input name="tagline" defaultValue={p.tagline} className="field text-sm" />
              </Field>
              <Field label="Features (one per line)">
                <textarea name="features" rows={5} defaultValue={p.features.join("\n")} className="field text-sm" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Intros / month">
                  <input name="introsPerMonth" type="number" min="-1" defaultValue={p.limits.introsPerMonth} className="field text-sm" />
                </Field>
                <Field label="Circles">
                  <input name="circles" type="number" min="-1" defaultValue={p.limits.circles} className="field text-sm" />
                </Field>
                <Field label="Intentions">
                  <input name="activeIntentions" type="number" min="-1" defaultValue={p.limits.activeIntentions} className="field text-sm" />
                </Field>
              </div>
              <p className="text-xs text-ink-500">Use −1 for unlimited.</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-700">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="graphInsights" defaultChecked={p.limits.graphInsights} className="h-4 w-4 accent-lavender-600" /> Graph insights
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="hostEvents" defaultChecked={p.limits.hostEvents} className="h-4 w-4 accent-lavender-600" /> Host events
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="active" defaultChecked={p.active} disabled={p.id === "free"} className="h-4 w-4 accent-lavender-600" /> Offered to members
                </label>
                {p.id === "free" && <input type="hidden" name="active" value="true" />}
              </div>
              <SubmitButton size="sm">Save {p.name}</SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </div>
  );
}
