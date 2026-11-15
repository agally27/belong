import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin, Users, Video } from "lucide-react";
import { cancelEventAction, rsvpAction, updateEventAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Field, Notice, formatDateTime } from "@/components/ui";
import { flag } from "@/lib/services/core";
import { getEvent } from "@/lib/services/events";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Event" };

/** ISO → value for a datetime-local input, in UK time. */
function toLocalInput(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  if (!(await flag("events"))) notFound();
  const e = await getEvent(user.id, id);
  if (!e) notFound();
  const full = e.going >= e.capacity;
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-lavender-600">
        <ArrowLeft size={15} /> All events
      </Link>
      <Card className="!p-7 sm:!p-9">
        <div className="flex flex-wrap gap-2">
          <Badge tone="sage" className="capitalize">
            {e.topicLabel}
          </Badge>
          {e.circleName && (
            <Link href={`/circles/${e.circleId}`}>
              <Badge tone="lavender">{e.circleName} · Circle event</Badge>
            </Link>
          )}
          {e.iAmGoing && <Badge tone="sky">You&apos;re going</Badge>}
        </div>
        <h1 className="mt-4 text-4xl text-charcoal">{e.title}</h1>
        <dl className="mt-5 grid gap-3 text-ink-700 sm:grid-cols-2">
          <div className="flex items-center gap-2.5">
            <Clock size={18} className="text-lavender-500" />
            <dt className="sr-only">When</dt>
            <dd>{formatDateTime(e.startsAt)}</dd>
          </div>
          <div className="flex items-center gap-2.5">
            {e.format === "online" ? <Video size={18} className="text-lavender-500" /> : <MapPin size={18} className="text-lavender-500" />}
            <dt className="sr-only">Where</dt>
            <dd>{e.area ?? "To be confirmed"}</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-lavender-500" />
            <dt className="sr-only">Places</dt>
            <dd>
              {e.going} of {e.capacity} places taken
            </dd>
          </div>
          {e.hostName && (
            <div>
              <dt className="sr-only">Host</dt>
              <dd>Hosted by {e.iAmHost ? "you" : e.hostName}</dd>
            </div>
          )}
        </dl>
        {e.description && <p className="mt-5 text-ink-700">{e.description}</p>}
        {e.fit && <p className="mt-3 text-sm font-medium text-lavender-600">{e.fit}</p>}
        {e.cancelled ? (
          <Notice tone="rose" className="mt-6">
            This event has been cancelled by the host.
          </Notice>
        ) : (
        <div className="mt-6">
          {e.iAmGoing ? (
            e.iAmHost ? (
              <p className="text-sm text-ink-500">You&apos;re hosting this event.</p>
            ) : (
              <ActionButton action={rsvpAction} fields={{ id, going: "false" }} variant="outline" size="md">
                I can&apos;t make it any more
              </ActionButton>
            )
          ) : full ? (
            <p className="text-sm text-ink-500">This event is full.</p>
          ) : (
            <ActionButton action={rsvpAction} fields={{ id, going: "true" }} variant="primary" size="md">
              I&apos;ll be there
            </ActionButton>
          )}
        </div>
        )}
      </Card>
      {e.iAmHost && !e.cancelled && (
        <Card>
          <h2 className="text-xl text-charcoal">Host tools</h2>
          <p className="mt-1 text-sm text-ink-500">Everyone going is told when you change the date, time or details, or cancel.</p>
          <ActionForm action={updateEventAction} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={e.id} />
            <Field label="Title">
              <input name="title" defaultValue={e.title} className="field text-sm" required minLength={4} maxLength={80} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="When">
                <input type="datetime-local" name="startsAt" defaultValue={toLocalInput(e.startsAt)} className="field text-sm" required />
              </Field>
              <Field label="General area">
                <input name="area" defaultValue={e.area ?? ""} className="field text-sm" maxLength={60} />
              </Field>
              <Field label="Places">
                <input type="number" name="capacity" min={Math.max(2, e.going)} max={30} defaultValue={e.capacity} className="field text-sm" />
              </Field>
            </div>
            <Field label="Details">
              <textarea name="description" rows={3} maxLength={600} defaultValue={e.description} className="field text-sm" />
            </Field>
            <SubmitButton size="sm">Save changes</SubmitButton>
          </ActionForm>
          <div className="mt-5 border-t border-sand/70 pt-4">
            <ActionButton action={cancelEventAction} fields={{ id: e.id }} variant="danger" confirm="Cancel this event? Everyone going will be told.">
              Cancel event
            </ActionButton>
          </div>
        </Card>
      )}
      <Notice tone="sage">
        <strong>Meeting safely.</strong> BELONG shows a general area only. Agree the exact meeting point with the host, choose somewhere public, and tell someone you trust where you&apos;ll be.
      </Notice>
    </div>
  );
}
