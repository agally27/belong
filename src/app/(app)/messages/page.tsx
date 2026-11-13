import type { Metadata } from "next";
import Link from "next/link";
import { CircleDot, MessageCircle } from "lucide-react";
import { Avatar, DemoBadge, EmptyState, LinkButton, PageHeader, timeAgo } from "@/components/ui";
import { listConversations } from "@/lib/services/messaging";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const user = await requireMember();
  const conversations = await listConversations(user.id);
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Messages" title="Your conversations" description="Private between you and people you've mutually connected with. Nobody else — including BELONG's team and your companion — reads them." />
      {conversations.length ? (
        <ul className="divide-y divide-sand/60 overflow-hidden rounded-2xl border border-sand/70 bg-paper">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-cream/60 sm:px-5">
                {c.member ? (
                  <Avatar name={c.member.name} hue={c.member.hue} size={48} />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sage-600">
                    <CircleDot size={22} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`font-display text-lg ${c.unread ? "text-charcoal" : "text-ink-700"}`}>{c.title}</span>
                    {c.kind === "circle" && <span className="text-xs text-sage-600">Circle</span>}
                    {c.member?.isDemo && <DemoBadge />}
                  </span>
                  <span className={`block truncate text-sm ${c.unread ? "font-medium text-charcoal" : "text-ink-500"}`}>{c.lastMessage ?? "Say hello — you both said yes."}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  {c.lastAt && <span className="text-xs text-ink-500">{timeAgo(c.lastAt)}</span>}
                  {c.unread > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-lavender-600 px-1.5 text-[0.7rem] font-semibold leading-5 text-white">{c.unread}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<MessageCircle size={36} />} title="No conversations yet" body="Messaging opens once an introduction has been approved by both of you, or when you join a Circle." action={<LinkButton href="/discover">Go to Discover</LinkButton>} />
      )}
    </div>
  );
}
