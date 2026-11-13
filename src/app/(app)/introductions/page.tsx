import type { Metadata } from "next";
import { HeartHandshake } from "lucide-react";
import { IntroductionCard } from "@/components/cards";
import { EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { env } from "@/lib/config";
import { introsThisMonth, listIntroductions } from "@/lib/services/introductions";
import { getLimits } from "@/lib/services/subscriptions";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Introductions" };

export default async function IntroductionsPage() {
  const user = await requireMember();
  const [intros, used, limits] = [await listIntroductions(user.id), await introsThisMonth(user.id), await getLimits(user.id)];
  const awaitingMe = intros.filter((i) => i.status === "pending" && i.myDecision === "pending");
  const awaitingThem = intros.filter((i) => i.status === "pending" && i.myDecision === "approved");
  const history = intros.filter((i) => i.status !== "pending");
  const demo = env.demoMode();
  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Introductions"
        title="Only when you both say yes"
        description="An introduction becomes a connection only when both of you approve. Until then, no messages can be sent and nothing more is shared."
        actions={
          <p className="rounded-full bg-cream px-4 py-2 text-sm text-ink-700">
            {limits.introsPerMonth < 0 ? "Unlimited introductions" : `${Math.max(0, limits.introsPerMonth - used)} of ${limits.introsPerMonth} requests left this month`}
          </p>
        }
      />
      {!intros.length && (
        <EmptyState icon={<HeartHandshake size={36} />} title="No introductions yet" body="When you ask to meet someone — or someone asks to meet you — it will appear here." action={<LinkButton href="/discover">See who your companion has noticed</LinkButton>} />
      )}
      {awaitingMe.length > 0 && (
        <section>
          <SectionTitle>Waiting for your answer</SectionTitle>
          <div className="grid gap-4">
            {awaitingMe.map((i) => (
              <IntroductionCard key={i.id} intro={i} demoMode={demo} />
            ))}
          </div>
        </section>
      )}
      {awaitingThem.length > 0 && (
        <section>
          <SectionTitle>Waiting for their answer</SectionTitle>
          <div className="grid gap-4">
            {awaitingThem.map((i) => (
              <IntroductionCard key={i.id} intro={i} demoMode={demo} />
            ))}
          </div>
        </section>
      )}
      {history.length > 0 && (
        <section>
          <SectionTitle>Earlier</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {history.map((i) => (
              <IntroductionCard key={i.id} intro={i} demoMode={demo} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
