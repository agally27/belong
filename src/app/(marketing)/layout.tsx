import Link from "next/link";
import { LinkButton, Logo } from "@/components/ui";
import { getCurrentUser, homeFor } from "@/lib/session";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/pricing", label: "Membership" },
  { href: "/about", label: "About" },
];

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-sand/50 bg-ivory/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-ink-700 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-lavender-600">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <LinkButton href={homeFor(user)} size="sm">
                Open BELONG
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/login" variant="ghost" size="sm">
                  Sign in
                </LinkButton>
                <LinkButton href="/register" size="sm">
                  Join BELONG
                </LinkButton>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-sand/60 bg-cream/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-500">Your people are out there. BELONG helps you find them — gently, privately, and on your terms.</p>
          </div>
          <FooterCol title="Product" links={[["/#how", "How it works"], ["/pricing", "Membership"], ["/register", "Join"], ["/login", "Sign in"]]} />
          <FooterCol title="Trust" links={[["/safety", "Safety & community"], ["/privacy", "Privacy"], ["/terms", "Terms"]]} />
          <FooterCol title="Company" links={[["/about", "About"], ["/support", "Help & contact"]]} />
        </div>
        <p className="border-t border-sand/60 px-5 py-5 text-center text-xs text-ink-500">© {new Date().getFullYear()} BELONG. AI should bring people closer together, not replace human relationships.</p>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">{title}</p>
      <ul className="space-y-2 text-sm text-ink-700">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="hover:text-lavender-600">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
