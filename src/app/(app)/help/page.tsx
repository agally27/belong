import type { Metadata } from "next";
import Link from "next/link";
import { HeartPulse, ShieldCheck } from "lucide-react";
import { supportTicketAction } from "@/app/actions";
import { FaqList } from "@/components/faq";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, PageHeader, SectionTitle } from "@/components/ui";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Help" };

export default async function HelpPage() {
  await requireMember();
  return (
    <div className="max-w-3xl space-y-9">
      <PageHeader eyebrow="Help & support" title="How can we help?" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <ShieldCheck className="text-sage-500" size={24} strokeWidth={1.6} />
          <h2 className="mt-3 text-lg text-charcoal">Staying safe</h2>
          <p className="mt-1 text-sm text-ink-500">Meet in public places first, tell someone your plans, and trust your instincts. You can block or report anyone from their profile.</p>
          <Link href="/safety" className="mt-3 inline-block text-sm font-medium text-lavender-600 hover:underline">
            Read the community guidelines
          </Link>
        </Card>
        <Card>
          <HeartPulse className="text-rose-600" size={24} strokeWidth={1.6} />
          <h2 className="mt-3 text-lg text-charcoal">If you need support now</h2>
          <p className="mt-1 text-sm text-ink-500">
            Your companion isn&apos;t a crisis service. Samaritans are free to call, any time, on <strong className="text-ink-700">116 123</strong>. In an emergency, call <strong className="text-ink-700">999</strong>.
          </p>
        </Card>
      </div>
      <section>
        <SectionTitle>Common questions</SectionTitle>
        <FaqList />
      </section>
      <section>
        <SectionTitle>Contact support</SectionTitle>
        <Card>
          <ActionForm action={supportTicketAction} className="space-y-4" resetOnSuccess>
            <Field label="Subject">
              <input name="subject" className="field" required minLength={3} maxLength={120} />
            </Field>
            <Field label="How can we help?" hint="Please don't include passwords or anything you'd rather keep private.">
              <textarea name="body" rows={4} className="field" required minLength={10} maxLength={2000} />
            </Field>
            <SubmitButton>Send to support</SubmitButton>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
