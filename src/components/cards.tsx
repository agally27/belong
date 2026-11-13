import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import {
  blockUserAction,
  dismissMatchAction,
  reportUserAction,
  requestIntroductionAction,
  respondIntroductionAction,
  simulateDemoResponseAction,
  withdrawIntroductionAction,
} from "@/app/actions";
import type { IntroductionView } from "@/lib/services/introductions";
import type { MemberPreview } from "@/lib/services/members";
import type { MatchView } from "@/lib/services/network";
import { REPORT_REASONS } from "@/lib/services/safety";
import { ActionButton, ActionForm, SubmitButton } from "./forms";
import { Avatar, Badge, Card, DemoBadge, LinkButton, Meter, Notice, cx, timeAgo } from "./ui";

const DOT = { shared: "bg-lavender-400", moments: "bg-sky-300", complementary: "bg-sage-300" } as const;
export const DIMENSION_LABEL = { shared: "Shared interests", moments: "Shared moments", complementary: "Complementary" } as const;

export const fitLabel = (score: number) => (score >= 70 ? "Strong fit" : score >= 45 ? "Good fit" : "Worth a hello");

export function MemberHeader({ member, right, sub }: { member: MemberPreview; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <Avatar name={member.name} hue={member.hue} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/members/${member.id}`} className="font-display text-xl text-charcoal hover:text-lavender-600">
            {member.name}
          </Link>
          {member.pronouns && <span className="text-xs text-ink-500">{member.pronouns}</span>}
          {member.isDemo && <DemoBadge />}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-500">
          {member.area && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} /> {member.area}
            </span>
          )}
          {sub}
        </p>
      </div>
      {right}
    </div>
  );
}

export function ReasonList({ reasons }: { reasons: { dimension?: keyof typeof DOT; text: string }[] }) {
  return (
    <ul className="space-y-1.5 text-[0.95rem] text-ink-700">
      {reasons.map((r, i) => (
        <li key={i} className="flex gap-2.5">
          <span className={cx("blob mt-[0.45rem] h-2.5 w-2.5 shrink-0", r.dimension ? DOT[r.dimension] : "bg-lavender-300")} />
          {r.text}
        </li>
      ))}
    </ul>
  );
}

function DemoSimulate({ introId, name }: { introId: string; name: string }) {
  return (
    <Notice tone="sky" className="mt-3">
      <p>
        <strong>Demo control.</strong> {name} is a fictional member, so they can&apos;t answer by themselves. Simulate their reply to continue the journey.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <ActionButton action={simulateDemoResponseAction} fields={{ id: introId, decision: "approved" }} variant="primary">
          Simulate {name} saying yes
        </ActionButton>
        <ActionButton action={simulateDemoResponseAction} fields={{ id: introId, decision: "declined" }}>
          Simulate a decline
        </ActionButton>
      </div>
    </Notice>
  );
}

export function MatchCard({ match, demoMode, compact }: { match: MatchView; demoMode: boolean; compact?: boolean }) {
  const { member, introduction: intro } = match;
  return (
    <Card className="animate-rise">
      <MemberHeader
        member={member}
        right={
          <div className="text-right">
            <Badge tone={match.score >= 70 ? "sage" : match.score >= 45 ? "lavender" : "neutral"}>{fitLabel(match.score)}</Badge>
            {match.isNew && <p className="mt-1 text-xs font-medium text-lavender-600">New</p>}
          </div>
        }
      />
      {!compact && member.bio && <p className="mt-3 text-sm text-ink-500">{member.bio}</p>}
      <div className="mt-4 rounded-xl bg-ivory p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Why your companion thinks you&apos;d get along</p>
        <ReasonList reasons={compact ? match.reasons.slice(0, 2) : match.reasons} />
        {!compact && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Meter label={DIMENSION_LABEL.shared} value={match.dimensions.shared} tone="lavender" />
            <Meter label={DIMENSION_LABEL.moments} value={match.dimensions.moments} tone="sky" />
            <Meter label={DIMENSION_LABEL.complementary} value={match.dimensions.complementary} tone="sage" />
          </div>
        )}
      </div>
      <div className="mt-4">
        {!intro && compact && (
          <LinkButton href="/discover" variant="soft" size="sm">
            See more in Discover
          </LinkButton>
        )}
        {!intro && !compact && (
          <div className="flex flex-col gap-3">
            <ActionForm action={requestIntroductionAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <input type="hidden" name="matchId" value={match.id} />
              <label className="sr-only" htmlFor={`note-${match.id}`}>
                Optional note to {member.name}
              </label>
              <input id={`note-${match.id}`} name="note" maxLength={300} placeholder={`Add a friendly note for ${member.name} (optional)`} className="field flex-1 !py-2 text-sm" />
              <SubmitButton variant="accent" size="sm" className="!py-2.5" pendingLabel="Asking…">
                Ask for an introduction
              </SubmitButton>
            </ActionForm>
            <ActionButton action={dismissMatchAction} fields={{ id: match.id }} variant="ghost">
              Not for me
            </ActionButton>
          </div>
        )}
        {intro && intro.mine === "approved" && (
          <>
            <p className="flex items-center gap-2 text-sm text-ink-500">
              <Clock size={15} /> You&apos;ve asked for an introduction. Waiting for {member.name} to answer.
            </p>
            {demoMode && member.isDemo && <DemoSimulate introId={intro.id} name={member.name} />}
          </>
        )}
        {intro && intro.mine === "pending" && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-sm font-medium text-lavender-700">{member.name} would like to be introduced.</p>
            <ActionButton action={respondIntroductionAction} fields={{ id: intro.id, decision: "approved" }} variant="accent">
              Yes, introduce us
            </ActionButton>
            <ActionButton action={respondIntroductionAction} fields={{ id: intro.id, decision: "declined" }} variant="ghost">
              Not this time
            </ActionButton>
          </div>
        )}
      </div>
    </Card>
  );
}

export function IntroductionCard({ intro, demoMode }: { intro: IntroductionView; demoMode: boolean }) {
  const { member } = intro;
  const pendingMine = intro.status === "pending" && intro.myDecision === "pending";
  const waiting = intro.status === "pending" && intro.myDecision === "approved";
  return (
    <Card>
      <MemberHeader
        member={member}
        sub={<span>{timeAgo(intro.createdAt)}</span>}
        right={
          <Badge tone={intro.status === "connected" ? "sage" : intro.status === "pending" ? "lavender" : "neutral"}>
            {intro.status === "connected" ? "Connected" : pendingMine ? "Awaiting you" : waiting ? "Awaiting them" : intro.status === "declined" ? "Didn't go ahead" : "Withdrawn"}
          </Badge>
        }
      />
      {intro.note && intro.status !== "declined" && intro.status !== "withdrawn" && (
        <blockquote className="mt-3 rounded-xl border-l-4 border-lavender-300 bg-lavender-50 px-4 py-2.5 text-sm text-ink-700">
          <span className="mb-0.5 block text-xs font-medium text-lavender-700">{intro.requestedByMe ? "Your note" : `A note from ${member.name}`}</span>
          {intro.note}
        </blockquote>
      )}
      {intro.status === "pending" && intro.reasons.length > 0 && (
        <div className="mt-3 rounded-xl bg-ivory p-4">
          <ReasonList reasons={intro.reasons.map((text) => ({ text }))} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {pendingMine && (
          <>
            <ActionButton action={respondIntroductionAction} fields={{ id: intro.id, decision: "approved" }} variant="accent" size="md">
              Yes, introduce us
            </ActionButton>
            <ActionButton action={respondIntroductionAction} fields={{ id: intro.id, decision: "declined" }} variant="ghost" size="md" confirm={`Decline this introduction? ${member.name} won't be told why.`}>
              Not this time
            </ActionButton>
          </>
        )}
        {waiting && intro.requestedByMe && (
          <ActionButton action={withdrawIntroductionAction} fields={{ id: intro.id }} variant="ghost">
            Withdraw request
          </ActionButton>
        )}
        {intro.status === "connected" && intro.conversationId && (
          <LinkButton href={`/messages/${intro.conversationId}`} variant="soft" size="sm">
            Open conversation
          </LinkButton>
        )}
      </div>
      {pendingMine && <p className="mt-2 text-xs text-ink-500">Nothing is shared and no messages can be sent unless you both say yes.</p>}
      {waiting && demoMode && member.isDemo && <DemoSimulate introId={intro.id} name={member.name} />}
    </Card>
  );
}

/** Block / report controls for another member. */
export function SafetyControls({ member, contextType = "profile", contextId }: { member: { id: string; name: string }; contextType?: string; contextId?: string }) {
  return (
    <details className="group rounded-xl border border-sand/70 bg-paper">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink-700 [&::-webkit-details-marker]:hidden">Block or report {member.name}</summary>
      <div className="space-y-5 border-t border-sand/70 p-4">
        <div>
          <p className="text-sm text-ink-500">Blocking is instant and silent. Your connection ends, and you won&apos;t be suggested to each other again.</p>
          <div className="mt-2">
            <ActionButton action={blockUserAction} fields={{ targetId: member.id }} variant="danger" confirm={`Block ${member.name}? This ends your connection and can be undone in Privacy & consent.`}>
              Block {member.name}
            </ActionButton>
          </div>
        </div>
        <ActionForm action={reportUserAction} className="space-y-3" resetOnSuccess>
          <input type="hidden" name="targetId" value={member.id} />
          <input type="hidden" name="contextType" value={contextType} />
          {contextId && <input type="hidden" name="contextId" value={contextId} />}
          <p className="text-sm font-medium text-ink-700">Report to the BELONG team</p>
          <select name="reason" className="field text-sm" required defaultValue="" aria-label="Reason for report">
            <option value="" disabled>
              Choose a reason
            </option>
            {Object.entries(REPORT_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <textarea name="detail" rows={2} maxLength={1000} className="field text-sm" placeholder="Anything that would help us understand (optional)" aria-label="Details" />
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" name="alsoBlock" className="h-4 w-4 accent-lavender-600" /> Also block {member.name}
          </label>
          <SubmitButton variant="outline" size="sm">
            Send report
          </SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}
