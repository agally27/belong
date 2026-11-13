import type { Metadata } from "next";
import Link from "next/link";
import { CalendarHeart, CircleDot, Lightbulb, MapPin } from "lucide-react";
import { DIMENSION_LABEL, MatchCard } from "@/components/cards";
import { Badge, Card, EmptyState, LinkButton, Notice, PageHeader, SectionTitle, cx, formatDateTime } from "@/components/ui";
import { env } from "@/lib/config";
import { listCircles } from "@/lib/services/circles";
import { flag, getConsents } from "@/lib/services/core";
import { listEvents, suggestedActivities } from "@/lib/services/events";
import { listMatches, markMatchesSeen } from "@/lib/services/network";
import { getCompanion, getProfile } from "@/lib/services/profile";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Discover" };

const FILTERS = [
  ["all", "Everyone"],
  ["shared", DIMENSION_LABEL.shared],
  ["moments", DIMENSION_LABEL.moments],
  ["complementary", DIMENSION_LABEL.complementary],
  ["nearby", "In my area"],
  ["collaboration", "Collaborations"],
] as const;

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireMember();
  const { view = "all" } = await searchParams;
  const [all, profile, companion, consents, circles, events, activities, circlesOn, eventsOn] = [
    await listMatches(user.id),
    await getProfile(user.id),
    await getCompanion(user.id),
    await getConsents(user.id),
    await listCircles(user.id),
    await listEvents(user.id),
    await suggestedActivities(user.id),
    await flag("circles"),
    await flag("events"),
  ];
  await markMatchesSeen(user.id);

  const town = (profile?.area ?? "").split(",").pop()?.trim().toLowerCase() ?? "";
  const matches = all.filter((m) => {
    if (view === "shared" || view === "moments" || view === "complementary") return m.reasons.some((r) => r.dimension === view);
    if (view === "nearby") return Boolean(town) && consents.share_area && (m.member.area ?? "").toLowerCase().includes(town);
    if (view === "collaboration") return m.reasons.some((r) => /collaborat/i.test(r.text));
    return true;
  });
  const suggestedCircles = circles.suggested.slice(0, 3);
  const suggestedEvents = events.filter((e) => !e.iAmGoing && e.fit).slice(0, 3);

  return (
    <div className="space-y-9">
      <PageHeader eyebrow="Discover" title="People worth meeting" description={`${companion.name} compares your approved signals with other members' — and explains every suggestion. Nobody is contacted unless you ask, and nothing happens unless they say yes too.`} />

      {!consents.matching_enabled && (
        <Notice tone="peach">
          Matching is switched off, so {companion.name} isn&apos;t looking for connections.{" "}
          <Link href="/settings/privacy" className="font-medium underline">
            Turn it on in Privacy &amp; consent
          </Link>
          .
        </Notice>
      )}

      <nav aria-label="Filter suggestions" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={key === "all" ? "/discover" : `/discover?view=${key}`} aria-current={view === key ? "page" : undefined} className={cx("chip-toggle shrink-0", view === key && "!border-lavender-400 !bg-lavender-100 !text-lavender-700")}>
            {key === "nearby" && <MapPin size={14} />}
            {label}
          </Link>
        ))}
      </nav>

      <section aria-label="Suggested connections">
        {matches.length ? (
          <div className="grid gap-5">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} demoMode={env.demoMode()} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={all.length ? "Nobody in this view right now" : "No suggestions just yet"}
            body={all.length ? "Try another filter, or share a new intention to widen the search." : `Good matches take a little time. The more ${companion.name} understands what you're hoping for, the better it can look.`}
            action={
              <>
                <LinkButton href="/companion">Talk to {companion.name}</LinkButton>
                {all.length > 0 && (
                  <LinkButton href="/discover" variant="outline">
                    Show everyone
                  </LinkButton>
                )}
              </>
            }
          />
        )}
      </section>

      {activities.length > 0 && (
        <section>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Lightbulb size={19} className="text-peach-700" /> Ideas for things to do
            </span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {activities.map((a) => (
              <div key={a.topic} className="rounded-2xl border border-sand/70 bg-paper px-5 py-4">
                <Badge tone="peach" className="capitalize">
                  {a.label}
                </Badge>
                <p className="mt-2 text-ink-700">{a.idea}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {circlesOn && (
          <Card>
            <SectionTitle action={<Link href="/circles" className="text-sm font-medium text-lavender-600 hover:underline">All Circles</Link>}>
              <span className="inline-flex items-center gap-2">
                <CircleDot size={18} className="text-sage-500" /> Circles that suit you
              </span>
            </SectionTitle>
            {suggestedCircles.length ? (
              <ul className="space-y-2.5">
                {suggestedCircles.map((c) => (
                  <li key={c.id}>
                    <Link href={`/circles/${c.id}`} className="block rounded-xl bg-ivory px-4 py-3 hover:bg-cream">
                      <span className="block font-medium text-charcoal">{c.name}</span>
                      <span className="text-xs text-ink-500">
                        {c.fit} · {c.memberCount}/{c.capacity} people · {c.area}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">No open Circles match your interests yet. You could start one.</p>
            )}
          </Card>
        )}
        {eventsOn && (
          <Card>
            <SectionTitle action={<Link href="/events" className="text-sm font-medium text-lavender-600 hover:underline">All events</Link>}>
              <span className="inline-flex items-center gap-2">
                <CalendarHeart size={18} className="text-sage-500" /> Events you might enjoy
              </span>
            </SectionTitle>
            {suggestedEvents.length ? (
              <ul className="space-y-2.5">
                {suggestedEvents.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}`} className="block rounded-xl bg-ivory px-4 py-3 hover:bg-cream">
                      <span className="block font-medium text-charcoal">{e.title}</span>
                      <span className="text-xs text-ink-500">
                        {formatDateTime(e.startsAt)} · {e.area} · {e.fit}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Nothing new that matches your interests this week.</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
