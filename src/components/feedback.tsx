"use client";

import { useActionState, useState } from "react";
import { giveFeedbackAction } from "@/app/actions";
import type { FeedbackPrompt } from "@/lib/services/feedback";
import { Avatar, Card, DemoBadge, buttonClass } from "./ui";

const ANSWERS: { value: string; label: string; variant: "sage" | "outline" | "ghost"; connectionOnly?: boolean }[] = [
  { value: "yes:great", label: "We met — it was great", variant: "sage" },
  { value: "yes:ok", label: "We met — it was OK", variant: "outline" },
  { value: "yes:not_for_me", label: "We met — not for me", variant: "outline" },
  { value: "not_yet:", label: "Not met yet", variant: "ghost", connectionOnly: true },
  { value: "no:", label: "We won't be meeting", variant: "ghost", connectionOnly: true },
];

/** One private "How did it go?" card. Stays on screen after answering to show the acknowledgement. */
function PromptCard({ prompt }: { prompt: FeedbackPrompt }) {
  const [state, formAction, pending] = useActionState(giveFeedbackAction, {});
  const question = prompt.member ? `How's it going with ${prompt.member.name}?` : `How was “${prompt.title}”?`;
  return (
    <Card className="border-sage-200 bg-sage-50/60">
      <div className="flex items-center gap-3">
        {prompt.member ? <Avatar name={prompt.member.name} hue={prompt.member.hue} size={40} /> : null}
        <div>
          <p className="flex flex-wrap items-center gap-2 font-display text-lg text-charcoal">
            {question} {prompt.member?.isDemo && <DemoBadge />}
          </p>
          <p className="text-xs text-ink-500">Private to you — {prompt.member ? `${prompt.member.name} is` : "nobody else is"} never told. It helps your companion suggest people you&apos;ll enjoy.</p>
        </div>
      </div>
      {state.ok ? (
        <p role="status" className="mt-4 text-sm text-sage-700">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="subjectType" value={prompt.subjectType} />
          <input type="hidden" name="subjectId" value={prompt.subjectId} />
          {ANSWERS.filter((a) => !a.connectionOnly || prompt.subjectType === "connection").map((a) => (
            <button key={a.value} type="submit" name="answer" value={a.value} disabled={pending} className={buttonClass(a.variant, "sm")}>
              {a.label}
            </button>
          ))}
          {state.error && (
            <p role="alert" className="w-full text-xs text-rose-700">
              {state.error}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}

/** Keeps its own copy of the prompts so answered cards remain visible after the page refreshes. */
export function FeedbackPrompts({ prompts }: { prompts: FeedbackPrompt[] }) {
  const [shown] = useState(prompts);
  if (!shown.length) return null;
  return (
    <section aria-label="How did it go?" className="grid gap-4">
      {shown.map((p) => (
        <PromptCard key={`${p.subjectType}-${p.subjectId}`} prompt={p} />
      ))}
    </section>
  );
}
