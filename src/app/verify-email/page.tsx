import type { Metadata } from "next";
import { CompanionOrb, LinkButton, Logo } from "@/components/ui";
import { verifyEmail } from "@/lib/services/verification";
import { getCurrentUser, homeFor } from "@/lib/session";

export const metadata: Metadata = { title: "Confirm your email", referrer: "no-referrer" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmail(token) : false;
  const user = await getCurrentUser();
  return (
    <main id="main" className="wash flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <Logo />
      <CompanionOrb size={64} className="mt-10" />
      <h1 className="mt-8 text-4xl text-charcoal">{ok ? "Email confirmed" : "That link didn't work"}</h1>
      <p className="mt-3 max-w-md text-ink-500">
        {ok
          ? "Thank you. You can now ask for introductions, join Circles and say yes to get-togethers."
          : "It may have expired or already been used. You can send yourself a new one from Settings once you're signed in."}
      </p>
      <LinkButton href={user ? (ok ? homeFor(user) : "/settings") : "/login"} className="mt-7">
        {user ? (ok ? "Carry on" : "Go to Settings") : "Sign in"}
      </LinkButton>
    </main>
  );
}
