import type { Metadata } from "next";
import Link from "next/link";
import { registerAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field } from "@/components/ui";

export const metadata: Metadata = { title: "Join" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-4xl text-charcoal">Join BELONG</h1>
      <p className="mt-2 text-ink-500">It takes about three minutes to meet your companion.</p>
      <Card className="mt-7">
        <ActionForm action={registerAction} className="space-y-4">
          <Field label="What should we call you?">
            <input className="field" name="displayName" autoComplete="given-name" required minLength={2} maxLength={40} />
          </Field>
          <Field label="Email">
            <input className="field" type="email" name="email" autoComplete="email" required />
          </Field>
          <Field label="Password" hint="At least 10 characters. A short phrase works well.">
            <input className="field" type="password" name="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <label className="flex items-start gap-3 text-sm text-ink-700">
            <input type="checkbox" name="ageConfirmed" required className="mt-1 h-4 w-4 accent-lavender-600" />
            <span>I&apos;m 18 or over.</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-ink-700">
            <input type="checkbox" name="termsAccepted" required className="mt-1 h-4 w-4 accent-lavender-600" />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="text-lavender-600 underline">
                terms
              </Link>{" "}
              and{" "}
              <Link href="/safety" target="_blank" className="text-lavender-600 underline">
                community guidelines
              </Link>
              , and have read the{" "}
              <Link href="/privacy" target="_blank" className="text-lavender-600 underline">
                privacy summary
              </Link>
              .
            </span>
          </label>
          <SubmitButton className="w-full" pendingLabel="Creating your account…">
            Create my account
          </SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-5 text-center text-sm text-ink-500">
        Already a member?{" "}
        <Link href="/login" className="font-medium text-lavender-600 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
