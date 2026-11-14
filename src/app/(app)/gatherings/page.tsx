import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin, MessageCircle, Tent, Users } from "lucide-react";
import { gatheringToCircleAction, respondGatheringAction, simulateGatheringAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, DemoBadge, EmptyState, LinkButton, Notice, PageHeader, SectionTitle, formatDateTime } from "@/components/ui";
import { env } from "@/lib/config";
import { flag, getConsents } from "@/lib/services/core";
import { listGatherings, type GatheringView } from "@/lib/services/gatherings";
import { getCompanion, getProfile } from "@/lib/services/profile";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Gatherings" };

function GatheringCard({ g, demo }: { g: GatheringView; demo: boolean }) {
  const others = g.invited - 1;
  const need = Math.max(0, g.minSize - g.going);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="sage" className="capitalize">
          {g.topicLabel}
        </Badge>
        <Badge tone={g.status === "confirmed" ? "sky" : g.status === "completed" ? "neutral" : "lavender"}>
          {g.status === "confirmed" ? "Going ahead" : g.status === "completed" ? "Happened" : g.myStatus === "accepted" ? "You're in · waiting for others" : "Suggested for you"}
        </Badge>
      </div>
      <h3 className="mt-3 text-2xl text-charcoal">{g.title}</h3>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={15} /> {formatDateTime(g.startsAt)}
        </span>
        {g.area && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={15} /> Around {g.area}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Users size={15} /> You and {others} {others === 1 ? "other" : "others"} invited · {g.going} said yes
        </span>
      </p>
      <p className="mt-3 rounded-xl bg-ivory px-4 py-3 text-sm text-ink-700">
        {g.reason}. Everyone invited shares this interest, lives within reach, and is usually free on {g.slotLabel}.
      </p>

      {g.status === "proposed" && (
        <>
          <p className="mt-3 text-xs text-ink-500">
            {need > 0 ? `Goes ahead once ${need} more ${need === 1 ? "person says" : "people say"} yes` : "Enough people have said yes"} · answer by {formatDateTime(g.respondBy)} · you&apos;ll see who&apos;s coming once it&apos;s confirmed and you&apos;ve said yes.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {g.myStatus === "invited" ? (
              <>
                <ActionButton action={respondGatheringAction} fields={{ id: g.id, accept: "true" }} variant="accent" size="md">
                  Count me in
                </ActionButton>
                <ActionButton action={respondGatheringAction} fields={{ id: g.id, accept: "false" }} variant="ghost" size="md">
                  Not this time
                </ActionButton>
              </>
            ) : (
              <ActionButton action={respondGatheringAction} fields={{ id: g.id, accept: "false" }} variant="ghost">
                I can&apos;t make it after all
              </ActionButton>
            )}
          </div>
        </>
      )}

      {g.status !== "proposed" && g.myStatus === "invited" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton action={respondGatheringAction} fields={{ id: g.id, accept: "true" }} variant="accent" size="md">
            It&apos;s going ahead — join in
          </ActionButton>
          <ActionButton action={respondGatheringAction} fields={{ id: g.id, accept: "false" }} variant="ghost" size="md">
            Not this time
          </ActionButton>
        </div>
      )}

      {g.status !== "proposed" && g.myStatus === "accepted" && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Who&apos;s coming</p>
            <ul className="flex flex-wrap gap-2">
              <li className="inline-flex items-center gap-2 rounded-full bg-cream px-3 py-1.5 text-sm">You</li>
              {g.members.map((m) => (
                <li key={m.id} className="inline-flex items-center gap-2 rounded-full bg-cream py-1 pl-1 pr-3 text-sm">
                  <Avatar name={m.name} hue={m.hue} size={26} /> {m.name} {m.isDemo && <DemoBadge />}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {g.conversationId && (
              <LinkButton href={`/messages/${g.conversationId}`} size="sm">
                <MessageCircle size={15} /> Group chat
              </LinkButton>
            )}
            {g.status === "confirmed" && (
              <ActionButton action={respondGatheringAction} fields={{ id: g.id, accept: "false" }} variant="ghost" confirm="Let the others know you can't make it?">
                I can&apos;t make it
              </ActionButton>
            )}
            {g.circleId && (
              <LinkButton href={`/circles/${g.circleId}`} variant="sage" size="sm">
                Open the Circle
              </LinkButton>
            )}
          </div>
          {g.canBecomeCircle && (
            <details className="rounded-xl border border-sage-200 bg-sage-50 p-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-sage-700 [&::-webkit-details-marker]:hidden">Enjoyed it? Make it a regular Circle</summary>
              <ActionForm action={gatheringToCircleAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="id" value={g.id} />
                <label className="sr-only" htmlFor={`circle-${g.id}`}>
                  Circle name
                </label>
                <input id={`circle-${g.id}`} name="name" maxLength={60} placeholder="Name your Circle, e.g. Sunday Striders" className="field flex-1 !py-2 text-sm" />
                <SubmitButton variant="sage" size="sm">
                  Create Circle
                </SubmitButton>
              </ActionForm>
              <p className="mt-2 text-xs text-ink-500">Everyone who came is added, and can leave at any time.</p>
            </details>
          )}
          <p className="text-xs text-ink-500">Agree the exact meeting point in the chat, choose somewhere public, and tell someone where you&apos;ll be.</p>
        </div>
      )}

      {demo && g.demoWaiting > 0 && g.status !== "completed" && (
        <Notice tone="sky" className="mt-4">
          <p>
            <strong>Demo control.</strong> {g.demoWaiting} of the people invited are fictional and can&apos;t answer by themselves.
          </p>
          <div className="mt-2">
            <ActionButton action={simulateGatheringAction} fields={{ id: g.id }} variant="primary">
              Simulate their replies
            </ActionButton>
          </div>
        </Notice>
      )}
    </Card>
  );
}

export default async function GatheringsPage() {
  const user = await requireMember();
  if (!(await flag("gatherings"))) notFound();
  const [all, companion, consents, profile] = [await listGatherings(user.id), await getCompanion(user.id), await getConsents(user.id), await getProfile(user.id)];
  const suggested = all.filter((g) => g.myStatus === "invited" && g.status !== "completed");
  const mine = all.filter((g) => g.myStatus === "accepted" && g.status !== "completed");
  const past = all.filter((g) => g.status === "completed");
  const missing = [
    !consents.group_suggestions && "gathering suggestions are switched off",
    !consents.share_area && "sharing your general area is switched off",
    !profile?.district && "you haven't added a postcode district",
    !(profile?.availability.length ?? 0) && "you haven't said when you're usually free",
    profile?.personality.group === "one_to_one" && "you've said you prefer meeting one-to-one",
  ].filter(Boolean) as string[];
  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Gatherings"
        title="An easy way to break the ice"
        description={`${companion.name} looks for a handful of nearby members who share an interest and are free at the same sort of time, then suggests a one-off get-together. Nobody is put in a group — each person chooses. If it goes well, you can turn it into a regular Circle.`}
      />
      {missing.length > 0 && (
        <Notice tone="peach">
          {companion.name} can&apos;t suggest gatherings for you yet: {missing.join("; ")}.{" "}
          <Link href="/profile" className="font-medium underline">
            Update your profile
          </Link>{" "}
          or{" "}
          <Link href="/settings/privacy" className="font-medium underline">
            privacy settings
          </Link>
          .
        </Notice>
      )}
      {!all.length && (
        <EmptyState
          icon={<Tent size={36} />}
          title="Nothing suggested just yet"
          body={`When at least three people nearby share an interest and a free slot, ${companion.name} will propose something here.`}
          action={<LinkButton href="/events">Browse events meanwhile</LinkButton>}
        />
      )}
      {suggested.length > 0 && (
        <section>
          <SectionTitle>Suggested for you</SectionTitle>
          <div className="grid gap-5">
            {suggested.map((g) => (
              <GatheringCard key={g.id} g={g} demo={env.demoMode()} />
            ))}
          </div>
        </section>
      )}
      {mine.length > 0 && (
        <section>
          <SectionTitle>You&apos;re in</SectionTitle>
          <div className="grid gap-5">
            {mine.map((g) => (
              <GatheringCard key={g.id} g={g} demo={env.demoMode()} />
            ))}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <SectionTitle>Recent get-togethers</SectionTitle>
          <div className="grid gap-5">
            {past.map((g) => (
              <GatheringCard key={g.id} g={g} demo={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
