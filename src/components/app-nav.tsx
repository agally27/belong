"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarHeart,
  CircleDot,
  Compass,
  CreditCard,
  HeartHandshake,
  Home,
  LifeBuoy,
  Menu,
  MessageCircle,
  NotebookPen,
  Radio,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { cx } from "./ui";

export type NavCounts = { messages: number; introductions: number; notifications: number; suggestions: number };
export type NavFlags = Record<string, boolean>;

const GROUPS = [
  {
    title: "",
    items: [
      { href: "/dashboard", label: "Home", icon: Home },
      { href: "/companion", label: "Companion", icon: Sparkles },
      { href: "/memories", label: "Memories", icon: NotebookPen },
    ],
  },
  {
    title: "Connect",
    items: [
      { href: "/discover", label: "Discover", icon: Compass, count: "suggestions" },
      { href: "/live", label: "Live", icon: Radio, flag: "live_intelligence" },
      { href: "/introductions", label: "Introductions", icon: HeartHandshake, count: "introductions" },
      { href: "/messages", label: "Messages", icon: MessageCircle, count: "messages" },
    ],
  },
  {
    title: "Together",
    items: [
      { href: "/connections", label: "My connections", icon: Users },
      { href: "/circles", label: "Circles", icon: CircleDot, flag: "circles" },
      { href: "/events", label: "Events", icon: CalendarHeart, flag: "events" },
      { href: "/graph", label: "Connection Graph", icon: Share2, flag: "connection_graph" },
    ],
  },
  {
    title: "You",
    items: [
      { href: "/profile", label: "Profile", icon: UserRound },
      { href: "/settings/privacy", label: "Privacy & consent", icon: ShieldCheck },
      { href: "/membership", label: "Membership", icon: CreditCard, flag: "subscriptions" },
      { href: "/notifications", label: "Notifications", icon: Bell, count: "notifications" },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/help", label: "Help", icon: LifeBuoy },
    ],
  },
] as const;

const TABS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/companion", label: "Companion", icon: Sparkles },
  { href: "/discover", label: "Discover", icon: Compass, count: "suggestions" },
  { href: "/messages", label: "Messages", icon: MessageCircle, count: "messages" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-lavender-600 px-1.5 text-[0.7rem] font-semibold leading-5 text-white" aria-label={`${n} new`}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

export function SideNav({ counts, flags, onNavigate }: { counts: NavCounts; flags: NavFlags; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="BELONG" className="space-y-5">
      {GROUPS.map((g) => (
        <div key={g.title || "main"}>
          {g.title && <p className="mb-1.5 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-300">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items
              .filter((i) => !("flag" in i) || flags[i.flag] !== false)
              .map((i) => {
                const active = isActive(pathname, i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-[0.95rem] transition-colors",
                        active ? "bg-lavender-100 font-medium text-lavender-700" : "text-ink-700 hover:bg-cream",
                      )}
                    >
                      <i.icon size={18} strokeWidth={1.7} />
                      {i.label}
                      {"count" in i && <Count n={counts[i.count]} />}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Mobile: bottom tab bar plus a slide-over menu containing the full navigation. */
export function MobileNav({ counts, flags, footer }: { counts: NavCounts; flags: NavFlags; footer?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  const other = counts.introductions + counts.notifications;
  return (
    <>
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-sand/70 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            const n = "count" in t ? counts[t.count] : 0;
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined} className={cx("relative flex flex-col items-center gap-0.5 py-2.5 text-[0.68rem]", active ? "text-lavender-700" : "text-ink-500")}>
                  <t.icon size={21} strokeWidth={active ? 2.1 : 1.6} />
                  {t.label}
                  {n > 0 && <span className="absolute right-[26%] top-1.5 h-2 w-2 rounded-full bg-lavender-600" aria-label={`${n} new`} />}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-menu" className="relative flex w-full flex-col items-center gap-0.5 py-2.5 text-[0.68rem] text-ink-500">
              <Menu size={21} strokeWidth={1.6} />
              More
              {other > 0 && <span className="absolute right-[26%] top-1.5 h-2 w-2 rounded-full bg-lavender-600" aria-label={`${other} new`} />}
            </button>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="mobile-menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-charcoal/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-ivory p-4 shadow-lift">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-lg tracking-[0.14em]">BELONG</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-full p-2 hover:bg-cream">
                <X size={20} />
              </button>
            </div>
            <SideNav counts={counts} flags={flags} onNavigate={() => setOpen(false)} />
            {footer && <div className="mt-5 border-t border-sand/70 pt-4">{footer}</div>}
          </div>
        </div>
      )}
    </>
  );
}
