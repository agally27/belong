import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, MapPin, MessageCircle } from "lucide-react";
import { createEventAction, joinCircleAction, leaveCircleAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, DemoBadge, Field, LinkButton, Notice, SectionTitle, formatDateTime } from "@/components/ui";
import { getCircle } from "@/lib/services/circles";
import { flag } from "@/lib/services/core";
import { listEvents } from "@/lib/services/events";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Circle" };

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  if (!(await flag("circles"))) notFound();
  const circle = await getCircle(user.id, id);
  if (!circle) notFound();
  const events = (await listEvents(user.id)).filter((e) => e.circleId === id);
  const full = circle.memberCount >= circle.capacity;
  return (
    <div className="space-y-7">
      <Link href="/circles" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-lavender-600">
        <ArrowLeft size={15} /> All Circles
      </Link>
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sage-100 via-ivory to-lavender-100 p-6 sm:p-8">
        <Badge tone="sage" className="capitalize">
          {circle.topicLabel}
        </Badge>
        <h1 className="mt-3 text-4xl text-charcoal">{circle.name}</h1>
        <p className="mt-2 max-w-2xl text-ink-700">{circle.description}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
          {circle.area && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} /> {circle.area}
            </span>
          )}
          <span>
            {circle.memberCount} of {circle.capacity} people
          </span>
          {circle.fit && <span className="font-medium text-lavender-600">{circle.fit}</span>}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {circle.isMember ? (
            <>
              {circle.conversationId && (
                <LinkButton href={`/messages/${circle.conversationId}`}>
                  <MessageCircle size={16} /> Open group conversation
                </LinkButton>
              )}
              <ActionButton action={leaveCircleAction} fields={{ id }} variant="ghost" size="md" confirm={`Leave ${circle.name}?`}>
                Leave Circle
              </ActionButton>
            </>
          ) : full ? (
            <Badge tone="neutral">This Circle is full</Badge>
          ) : (
            <ActionButton action={joinCircleAction} fields={{ id }} variant="primary" size="md">
              Join this Circle
            </ActionButton>
          )}
        </div>
      </header>

      {circle.isMember ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <SectionTitle>Who&apos;s here</SectionTitle>
            <ul className="space-y-2.5">
              {circle.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl border border-sand/70 bg-paper px-4 py-3">
                  <Avatar name={m.name} hue={m.hue} size={40} />
                  <span className="min-w-0 flex-1">
                    <Link href={`/members/${m.id}`} className="font-medium text-charcoal hover:text-lavender-600">
                      {m.id === user.id ? "You" : m.name}
                    </Link>
                    <span className="block truncate text-xs text-ink-500">{m.area}</span>
                  </span>
                  {m.host && <Badge tone="sage">Host</Badge>}
                  {m.isDemo && m.id !== user.id && <DemoBadge />}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <SectionTitle>Circle events</SectionTitle>
            {events.length ? (
              <ul className="space-y-2.5">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}`} className="block rounded-xl border border-sand/70 bg-paper px-4 py-3 hover:bg-cream/60">
                      <span className="block font-medium text-charcoal">{e.title}</span>
                      <span className="text-xs text-ink-500">
                        {formatDateTime(e.startsAt)} · {e.going} going {e.iAmGoing && "· including you"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Nothing planned yet. Why not suggest something?</p>
            )}
            <details className="mt-4">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-lavender-600 [&::-webkit-details-marker]:hidden">
                <CalendarPlus size={16} /> Plan something for this Circle
              </summary>
              <Card className="mt-3">
                <ActionForm action={createEventAction} className="space-y-3">
                  <input type="hidden" name="circleId" value={id} />
                  <input type="hidden" name="topic" value={circle.topic} />
                  <input type="hidden" name="capacity" value={circle.capacity} />
                  <Field label="What's the plan?">
                    <input name="title" className="field text-sm" required minLength={4} maxLength={80} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="When">
                      <input type="datetime-local" name="startsAt" className="field text-sm" required />
                    </Field>
                    <Field label="General area">
                      <input name="area" className="field text-sm" maxLength={60} defaultValue={circle.area ?? ""} />
                    </Field>
                  </div>
                  <Field label="Details">
                    <textarea name="description" rows={2} maxLength={600} className="field text-sm" />
                  </Field>
                  <SubmitButton size="sm">Create event</SubmitButton>
                </ActionForm>
              </Card>
            </details>
          </section>
        </div>
      ) : (
        <Notice tone="lavender">Members&apos; names and the group conversation are visible once you join. You can leave at any time.</Notice>
      )}
    </div>
  );
}
