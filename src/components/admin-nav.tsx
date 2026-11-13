"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  ["/admin", "Overview"],
  ["/admin/users", "Members"],
  ["/admin/signals", "Signals"],
  ["/admin/matching", "Matching"],
  ["/admin/introductions", "Introductions"],
  ["/admin/circles", "Circles"],
  ["/admin/moderation", "Moderation"],
  ["/admin/subscriptions", "Subscriptions"],
  ["/admin/analytics", "Analytics"],
  ["/admin/flags", "Feature flags"],
  ["/admin/audit", "Audit log"],
] as const;

export function AdminNav({ openReports }: { openReports: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
      {ITEMS.map(([href, label]) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx("flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors", active ? "bg-charcoal font-medium text-ivory" : "text-ink-700 hover:bg-cream")}
          >
            {label}
            {href === "/admin/moderation" && openReports > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[0.7rem] font-semibold leading-5 text-white">{openReports}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
