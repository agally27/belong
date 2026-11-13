import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { ReasonList, SafetyControls } from "@/components/cards";
import { Avatar, Badge, Card, DemoBadge, LinkButton, Notice, TopicChip } from "@/components/ui";
import { topicLabel } from "@/lib/matching/topics";
import { listIntroductions } from "@/lib/services/introductions";
import { getMemberPreview } from "@/lib/services/members";
import { listConnections } from "@/lib/services/messaging";
import { listMatches } from "@/lib/services/network";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Member" };

const REL: Record<string, string> = { connected: "Connected", introduction: "Introduction in progress", suggested: "Suggested by your companion", circle: "In one of your Circles" };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  if (id === user.id) redirect("/profile");
  // Permission check: returns null unless there is a real relationship and no block.
  const member = await getMemberPreview(user.id, id);
  if (!member) notFound();
  const match = (await listMatches(user.id)).find((m) => m.member.id === id);
  const connection = (await listConnections(user.id)).find((c) => c.member.id === id);
  const intro = (await listIntroductions(user.id)).find((i) => i.member.id === id && i.status === "pending");
  return (
    <div className="max-w-2xl space-y-6">
      <Card className="!p-7">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar name={member.name} hue={member.hue} size={88} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-4xl text-charcoal">{member.name}</h1>
              {member.isDemo && <DemoBadge />}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-500">
              {member.pronouns && <span>{member.pronouns}</span>}
              {member.area && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} /> {member.area}
                </span>
              )}
            </p>
            <Badge tone="lavender" className="mt-2.5">
              {REL[member.relationship] ?? "Member"}
            </Badge>
          </div>
        </div>
        {member.bio && <p className="mt-6 text-lg text-ink-700">{member.bio}</p>}
        {member.interests.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Interests</p>
            <div className="flex flex-wrap gap-1.5">
              {member.interests.map((t) => (
                <TopicChip key={t} label={topicLabel(t)} />
              ))}
            </div>
          </div>
        )}
        {match && (
          <div className="mt-6 rounded-xl bg-ivory p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Why your companion thinks you&apos;d get along</p>
            <ReasonList reasons={match.reasons} />
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {connection?.conversationId && <LinkButton href={`/messages/${connection.conversationId}`}>Message {member.name}</LinkButton>}
          {!connection && intro && <LinkButton href="/introductions">View introduction</LinkButton>}
          {!connection && !intro && match && <LinkButton href="/discover">Ask for an introduction in Discover</LinkButton>}
        </div>
      </Card>
      <Notice tone="lavender">This is everything {member.name} has chosen to show. Memories, companion conversations and exact locations are never visible to other members.</Notice>
      <SafetyControls member={member} />
    </div>
  );
}
