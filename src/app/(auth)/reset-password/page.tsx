import type { Metadata } from "next";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-4xl text-charcoal">Choose a new password</h1>
      <p className="mt-2 text-ink-500">You&apos;ll be signed out on every other device.</p>
      {token ? (
        <Card className="mt-7">
          <ActionForm action={resetPasswordAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <Field label="New password" hint="At least 10 characters. A short phrase works well.">
              <input className="field" type="password" name="password" autoComplete="new-password" required minLength={10} />
            </Field>
            <Field label="Type it again">
              <input className="field" type="password" name="confirm" autoComplete="new-password" required minLength={10} />
            </Field>
            <SubmitButton className="w-full" pendingLabel="Saving…">
              Save new password
            </SubmitButton>
          </ActionForm>
        </Card>
      ) : (
        <Notice tone="peach" className="mt-7">
          This link is incomplete. Please use the full link from your email, or{" "}
          <Link href="/forgot-password" className="font-medium underline">
            ask for a new one
          </Link>
          .
        </Notice>
      )}
    </>
  );
}
