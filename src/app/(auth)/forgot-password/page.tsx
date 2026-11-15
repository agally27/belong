import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions";
import { DevOutboxHint } from "@/components/dev-outbox-hint";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field } from "@/components/ui";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-4xl text-charcoal">Forgotten your password?</h1>
      <p className="mt-2 text-ink-500">Tell us your email and we&apos;ll send you a link to choose a new one.</p>
      <Card className="mt-7">
        <ActionForm action={requestPasswordResetAction} className="space-y-4">
          <Field label="Email">
            <input className="field" type="email" name="email" autoComplete="email" required />
          </Field>
          <SubmitButton className="w-full" pendingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </ActionForm>
      </Card>
      <DevOutboxHint />
      <p className="mt-5 text-center text-sm text-ink-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-lavender-600 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
