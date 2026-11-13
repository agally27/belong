import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CreditCard, LifeBuoy, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { changePasswordAction, logoutAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Button, Card, Field, PageHeader, formatDate } from "@/components/ui";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

const LINKS = [
  { href: "/profile", icon: UserRound, title: "Profile", body: "Your name, area, interests and how you like to meet." },
  { href: "/companion/settings", icon: Sparkles, title: "Companion", body: "Its name, voice and how forward it is." },
  { href: "/settings/privacy", icon: ShieldCheck, title: "Privacy & consent", body: "What's shared, blocked members, data export and account deletion." },
  { href: "/membership", icon: CreditCard, title: "Membership", body: "Your plan and what it includes." },
  { href: "/help", icon: LifeBuoy, title: "Help & support", body: "Answers, safety guidance and a way to reach us." },
];

export default async function SettingsPage() {
  const user = await requireMember();
  return (
    <div className="max-w-2xl space-y-7">
      <PageHeader eyebrow="Settings" title="Account settings" />
      <Card className="!p-0">
        <ul className="divide-y divide-sand/60">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center gap-4 px-5 py-4 hover:bg-cream/60">
                <l.icon size={20} className="shrink-0 text-lavender-500" strokeWidth={1.7} />
                <span className="flex-1">
                  <span className="block font-medium text-charcoal">{l.title}</span>
                  <span className="block text-sm text-ink-500">{l.body}</span>
                </span>
                <ChevronRight size={18} className="text-ink-300" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-xl text-charcoal">Sign-in details</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-500">Email</dt>
            <dd className="font-medium text-charcoal">{user.email}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Member since</dt>
            <dd className="font-medium text-charcoal">{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
        <ActionForm action={changePasswordAction} className="mt-6 space-y-3 border-t border-sand/70 pt-5" resetOnSuccess>
          <h3 className="text-lg text-charcoal">Change password</h3>
          <Field label="Current password">
            <input type="password" name="current" className="field" required autoComplete="current-password" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New password" hint="At least 10 characters.">
              <input type="password" name="next" className="field" required minLength={10} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <input type="password" name="confirm" className="field" required minLength={10} autoComplete="new-password" />
            </Field>
          </div>
          <SubmitButton variant="outline" size="sm">
            Update password
          </SubmitButton>
        </ActionForm>
      </Card>

      <form action={logoutAction}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
