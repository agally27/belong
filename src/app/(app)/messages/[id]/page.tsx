import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lightbulb, Sparkles } from "lucide-react";
import { ReasonList, SafetyControls } from "@/components/cards";
import { Avatar, Card, DemoBadge, SimulatedBadge, TopicChip } from "@/components/ui";
import { topicLabel } from "@/lib/matching/topics";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/services/core";
import { previewsById } from "@/lib/services/members";
import { connectionAssistant, getMessages, markRead } from "@/lib/services/messaging";
import { requireMember } from "@/lib/session";
import { MessageThread } from "./thread";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const show = Math.min(2000, Math.max(100, Math.trunc(Number((await searchParams).show)) || 100));
  let data;
  try {
    data = await getMessages(user.id, id, show);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  await markRead(user.id, id);
  const { access, messages, hasEarlier } = data;
  const other = access.otherId ? (await previewsById([access.otherId])).get(access.otherId) : null;
  const circle = access.circleId ? await (await getDb()).get<{ id: string; name: string }>("SELECT id, name FROM circles WHERE id = ?", [access.circleId]) : null;
  const assistant = await connectionAssistant(user.id, id);
  const gathering = access.gatheringId ? await (await getDb()).get<{ title: string }>("SELECT title FROM gatherings WHERE id = ?", [access.gatheringId]) : null;
  const title = other?.name ?? circle?.name ?? gathering?.title ?? "Conversation";

  return (
    <div>
      <header className="mb-4 flex items-center gap-3">
        <Link href="/messages" aria-label="Back to messages" className="rounded-full p-2 text-ink-700 hover:bg-cream">
          <ArrowLeft size={20} />
        </Link>
        {other && <Avatar name={other.name} hue={other.hue} size={44} />}
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl text-charcoal">
            {other ? <Link href={`/members/${other.id}`}>{title}</Link> : circle ? <Link href={`/circles/${circle.id}`}>{title}</Link> : title}
            {other?.isDemo && <DemoBadge />}
          </h1>
          <p className="text-sm text-ink-500">{other ? `${other.area ?? ""} · private conversation` : gathering ? "Get-together chat · only people who said yes" : "Circle conversation · visible to members only"}</p>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_19rem]">
        <div className="min-w-0">
        {hasEarlier && (
          <p className="mb-2 text-center">
            <Link href={`/messages/${id}?show=${show + 100}`} scroll={false} className="text-sm font-medium text-lavender-600 hover:underline">
              Show earlier messages
            </Link>
          </p>
        )}
        <MessageThread
          conversationId={id}
          group={access.kind !== "direct"}
          starters={assistant?.starters ?? []}
          messages={messages.map((m) => ({
            id: m.id,
            mine: m.mine,
            senderName: m.senderName,
            content: m.content,
            simulated: m.simulated,
            time: new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }),
          }))}
        />
        </div>
        {other && (
          <aside className="space-y-4" aria-label="Connection assistant">
            {assistant && (
              <Card>
                <h2 className="flex flex-wrap items-center gap-2 text-lg text-charcoal">
                  <Sparkles size={17} className="text-lavender-500" /> Connection assistant {assistant.simulated && <SimulatedBadge />}
                </h2>
                <p className="mt-1 text-xs text-ink-500">Ideas based on what you two have in common. Your companion never reads these messages.</p>
                {assistant.sharedTopics.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {assistant.sharedTopics.map((t) => (
                      <TopicChip key={t} label={topicLabel(t)} tone="lavender" />
                    ))}
                  </div>
                )}
                {assistant.reasons.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">Why you were introduced</p>
                    <ReasonList reasons={assistant.reasons.slice(0, 3).map((text) => ({ text }))} />
                  </div>
                )}
                <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500">Conversation starters</p>
                <ul className="space-y-1.5 text-sm text-ink-700">
                  {assistant.starters.map((s) => (
                    <li key={s} className="rounded-lg bg-ivory px-3 py-2">
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="mb-1.5 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
                  <Lightbulb size={13} /> Things you could do together
                </p>
                <ul className="space-y-1.5 text-sm text-ink-700">
                  {assistant.activities.map((s) => (
                    <li key={s} className="rounded-lg bg-sage-50 px-3 py-2">
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-ink-500">Meeting for the first time? Choose somewhere public and let someone know your plans.</p>
              </Card>
            )}
            <SafetyControls member={other} contextType="message" contextId={id} />
          </aside>
        )}
      </div>
    </div>
  );
}
