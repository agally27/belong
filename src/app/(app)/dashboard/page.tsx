import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarHeart, CircleDot, Radio } from "lucide-react";
import { IntroductionCard, MatchCard } from "@/components/cards";
import { Badge, Card, CompanionOrb, EmptyState, LinkButton, SectionTitle, SimulatedBadge, Stat, formatDateTime } from "@/components/ui";
import { env } from "@/lib/config";
import { aiStatus } from "@/lib/services/companion";
import { listEvents } from "@/lib/services/events";
import { listIntroductions } from "@/lib/services/introductions";
import { listIntentions } from "@/lib/services/memory";
import { listConnections } from "@/lib/services/messaging";
import { listMatches, liveIntelligence } from "@/lib/services/network";
import { getCompanion, getProfile } from "@/lib/services/profile";
import { listCircles } from "@/lib/services/circles";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const user = await requireMember();
  const [profile, companion, matches, intros, connections, live, events, circles, intentions, ai] = [
    await getProfile(user.id),
    await getCompanion(user.id),
    await listMatches(user.id),
    await listIntroductions(user.id),
    await listConnections(user.id),
    await liveIntelligence(user.id),
    await listEvents(user.id),
    await listCircles(user.id),
    await listIntentions(user.id),
    await aiStatus(),
  ];
  const name = profile?.displayName.split(" ")[0] ?? "there";
  const awaitingMe = intros.filter((i) => i.status === "pending" && i.myDecision === "pending");
  const fresh = matches.filter((m) => !m.introduction);
  const activeIntentions = intentions.filter((i) => i.status === "active");
  const going = events.filter((e) => e.iAmGoing).slice(0, 3);
  const resonating = live.mine.filter((m) => m.resonance > 0);

  // The companion's briefing is assembled from the member's own data only.
  const briefing = awaitingMe.length
    ? `${awaitingMe[0].member.name} would like to be introduced to you. Have a look when you're ready — there's no rush, and no obligation.`
    : fresh.length
      ? `I've noticed ${fresh.length} ${fresh.length === 1 ? "person" : "people"} you might get along with. ${fresh[0].reasons[0]?.text ?? ""}.`
      : resonating.length
        ? `${resonating[0].resonance} other ${resonating[0].resonance === 1 ? "member is" : "members are"} looking for ${resonating[0].label} company right now, just like you.`
        : activeIntentions.length
          ? "I'm keeping an eye out for you. Nothing new just yet — good matches are worth a little patience."
          : "Tell me what you'd love company for this week, and I'll start looking.";

  return (
    <div className="space-y-9">
      <header>
        <h1 className="text-3xl text-charcoal sm:text-4xl">
          {greeting()}, {name}.
        </h1>
        <p className="mt-1.5 text-ink-500">Here&apos;s what&apos;s been happening while you were away.</p>
      </header>

      <section aria-label="Companion briefing" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-lavender-100 via-ivory to-sage-100 p-6 sm:p-8">
        <span aria-hidden className="blob animate-drift absolute -right-12 -top-12 h-44 w-44 bg-sky-200/50" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <CompanionOrb style={companion.style} size={64} animate />
          <div className="flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-lavender-700">
              {companion.name}, your companion {ai.simulated && <SimulatedBadge />}
            </p>
            <p className="mt-1.5 font-display text-xl leading-snug text-charcoal sm:text-2xl">{briefing}</p>
          </div>
          <LinkButton href="/companion" variant="primary" className="shrink-0">
            Talk to {companion.name} <ArrowRight size={16} />
          </LinkButton>
        </div>
      </section>

      <section aria-label="At a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Suggestions" value={fresh.length} hint="waiting in Discover" />
        <Stat label="Introductions" value={awaitingMe.length} hint="awaiting your answer" />
        <Stat label="Connections" value={connections.length} hint="people you've met" />
        <Stat label="Circles" value={circles.mine.length} hint="you belong to" />
      </section>

      {awaitingMe.length > 0 && (
        <section>
          <SectionTitle>Waiting for your answer</SectionTitle>
          <div className="grid gap-4">
            {awaitingMe.slice(0, 2).map((i) => (
              <IntroductionCard key={i.id} intro={i} demoMode={env.demoMode()} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          action={
            <Link href="/discover" className="text-sm font-medium text-lavender-600 hover:underline">
              See all
            </Link>
          }
        >
          People you might get along with
        </SectionTitle>
        {fresh.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {fresh.slice(0, 2).map((m) => (
              <MatchCard key={m.id} match={m} demoMode={env.demoMode()} compact />
            ))}
          </div>
        ) : (
          <EmptyState title="No suggestions just yet" body="Your companion looks for people whenever you share something new. A quick chat is the best way to get things moving." action={<LinkButton href="/companion">Talk to {companion.name}</LinkButton>} />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {live.enabled && (
          <Card>
            <SectionTitle
              action={
                <Link href="/live" className="text-sm font-medium text-lavender-600 hover:underline">
                  Open Live
                </Link>
              }
            >
              <span className="inline-flex items-center gap-2">
                <Radio size={18} className="text-sky-500" /> Happening now
              </span>
            </SectionTitle>
            {activeIntentions.length ? (
              <ul className="space-y-2.5">
                {activeIntentions.slice(0, 3).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl bg-ivory px-4 py-3">
                    <span className="text-sm text-ink-700">{i.title}</span>
                    <Badge tone={i.shared ? "sky" : "neutral"}>{i.shared ? "Shared" : "Private"}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">You&apos;re not sharing any intentions at the moment. Tell your companion what you&apos;d like company for.</p>
            )}
          </Card>
        )}
        <Card>
          <SectionTitle
            action={
              <Link href="/events" className="text-sm font-medium text-lavender-600 hover:underline">
                All events
              </Link>
            }
          >
            <span className="inline-flex items-center gap-2">
              <CalendarHeart size={18} className="text-sage-500" /> Coming up
            </span>
          </SectionTitle>
          {going.length ? (
            <ul className="space-y-2.5">
              {going.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="block rounded-xl bg-ivory px-4 py-3 hover:bg-cream">
                    <span className="block text-sm font-medium text-charcoal">{e.title}</span>
                    <span className="text-xs text-ink-500">
                      {formatDateTime(e.startsAt)} · {e.area}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">Nothing in your diary yet. Events are an easy, low-pressure way to meet a few people at once.</p>
          )}
          {circles.mine.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-500">
              <CircleDot size={15} className="text-sage-500" /> Your Circles:
              {circles.mine.map((c) => (
                <Link key={c.id} href={`/circles/${c.id}`} className="font-medium text-ink-700 hover:text-lavender-600">
                  {c.name}
                </Link>
              ))}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
