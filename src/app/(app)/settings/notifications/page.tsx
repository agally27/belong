import type { Metadata } from "next";
import Link from "next/link";
import { setEmailPreferencesAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";
import { emailConfigured } from "@/lib/adapters/notifications";
import { env } from "@/lib/config";
import { EMAIL_CATEGORIES, getEmailPreferences } from "@/lib/services/email-notifications";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Email notifications" };

export default async function EmailSettingsPage() {
  const user = await requireMember();
  const prefs = await getEmailPreferences(user.id);
  const delivering = emailConfigured() || env.demoMode();
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Email notifications"
        description="Everything you see in Notifications stays in the app. If you'd also like some of it by email, choose what here — nothing is emailed unless you ask."
      />
      {!user.emailVerifiedAt && (
        <Notice tone="peach">
          We&apos;ll only email you once you&apos;ve confirmed your address. <Link href="/settings" className="font-medium underline">Confirm it in Settings</Link>.
        </Notice>
      )}
      {!delivering && <Notice tone="sky">Email isn&apos;t switched on for BELONG yet. You can choose your preferences now and they&apos;ll apply as soon as it is.</Notice>}
      <Card>
        <ActionForm action={setEmailPreferencesAction} className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-ink-700">Email me about…</legend>
            <ul className="space-y-3">
              {Object.entries(EMAIL_CATEGORIES).map(([id, c]) => (
                <li key={id}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" name="categories" value={id} defaultChecked={prefs.categories.includes(id as never)} className="mt-1 h-4 w-4 accent-lavender-600" />
                    <span>
                      <span className="block font-medium text-charcoal">{c.label}</span>
                      <span className="block text-sm text-ink-500">{c.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">How often?</legend>
            <div className="flex flex-wrap gap-2">
              <label className="chip-toggle">
                <input type="radio" name="frequency" value="instant" defaultChecked={prefs.frequency === "instant"} className="sr-only" />
                As they happen
              </label>
              <label className="chip-toggle">
                <input type="radio" name="frequency" value="daily" defaultChecked={prefs.frequency === "daily"} className="sr-only" />
                One summary a day
              </label>
            </div>
          </fieldset>
          <p className="text-xs text-ink-500">
            Emails go to {user.email}. They never include what people write to you, your memories or your companion conversation — just a nudge to open BELONG. Every email has a one-click unsubscribe link.
          </p>
          <SubmitButton>Save email preferences</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
