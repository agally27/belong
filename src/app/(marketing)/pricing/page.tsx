import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Badge, Card, LinkButton } from "@/components/ui";
import { formatPrice } from "@/lib/config";
import { listPlans } from "@/lib/services/subscriptions";

export const metadata: Metadata = { title: "Membership" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const plans = await listPlans();
  return (
    <div className="wash">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-5xl text-charcoal">Membership</h1>
          <p className="mt-4 text-lg text-ink-700">Your companion, your privacy controls and real introductions are free. Upgrade when you&apos;d like more room to say yes.</p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={`flex flex-col p-7 ${p.id === "plus" ? "border-lavender-300 shadow-lift ring-2 ring-lavender-100" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl text-charcoal">{p.name}</h2>
                {p.id === "plus" && <Badge tone="lavender">Most popular</Badge>}
              </div>
              <p className="mt-4 font-display text-5xl text-charcoal">
                {formatPrice(p.pricePence, p.currency)}
                {p.pricePence > 0 && <span className="font-sans text-base text-ink-500"> / {p.interval}</span>}
              </p>
              <p className="mt-3 text-sm text-ink-500">{p.tagline}</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check size={17} className="mt-0.5 shrink-0 text-sage-500" /> {f}
                  </li>
                ))}
              </ul>
              <LinkButton href="/register" variant={p.id === "plus" ? "accent" : "outline"} className="mt-7 w-full">
                {p.pricePence === 0 ? "Start free" : `Choose ${p.name.replace("BELONG ", "")}`}
              </LinkButton>
            </Card>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-500">
          Prices are indicative and include VAT where applicable. Cancel any time. Safety features, privacy controls, blocking and reporting are free for everyone, always.
        </p>
      </div>
    </div>
  );
}
