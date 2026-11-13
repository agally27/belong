"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { approveIntentionAction, approveMemoryAction, dismissIntentionAction, dismissMemoryAction, sendCompanionMessageAction } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { Badge, CompanionOrb, cx } from "@/components/ui";

export interface ChatMessage {
  id: string;
  role: "member" | "companion";
  content: string;
  suggestions: string[];
  memories: { id: string; category: string; categoryLabel: string; content: string; shareable: boolean }[];
  intention: { id: string; title: string; mode: string } | null;
}

export function CompanionChat({ messages, companionName, companionStyle, canShareIntentions }: { messages: ChatMessage[]; companionName: string; companionStyle: string; canShareIntentions: boolean }) {
  const [state, formAction, pending] = useActionState(sendCompanionMessageAction, {});
  const [optimistic, addOptimistic] = useOptimistic(messages, (cur, text: string) => [
    ...cur,
    { id: "pending", role: "member" as const, content: text, suggestions: [], memories: [], intention: null },
  ]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [optimistic.length, pending]);

  const lastCompanion = [...optimistic].reverse().find((m) => m.role === "companion");
  const suggestions = pending ? [] : (lastCompanion?.suggestions ?? []);

  const submit = (formData: FormData) => {
    const text = String(formData.get("message") ?? "").trim();
    if (!text) return;
    addOptimistic(text);
    setDraft("");
    formAction(formData);
  };

  return (
    <div className="flex h-[calc(100dvh-16.5rem)] min-h-[26rem] flex-col rounded-3xl border border-sand/70 bg-paper shadow-soft lg:h-[calc(100dvh-13rem)]">
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6" role="log" aria-live="polite" aria-label={`Conversation with ${companionName}`}>
        {optimistic.map((m) => (
          <div key={m.id} className={cx("flex gap-3", m.role === "member" && "justify-end")}>
            {m.role === "companion" && <CompanionOrb style={companionStyle} size={32} className="mt-1" />}
            <div className={cx("max-w-[85%] sm:max-w-[75%]", m.role === "member" && "text-right")}>
              <div
                className={cx(
                  "inline-block whitespace-pre-line rounded-2xl px-4 py-2.5 text-left text-[0.97rem] leading-relaxed",
                  m.role === "companion" ? "rounded-tl-sm bg-lavender-50 text-ink-700" : "rounded-tr-sm bg-charcoal text-ivory",
                  m.id === "pending" && "opacity-70",
                )}
              >
                {m.content}
              </div>

              {m.memories.map((mem) => (
                <div key={mem.id} className="mt-2.5 rounded-2xl border border-sage-200 bg-sage-50 p-4 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sage-700">Remember this?</p>
                  <p className="mt-1 text-[0.95rem] text-charcoal">{mem.content}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {mem.categoryLabel} · {mem.shareable ? "You choose whether it becomes a signal." : "This category always stays private."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton action={approveMemoryAction} fields={{ id: mem.id, share: "false" }} variant="sage">
                      Remember privately
                    </ActionButton>
                    {mem.shareable && (
                      <ActionButton action={approveMemoryAction} fields={{ id: mem.id, share: "true" }} variant="outline">
                        Remember and share as a signal
                      </ActionButton>
                    )}
                    <ActionButton action={dismissMemoryAction} fields={{ id: mem.id }} variant="ghost">
                      Don&apos;t remember
                    </ActionButton>
                  </div>
                </div>
              ))}

              {m.intention && (
                <div className="mt-2.5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700">
                    Share this intention? <Badge tone="sky">Temporary</Badge>
                  </p>
                  <p className="mt-1 text-[0.95rem] font-medium text-charcoal">&ldquo;{m.intention.title}&rdquo;</p>
                  <p className="mt-0.5 text-xs text-ink-500">This exact wording is what other companions can match against. It expires automatically, and you can end it at any time.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canShareIntentions ? (
                      <ActionButton action={approveIntentionAction} fields={{ id: m.intention.id, share: "true", days: m.intention.mode === "moment" ? "4" : "14" }} variant="primary">
                        Share for {m.intention.mode === "moment" ? "4 days" : "2 weeks"}
                      </ActionButton>
                    ) : (
                      <span className="text-xs text-ink-500">Sharing intentions is switched off in Privacy &amp; consent.</span>
                    )}
                    <ActionButton action={approveIntentionAction} fields={{ id: m.intention.id, share: "false" }} variant="outline">
                      Keep it private
                    </ActionButton>
                    <ActionButton action={dismissIntentionAction} fields={{ id: m.intention.id }} variant="ghost">
                      No thanks
                    </ActionButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-3" aria-label={`${companionName} is thinking`}>
            <CompanionOrb style={companionStyle} size={32} animate />
            <span className="rounded-2xl rounded-tl-sm bg-lavender-50 px-4 py-3 text-sm text-ink-500">{companionName} is thinking…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-sand/70 p-3 sm:p-4">
        {suggestions.length > 0 && (
          <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1" aria-label="Suggested replies">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft(s.endsWith("…") ? s.slice(0, -1) + " " : s)}
                className="shrink-0 rounded-full border border-lavender-200 bg-lavender-50 px-3.5 py-1.5 text-sm text-lavender-700 hover:bg-lavender-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {state.error && (
          <p role="alert" className="mb-2 text-sm text-rose-700">
            {state.error}
          </p>
        )}
        <form ref={formRef} action={submit} className="flex items-end gap-2">
          <label htmlFor="companion-message" className="sr-only">
            Message {companionName}
          </label>
          <textarea
            id="companion-message"
            name="message"
            rows={1}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            placeholder={`Tell ${companionName} what's on your mind…`}
            className="field max-h-32 min-h-[2.9rem] flex-1 resize-none"
          />
          <button type="submit" disabled={pending || !draft.trim()} aria-label="Send" className="flex h-[2.9rem] w-[2.9rem] shrink-0 items-center justify-center rounded-full bg-lavender-600 text-white transition hover:bg-lavender-700 disabled:opacity-40">
            <SendHorizontal size={19} />
          </button>
        </form>
      </div>
    </div>
  );
}
