import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin, Users, Video } from "lucide-react";
import { rsvpAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { Badge, Card, Notice, formatDateTime } from "@/components/ui";
import { flag } from "@/lib/services/core";
import { getEvent } from "@/lib/services/events";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Event" };

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
      </Card>
      <Notice tone="sage">
        <strong>Meeting safely.</strong> BELONG shows a general area only. Agree the exact meeting point with the host, choose somewhere public, and tell someone you trust where you&apos;ll be.
      </Notice>
    </div>
  );
}
