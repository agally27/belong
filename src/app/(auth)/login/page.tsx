import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Notice } from "@/components/ui";
import { env } from "@/lib/config";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL, DEMO_PASSWORD } from "@/lib/seed";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const demo = env.demoMode();
  return (
    <>
      <h1 className="text-4xl text-charcoal">Welcome back</h1>
      <p className="mt-2 text-ink-500">Sign in to see what your companion has noticed.</p>
      <Card className="mt-7">
        <ActionForm action={loginAction} className="space-y-4">
          <Field label="Email">
            <input className="field" type="email" name="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <input className="field" type="password" name="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="w-full" pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-5 text-center text-sm text-ink-500">
        New to BELONG?{" "}
        <Link href="/register" className="font-medium text-lavender-600 hover:underline">
          Create your account
        </Link>
      </p>
      {demo && (
        <Notice tone="sky" className="mt-7">
          <p className="font-medium">Demonstration mode</p>
          <p className="mt-1">Explore with a fictional member, or open the admin console. Demo accounts and their data are not real people.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton action={loginAction} fields={{ email: DEMO_MEMBER_EMAIL, password: DEMO_PASSWORD }} variant="primary" pendingLabel="Opening…">
              Explore as Alex (demo member)
            </ActionButton>
            <ActionButton action={loginAction} fields={{ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD }} pendingLabel="Opening…">
              Open admin console
            </ActionButton>
          </div>
        </Notice>
      )}
    </>
  );
}
