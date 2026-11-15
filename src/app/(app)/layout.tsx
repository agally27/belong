import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { logoutAction, resendVerificationAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { emailConfigured } from "@/lib/adapters/notifications";
import { verificationRequired } from "@/lib/services/verification";
import { MobileNav, SideNav } from "@/components/app-nav";
import { Avatar, Badge, Logo } from "@/components/ui";
import { env } from "@/lib/config";
import { getDb } from "@/lib/db";
import { unreadNotificationCount } from "@/lib/services/account";
import { getFlags } from "@/lib/services/core";
import { unreadMessageCount } from "@/lib/services/messaging";
import { getProfile } from "@/lib/services/profile";
import { requireMember } from "@/lib/session";

async function navCounts(userId: string) {
  const db = await getDb();
  const intros = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM introductions WHERE status = 'pending' AND ((user_a = ? AND a_decision = 'pending') OR (user_b = ? AND b_decision = 'pending'))",
    [userId, userId],
  );
  const suggestions = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM matches WHERE status = 'suggested' AND ((user_a = ? AND a_state = 'new') OR (user_b = ? AND b_state = 'new'))",
    [userId, userId],
  );
  const gatherings = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM gathering_invites i JOIN gatherings g ON g.id = i.gathering_id WHERE i.user_id = ? AND i.status = 'invited' AND g.status IN ('proposed', 'confirmed') AND g.starts_at > ?",
    [userId, new Date().toISOString()],
  );
  return {
    gatherings: Number(gatherings?.n ?? 0),
    messages: await unreadMessageCount(userId),
    introductions: Number(intros?.n ?? 0),
    notifications: await unreadNotificationCount(userId),
    suggestions: Number(suggestions?.n ?? 0),
  };
}

function SignOut() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[0.95rem] text-ink-700 hover:bg-cream">
        <LogOut size={18} strokeWidth={1.7} /> Sign out
      </button>
    </form>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireMember();
  const [profile, counts, flags] = [await getProfile(user.id), await navCounts(user.id), await getFlags()];
  const name = profile?.displayName ?? "You";
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-sand/60 bg-paper/60 px-4 py-5 lg:flex">
        <Logo href="/dashboard" className="px-2" />
        <div className="mt-7 flex-1">
          <SideNav counts={counts} flags={flags} />
        </div>
        <div className="mt-5 border-t border-sand/70 pt-4">
          <Link href="/profile" className="mb-1 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-cream">
            <Avatar name={name} hue={profile?.hue ?? 260} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-charcoal">{name}</span>
              <span className="block truncate text-xs text-ink-500">{user.email}</span>
            </span>
          </Link>
          {user.role === "admin" && (
            <Link href="/admin" className="block rounded-xl px-3 py-2 text-[0.95rem] text-ink-700 hover:bg-cream">
              Admin console
            </Link>
          )}
          <SignOut />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-sand/50 bg-ivory/90 px-4 py-3 backdrop-blur lg:hidden">
          <Logo href="/dashboard" />
          <Link href="/notifications" className="relative rounded-full p-2 text-ink-700 hover:bg-cream" aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ""}`}>
            <Bell size={21} strokeWidth={1.7} />
            {counts.notifications > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-ivory bg-lavender-600" />}
          </Link>
        </header>
        {verificationRequired() && !user.emailVerifiedAt && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-peach-200 bg-peach-100/60 px-4 py-2 text-center text-sm text-peach-700">
            <span>Please confirm your email address ({user.email}) so you can start meeting people.</span>
            <ActionButton action={resendVerificationAction} variant="ghost" className="!py-1 underline">
              Send a new link
            </ActionButton>
            {!emailConfigured() && (
              <Link href="/dev/outbox" className="font-medium underline">
                Open the development outbox
              </Link>
            )}
          </div>
        )}
        {env.demoMode() && user.isDemo && (
          <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-xs text-sky-700">
            <Badge tone="sky" className="mr-2">
              Demo
            </Badge>
            You&apos;re exploring as a fictional member. Everyone you see here is fictional, and companion replies are simulated.
          </div>
        )}
        <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-8 sm:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
      <MobileNav counts={counts} flags={flags} footer={<SignOut />} />
    </div>
  );
}
