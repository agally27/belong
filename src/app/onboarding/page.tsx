import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { CONSENTS } from "@/lib/config";
import { TOPIC_LIST } from "@/lib/matching/topics";
import { getCompanion, getProfile } from "@/lib/services/profile";
import { requireUser } from "@/lib/session";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardedAt) redirect("/dashboard");
  if (user.role === "admin") redirect("/admin");
  const [profile, companion] = [await getProfile(user.id), await getCompanion(user.id)];
  return (
    <div className="wash min-h-dvh">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
        <Logo href="/onboarding" />
        <main id="main" className="mt-8">
          <OnboardingWizard
            initialName={profile?.displayName ?? ""}
            companionName={companion.name}
            topics={TOPIC_LIST.map((t) => ({ id: t.id, label: t.label, category: t.category }))}
            consents={CONSENTS.map((c) => ({ key: c.key, title: c.title, description: c.description, group: c.group, recommended: c.default }))}
          />
        </main>
      </div>
    </div>
  );
}
