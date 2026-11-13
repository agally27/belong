import { redirect } from "next/navigation";
import { CompanionOrb, Logo } from "@/components/ui";
import { getCurrentUser, homeFor } from "@/lib/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user));
  return (
    <div className="wash grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Logo />
        <div>
          <CompanionOrb size={72} animate />
          <p className="mt-8 max-w-md font-display text-4xl leading-tight text-charcoal">Your people are out there. Let&apos;s go and find them.</p>
          <p className="mt-4 max-w-sm text-ink-500">A personal companion that learns what matters to you, and introduces you to people worth meeting.</p>
        </div>
        <p className="text-xs text-ink-500">AI should bring people closer together, not replace human relationships.</p>
        <span aria-hidden className="blob animate-drift absolute -right-16 top-24 h-64 w-64 bg-lavender-200/60" />
        <span aria-hidden className="blob-2 animate-drift absolute -bottom-16 right-32 h-56 w-56 bg-sage-200/60" style={{ animationDelay: "-6s" }} />
      </aside>
      <main id="main" className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
