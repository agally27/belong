import type { Metadata } from "next";
import Link from "next/link";
import { Radio, Timer, Users } from "lucide-react";
import { createIntentionAction, endIntentionAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { ReasonList } from "@/components/cards";
import { Avatar, Badge, Card, DemoBadge, EmptyState, LinkButton, Notice, PageHeader, SectionTitle, timeAgo } from "@/components/ui";
import { getConsents } from "@/lib/services/core";
import { listIntentions } from "@/lib/services/memory";
import { listMatches, liveIntelligence } from "@/lib/services/network";
import { getCompanion } from "@/lib/services/profile";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Live" };

export default async function LivePage() {
  const user = await requireMember();
  const [live, intentions, matches, companion, consents] = [
    await liveIntelligence(user.id),
    await listIntentions(user.id),
    await listMatches(user.id),
    await getCompanion(user.id),
    await getConsents(user.id),
  ];
  if (!live.enabled) {
    return <EmptyState title="Live is paused" body="Live Connection Intelligence is switched off at the moment. Your lasting interests are still being matched." action={<LinkButton href="/discover">Go to Discover</LinkButton>} />;
  }
  const active = intentions.filter((i) => i.status === "active");
  const momentMatches = matches.filter((m) => m.reasons.some((r) => r.dimension === "moments"));
  const sharing = consents.matching_enabled && consents.share_intentions;

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Live Connection Intelligence"
        title="Right now, around you"
        description="Friendship is often about timing. Live looks at temporary signals — what people are hoping for this week — and tells you when you're in the same moment as someone else."
      />

      {!sharing && (
        <Notice tone="peach">
          You&apos;re not sharing current intentions, so you won&apos;t appear in anyone&apos;s live matches.{" "}
          <Link href="/settings/privacy" className="font-medium underline">
            Change this in Privacy &amp; consent
          </Link>
          .
        </Notice>
      )}

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-100 via-ivory to-lavender-100 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <p className="flex items-center gap-2.5 font-display text-2xl text-charcoal">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-300 opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
            </span>
            {live.liveMembers} {live.liveMembers === 1 ? "companion is" : "companions are"} carrying a live signal
          </p>
          <p className="text-sm text-ink-500">You see counts only. Who they are stays private until an introduction is mutual.</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_21rem]">
        <section>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Timer size={19} className="text-sky-500" /> Your live signals
            </span>
          </SectionTitle>
          {active.length ? (
            <ul className="space-y-3">
              {active.map((i) => {
                const res = live.mine.filter((m) => i.topics.includes(m.topic));
                const best = Math.max(0, ...res.map((r) => r.resonance));
                return (
                  <li key={i.id} className="rounded-2xl border border-sand/70 bg-paper p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-lg text-charcoal">{i.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                          <Badge tone={i.shared && i.topics.length ? "sky" : "neutral"}>{i.shared && i.topics.length ? "Shared" : "Private"}</Badge>
                          Expires {timeAgo(i.expiresAt)}
                        </p>
                      </div>
                      <ActionButton action={endIntentionAction} fields={{ id: i.id }} variant="ghost">
                        End now
                      </ActionButton>
                    </div>
                    {i.shared && i.topics.length > 0 && (
                      <p className="mt-3 flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-700">
                        <Users size={15} />
                        {best > 0 ? `${best} other ${best === 1 ? "member is" : "members are"} in the same moment right now.` : "Nobody else is in this moment yet — your companion is watching."}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<Radio size={36} />} title="You have no live signals" body={`Tell ${companion.name} what you'd love company for, or share an intention here.`} />
          )}
        </section>

        <Card className="h-fit">
          <h2 className="text-lg text-charcoal">Share a moment</h2>
          <p className="mt-1 text-sm text-ink-500">It becomes a temporary signal and disappears on its own.</p>
          <ActionForm action={createIntentionAction} className="mt-4 space-y-3" resetOnSuccess>
            <label className="sr-only" htmlFor="live-title">
              What are you hoping for?
            </label>
            <input id="live-title" name="title" className="field text-sm" placeholder="e.g. Coffee company this weekend" required minLength={5} maxLength={160} />
            <input type="hidden" name="mode" value="moment" />
            <select name="days" className="field text-sm" defaultValue="3" aria-label="How long to share">
              <option value="1">Today and tomorrow</option>
              <option value="3">3 days</option>
              <option value="7">1 week</option>
            </select>
            <SubmitButton variant="accent" size="sm" className="w-full">
              Share for now
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <section>
        <SectionTitle action={<Link href="/discover?view=moments" className="text-sm font-medium text-lavender-600 hover:underline">Open in Discover</Link>}>People in the same moment as you</SectionTitle>
        {momentMatches.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {momentMatches.map((m) => (
              <Card key={m.id}>
                <div className="flex items-center gap-3">
                  <Avatar name={m.member.name} hue={m.member.hue} size={44} />
                  <div>
                    <p className="font-display text-lg text-charcoal">{m.member.name}</p>
                    <p className="text-xs text-ink-500">{m.member.area}</p>
                  </div>
                  {m.member.isDemo && <DemoBadge className="ml-auto" />}
                </div>
                <div className="mt-3">
                  <ReasonList reasons={m.reasons.filter((r) => r.dimension === "moments")} />
                </div>
                <LinkButton href="/discover?view=moments" variant="soft" size="sm" className="mt-4">
                  {m.introduction ? "See introduction" : "Ask for an introduction"}
                </LinkButton>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-500">No live overlaps at the moment. They tend to appear within a day or two of sharing a moment.</p>
        )}
      </section>

      <section>
        <SectionTitle>The wider pulse</SectionTitle>
        <p className="-mt-1 mb-4 text-sm text-ink-500">Other things members&apos; companions are noticing this week. Fancy joining in? Share a moment of your own.</p>
        {live.pulse.length ? (
          <div className="flex flex-wrap gap-2.5">
            {live.pulse.map((p) => (
              <span key={p.topic} className="inline-flex items-center gap-2 rounded-full border border-sand/70 bg-paper px-4 py-2 text-sm capitalize text-ink-700">
                {p.label}
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">{p.resonance}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-500">It&apos;s quiet right now.</p>
        )}
      </section>
    </div>
  );
}
