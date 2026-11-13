"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { sendMessageAction } from "@/app/actions";
import { cx } from "@/components/ui";

export interface ThreadMessage {
  id: string;
  mine: boolean;
  senderName: string;
  content: string;
  simulated: boolean;
  time: string;
}

export function MessageThread({ conversationId, messages, group, starters }: { conversationId: string; messages: ThreadMessage[]; group: boolean; starters: string[] }) {
  const [state, formAction, pending] = useActionState(sendMessageAction, {});
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex h-[calc(100dvh-17rem)] min-h-[24rem] flex-col rounded-3xl border border-sand/70 bg-paper shadow-soft lg:h-[calc(100dvh-14rem)]">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6" role="log" aria-live="polite" aria-label="Messages">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-ink-500">This is the very beginning of your conversation. A simple hello is a great start.</p>}
        {messages.map((m) => (
          <div key={m.id} className={cx("flex flex-col", m.mine ? "items-end" : "items-start")}>
            {group && !m.mine && <span className="mb-0.5 ml-1 text-xs font-medium text-ink-500">{m.senderName}</span>}
            <div className={cx("max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[0.97rem] leading-relaxed sm:max-w-[72%]", m.mine ? "rounded-br-sm bg-charcoal text-ivory" : "rounded-bl-sm bg-cream text-charcoal")}>{m.content}</div>
            <span className="mx-1 mt-1 text-[0.7rem] text-ink-500">
              {m.time}
              {m.simulated && " · simulated reply from a fictional demo member"}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-sand/70 p-3 sm:p-4">
        {messages.length < 3 && starters.length > 0 && (
          <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1" aria-label="Conversation starters">
            {starters.slice(0, 3).map((s) => (
              <button key={s} type="button" onClick={() => setDraft(s)} className="shrink-0 rounded-full border border-lavender-200 bg-lavender-50 px-3.5 py-1.5 text-sm text-lavender-700 hover:bg-lavender-100">
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
        <form
          ref={formRef}
          action={(fd) => {
            setDraft("");
            formAction(fd);
          }}
          className="flex items-end gap-2"
        >
          <input type="hidden" name="conversationId" value={conversationId} />
          <label htmlFor="message-input" className="sr-only">
            Write a message
          </label>
          <textarea
            id="message-input"
            name="content"
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
            placeholder="Write a message…"
            className="field max-h-32 min-h-[2.9rem] flex-1 resize-none"
          />
          <button type="submit" disabled={pending || !draft.trim()} aria-label="Send message" className="flex h-[2.9rem] w-[2.9rem] shrink-0 items-center justify-center rounded-full bg-lavender-600 text-white transition hover:bg-lavender-700 disabled:opacity-40">
            <SendHorizontal size={19} />
          </button>
        </form>
      </div>
    </div>
  );
}
