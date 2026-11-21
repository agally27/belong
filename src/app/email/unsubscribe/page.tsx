import type { Metadata } from "next";
import { unsubscribeAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Logo, Notice } from "@/components/ui";
import { EMAIL_CATEGORIES, readUnsubscribeToken } from "@/lib/services/email-notifications";

export const metadata: Metadata = { title: "Unsubscribe", referrer: "no-referrer", robots: { index: false } };

/**
 * Opening the link does nothing by itself (mail scanners open links); the member confirms with a button.
 * Email clients' one-click unsubscribe uses POST /api/email/unsubscribe instead.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const parsed = await readUnsubscribeToken(token);
  const what = !parsed ? null : parsed.category === "all" ? "all BELONG notification emails" : `emails about ${EMAIL_CATEGORIES[parsed.category].label.toLowerCase()}`;
  return (
    <div className="wash min-h-dvh">
      <div className="mx-auto max-w-md px-5 py-12">
        <Logo />
        <main id="main" className="mt-8">
          <h1 className="text-3xl text-charcoal">Unsubscribe</h1>
          {what ? (
            <Card className="mt-6">
              <p className="text-ink-700">Stop {what}? You&apos;ll still see everything in the app.</p>
              <ActionForm action={unsubscribeAction} className="mt-4">
                <input type="hidden" name="token" value={token} />
                <SubmitButton>Unsubscribe</SubmitButton>
              </ActionForm>
            </Card>
          ) : (
            <Notice tone="peach" className="mt-6">
              This link isn&apos;t valid. You can choose what we email you in Settings → Notifications once you&apos;re signed in.
            </Notice>
          )}
        </main>
      </div>
    </div>
  );
}
