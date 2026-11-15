import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarHeart, MapPin, Plus, Video } from "lucide-react";
import { createEventAction, rsvpAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { TopicSelect } from "@/components/topic-select";
import { Badge, Card, EmptyState, Field, LinkButton, Notice, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { flag } from "@/lib/services/core";
import { listEvents, suggestedActivities, type EventView } from "@/lib/services/events";
import { getLimits } from "@/lib/services/subscriptions";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Events" };

function EventCard({ e }: { e: EventView }) {
  const d = new Date(e.startsAt);
  const full = e.going >= e.capacity;
  return (
    <Card className="flex gap-4">
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-lavender-100 text-lavender-700">
        <span className="text-[0.7rem] font-semibold uppercase tracking-wider">{d.toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" })}</span>
        <span className="font-display text-2xl leading-none">{d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="sage" className="capitalize">
            {e.topicLabel}
          </Badge>
          {e.circleName && <Badge tone="lavender">{e.circleName}</Badge>}
          {e.iAmGoing && <Badge tone="sky">You&apos;re going</Badge>}
        </div>
        <h3 className="mt-2 text-xl text-charcoal">
          <Link href={`/events/${e.id}`} className="hover:text-lavender-600">
            {e.title}
          </Link>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-500">
          <span>
            {d.toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}
          </span>
          <span className="inline-flex items-center gap-1">
            {e.format === "online" ? <Video size={13} /> : <MapPin size={13} />} {e.area ?? "To be confirmed"}
          </span>
          <span>
            {e.going}/{e.capacity} going
          </span>
        </p>
        {e.fit && <p className="mt-1 text-xs font-medium text-lavender-600">{e.fit}</p>}
        <div className="mt-3">
          {e.iAmGoing ? (
            e.iAmHost ? (
              <span className="text-xs text-ink-500">You&apos;re hosting</span>
            ) : (
              <ActionButton action={rsvpAction} fields={{ id: e.id, going: "false" }} variant="ghost">
                Can&apos;t make it
              </ActionButton>
            )
          ) : full ? (
            <span className="text-xs text-ink-500">This event is full</span>
          ) : (
            <ActionButton action={rsvpAction} fields={{ id: e.id, going: "true" }} variant="primary">
              I&apos;ll be there
            </ActionButton>
          )}
        </div>
      </div>
    </Card>
  );
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const user = await requireMember();
  const { cancelled } = await searchParams;
  if (!(await flag("events"))) notFound();
  const [events, limits, ideas] = [await listEvents(user.id), await getLimits(user.id), await suggestedActivities(user.id)];
  const mine = events.filter((e) => e.iAmGoing);
  const others = events.filter((e) => !e.iAmGoing);
  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Events & activities"
        title="Things to do, with people"
        description="Small, friendly get-togethers hosted by members. Only a general area is shown — the exact meeting point is agreed between the people going."
        actions={
          limits.hostEvents ? (
            <details className="relative">
              <summary className={buttonClass("primary", "md", "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                <Plus size={16} /> Host an event
              </summary>
              <Card className="absolute right-0 z-10 mt-2 w-[min(24rem,88vw)] shadow-lift">
                <ActionForm action={createEventAction} className="space-y-3">
                  <Field label="Title">
                    <input name="title" className="field text-sm" required minLength={4} maxLength={80} />
                  </Field>
                  <Field label="Topic">
                    <TopicSelect />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="When">
                      <input type="datetime-local" name="startsAt" className="field text-sm" required />
                    </Field>
                    <Field label="Places">
                      <input type="number" name="capacity" min={2} max={30} defaultValue={8} className="field text-sm" />
                    </Field>
                    <Field label="Format">
                      <select name="format" className="field text-sm" defaultValue="in_person">
                        <option value="in_person">In person</option>
                        <option value="online">Online</option>
                      </select>
                    </Field>
                    <Field label="General area">
                      <input name="area" className="field text-sm" maxLength={60} />
                    </Field>
                  </div>
                  <Field label="Details">
                    <textarea name="description" rows={2} maxLength={600} className="field text-sm" />
                  </Field>
                  <SubmitButton size="sm" className="w-full">
                    Publish event
                  </SubmitButton>
                </ActionForm>
              </Card>
            </details>
          ) : (
            <LinkButton href="/membership" variant="outline">
              Host events with Plus
            </LinkButton>
          )
        }
      />
      {cancelled && <Notice tone="sage">Your event has been cancelled and everyone going has been told.</Notice>}
      {!limits.hostEvents && <Notice tone="lavender">On the free membership you can join any event and plan events inside your Circles. Hosting open events is part of BELONG Plus.</Notice>}

      {mine.length > 0 && (
        <section>
          <SectionTitle>In your diary</SectionTitle>
          <div className="grid gap-4">
            {mine.map((e) => (
              <EventCard key={e.id} e={e} />
            ))}
          </div>
        </section>
      )}
      <section>
        <SectionTitle>Coming up</SectionTitle>
        {others.length ? (
          <div className="grid gap-4">
            {others.map((e) => (
              <EventCard key={e.id} e={e} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<CalendarHeart size={36} />} title="Nothing else coming up" body="New events appear here as members host them." />
        )}
      </section>
      {ideas.length > 0 && (
        <section>
          <SectionTitle>Activity ideas from your interests</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {ideas.map((a) => (
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
    </div>
  );
}
