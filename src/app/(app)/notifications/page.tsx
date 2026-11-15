import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CalendarHeart, CircleDot, Compass, CreditCard, HeartHandshake, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { markAllNotificationsReadAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { EmptyState, PageHeader, cx, timeAgo } from "@/components/ui";
import { listNotifications } from "@/lib/services/account";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Notifications" };

const ICON: Record<string, typeof Bell> = {
  match: Compass,
  introduction: HeartHandshake,
  connection: Users,
  message: MessageCircle,
  circle: CircleDot,
  gathering: Users,
  event: CalendarHeart,
  membership: CreditCard,
  safety: ShieldCheck,
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireMember();
  const show = Math.min(1000, Math.max(30, Math.trunc(Number((await searchParams).show)) || 30));
  const fetched = await listNotifications(user.id, show + 1);
  const hasOlder = fetched.length > show;
  const items = fetched.slice(0, show);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Notifications"
        title="What's new"
        description={unread ? `${unread} unread.` : "You're all caught up."}
        actions={
          unread > 0 && (
            <ActionButton action={markAllNotificationsReadAction} variant="outline">
              Mark all as read
            </ActionButton>
          )
        }
      />
      {items.length ? (
        <ul className="divide-y divide-sand/60 overflow-hidden rounded-2xl border border-sand/70 bg-paper">
          {items.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            const inner = (
              <span className="flex gap-4 px-4 py-4 sm:px-5">
                <span className={cx("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full", n.readAt ? "bg-cream text-ink-500" : "bg-lavender-100 text-lavender-600")}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block", n.readAt ? "text-ink-700" : "font-medium text-charcoal")}>{n.title}</span>
                  {n.body && <span className="block text-sm text-ink-500">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-ink-300">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-lavender-600" aria-label="Unread" />}
              </span>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} className="block hover:bg-cream/60">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {hasOlder && (
        <div className="mt-4 text-center">
          <Link href={`/notifications?show=${show + 60}`} scroll={false} className="text-sm font-medium text-lavender-600 hover:underline">
            Show older notifications
          </Link>
        </div>
      )}
      {items.length ? null : (
        <EmptyState icon={<Bell size={36} />} title="Nothing yet" body="You'll hear about new suggestions, introductions and messages here." />
      )}
    </div>
  );
}
