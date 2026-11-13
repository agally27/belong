import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDot, MapPin, Plus } from "lucide-react";
import { createCircleAction, joinCircleAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { TopicSelect } from "@/components/topic-select";
import { Badge, Card, EmptyState, Field, LinkButton, PageHeader, SectionTitle, buttonClass } from "@/components/ui";
import { CIRCLE_MAX, CIRCLE_MIN, listCircles, type CircleView } from "@/lib/services/circles";
import { flag } from "@/lib/services/core";
import { getProfile } from "@/lib/services/profile";
import { getLimits } from "@/lib/services/subscriptions";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Circles" };

function Dots({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="flex gap-1" aria-label={`${filled} of ${total} places taken`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < filled ? "bg-sage-500" : "bg-sand"}`} />
      ))}
    </span>
  );
}

function CircleCard({ c }: { c: CircleView }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <Badge tone="sage" className="capitalize">
          {c.topicLabel}
        </Badge>
        <Dots filled={c.memberCount} total={c.capacity} />
      </div>
      <h3 className="mt-3 text-xl text-charcoal">
        <Link href={`/circles/${c.id}`} className="hover:text-lavender-600">
          {c.name}
        </Link>
      </h3>
      <p className="mt-1.5 flex-1 text-sm text-ink-500">{c.description}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
        {c.area && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} /> {c.area}
          </span>
        )}
        <span>
          {c.memberCount} of {c.capacity} people
        </span>
        {c.fit && <span className="font-medium text-lavender-600">{c.fit}</span>}
      </p>
      <div className="mt-4 flex items-center gap-2">
        {c.isMember ? (
          <LinkButton href={`/circles/${c.id}`} variant="soft" size="sm">
            Open Circle
          </LinkButton>
        ) : (
          <>
            <ActionButton action={joinCircleAction} fields={{ id: c.id }} variant="primary">
              Join Circle
            </ActionButton>
            <LinkButton href={`/circles/${c.id}`} variant="ghost" size="sm">
              Details
            </LinkButton>
          </>
        )}
      </div>
    </Card>
  );
}

export default async function CirclesPage() {
  const user = await requireMember();
  if (!(await flag("circles"))) notFound();
  const [circles, limits, profile] = [await listCircles(user.id), await getLimits(user.id), await getProfile(user.id)];
  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="BELONG Circles"
        title="Small groups, real belonging"
        description={`Circles are groups of ${CIRCLE_MIN}–${CIRCLE_MAX} people around something they share. Small enough that everyone is noticed; regular enough that acquaintances become friends.`}
        actions={
          <details className="relative">
            <summary className={buttonClass("primary", "md", "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
              <Plus size={16} /> Start a Circle
            </summary>
            <Card className="absolute right-0 z-10 mt-2 w-[min(24rem,88vw)] shadow-lift">
              <ActionForm action={createCircleAction} className="space-y-3">
                <Field label="Name">
                  <input name="name" className="field text-sm" required minLength={3} maxLength={60} placeholder="e.g. Saturday Sketchers" />
                </Field>
                <Field label="What brings you together?">
                  <TopicSelect />
                </Field>
                <Field label="Description">
                  <textarea name="description" rows={2} maxLength={400} className="field text-sm" placeholder="What will you do, and how often?" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="General area">
                    <input name="area" className="field text-sm" maxLength={60} defaultValue={profile?.area?.split(",").pop()?.trim() ?? ""} />
                  </Field>
                  <Field label="Size">
                    <select name="capacity" className="field text-sm" defaultValue="6">
                      {Array.from({ length: CIRCLE_MAX - CIRCLE_MIN + 1 }, (_, i) => CIRCLE_MIN + i).map((n) => (
                        <option key={n} value={n}>
                          {n} people
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <SubmitButton size="sm" className="w-full">
                  Create Circle
                </SubmitButton>
              </ActionForm>
            </Card>
          </details>
        }
      />
      <p className="-mt-4 text-sm text-ink-500">
        {limits.circles < 0 ? "Your membership includes unlimited Circles." : `Your membership includes ${limits.circles} Circle${limits.circles === 1 ? "" : "s"} at a time (you're in ${circles.mine.length}).`}
      </p>

      <section>
        <SectionTitle>Your Circles</SectionTitle>
        {circles.mine.length ? (
          <div className="grid gap-5 md:grid-cols-2">
            {circles.mine.map((c) => (
              <CircleCard key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<CircleDot size={36} />} title="You're not in a Circle yet" body="Join one below, or start your own around something you love." />
        )}
      </section>
      {circles.suggested.length > 0 && (
        <section>
          <SectionTitle>Suggested for you</SectionTitle>
          <div className="grid gap-5 md:grid-cols-2">
            {circles.suggested.map((c) => (
              <CircleCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
      {circles.others.length > 0 && (
        <section>
          <SectionTitle>More open Circles</SectionTitle>
          <div className="grid gap-5 md:grid-cols-2">
            {circles.others.map((c) => (
              <CircleCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
