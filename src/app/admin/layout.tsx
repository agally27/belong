import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { AdminNav } from "@/components/admin-nav";
import { Badge, Logo } from "@/components/ui";
import { overview } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · BELONG Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const o = await overview(admin.id);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-sand/60 bg-paper/70 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="mb-4 flex items-center justify-between gap-2 lg:mb-6">
          <Logo href="/admin" />
          <Badge tone="peach">Admin</Badge>
        </div>
        <AdminNav openReports={o.openReports} />
        <div className="mt-2 flex gap-3 border-sand/70 text-sm lg:mt-6 lg:flex-col lg:gap-1 lg:border-t lg:pt-4">
          {admin.onboardedAt && (
            <Link href="/dashboard" className="rounded-xl px-3 py-2 text-ink-700 hover:bg-cream">
              Member view
            </Link>
          )}
          <form action={logoutAction}>
            <button type="submit" className="rounded-xl px-3 py-2 text-ink-700 hover:bg-cream">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
