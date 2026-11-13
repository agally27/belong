import type { Metadata } from "next";
import { Users } from "lucide-react";
import { endConnectionAction } from "@/app/actions";
import { MemberHeader } from "@/components/cards";
import { ActionButton } from "@/components/forms";
import { Card, EmptyState, LinkButton, Notice, PageHeader, TopicChip, formatDate } from "@/components/ui";
import { topicLabel } from "@/lib/matching/topics";
import { listConnections } from "@/lib/services/messaging";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "My connections" };

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ blocked?: string }> }) {
  const user = await requireMember();
  const [connections, { blocked }] = [await listConnections(user.id), await searchParams];
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="My connections"
        title="The people you've met"
        description="Everyone here said yes to meeting you, and you said yes to them."
        actions={
          <LinkButton href="/graph" variant="outline">
            View Connection Graph
          </LinkButton>
        }
      />
      {blocked && <Notice tone="sage">Done. They&apos;ve been blocked, and you won&apos;t be suggested to each other again. You can undo this in Privacy &amp; consent.</Notice>}
      {connections.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {connections.map((c) => (
            <Card key={c.id}>
              <MemberHeader member={c.member} sub={<span>Connected {formatDate(c.since)}</span>} />
              {c.member.bio && <p className="mt-3 text-sm text-ink-500">{c.member.bio}</p>}
              {c.sharedTopics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.sharedTopics.map((t) => (
                    <TopicChip key={t} label={topicLabel(t)} tone="lavender" />
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {c.conversationId && (
                  <LinkButton href={`/messages/${c.conversationId}`} size="sm">
                    Message {c.member.name}
                  </LinkButton>
                )}
                <LinkButton href={`/members/${c.member.id}`} variant="outline" size="sm">
                  Profile
                </LinkButton>
                <ActionButton action={endConnectionAction} fields={{ id: c.id }} variant="ghost" confirm={`Remove ${c.member.name} from your connections? Your conversation will close.`}>
                  Remove
                </ActionButton>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users size={36} />} title="No connections yet" body="Your first one starts with an introduction you both approve." action={<LinkButton href="/discover">See who your companion has noticed</LinkButton>} />
      )}
    </div>
  );
}
