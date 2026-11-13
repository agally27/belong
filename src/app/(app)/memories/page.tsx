import type { Metadata } from "next";
import { Lock, Plus, Share2, Timer } from "lucide-react";
import {
  approveIntentionAction,
  approveMemoryAction,
  createIntentionAction,
  createMemoryAction,
  deleteAllMemoriesAction,
  deleteMemoryAction,
  dismissIntentionAction,
  dismissMemoryAction,
  endIntentionAction,
  setMemorySharingAction,
  updateMemoryAction,
} from "@/app/actions";
import { ActionButton, ActionForm, AutoSwitch, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Field, LinkButton, Notice, PageHeader, SectionTitle, buttonClass, timeAgo } from "@/components/ui";
import { MEMORY_CATEGORIES } from "@/lib/config";
import { getConsents } from "@/lib/services/core";
import { listIntentions, listMemories, type Memory } from "@/lib/services/memory";
import { getCompanion } from "@/lib/services/profile";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Memories" };

function CategorySelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="category" className="field" defaultValue={defaultValue ?? "interests"} aria-label="Category">
      {MEMORY_CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label} — {c.shareable ? "can be shared" : "always private"}
        </option>
      ))}
    </select>
  );
}

function MemoryItem({ m }: { m: Memory }) {
  const cat = MEMORY_CATEGORIES.find((c) => c.id === m.category);
  return (
    <li className="rounded-xl border border-sand/70 bg-ivory p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.97rem] text-charcoal">{m.content}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
            <span>{m.source === "conversation" ? "From a conversation" : m.source === "onboarding" ? "From when you joined" : "Added by you"}</span>·<span>{timeAgo(m.updatedAt)}</span>
          </p>
        </div>
        {cat?.shareable ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <AutoSwitch action={setMemorySharingAction} fields={{ id: m.id }} checked={m.shareForMatching} label={`Share “${m.content}” as a signal`} />
            <span className="text-[0.7rem] text-ink-500">{m.shareForMatching ? "Shared as a signal" : "Private"}</span>
          </div>
        ) : (
          <Badge tone="neutral" className="shrink-0">
            <Lock size={11} /> Always private
          </Badge>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-lavender-600 hover:underline [&::-webkit-details-marker]:hidden">Edit or delete</summary>
        <ActionForm action={updateMemoryAction} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={m.id} />
          <textarea name="content" defaultValue={m.content} rows={2} maxLength={500} className="field text-sm" aria-label="Memory" required />
          <CategorySelect defaultValue={m.category} />
          {m.shareForMatching && <input type="hidden" name="share" value="true" />}
          <SubmitButton size="sm" variant="soft">
            Save
          </SubmitButton>
        </ActionForm>
        <div className="mt-2">
          <ActionButton action={deleteMemoryAction} fields={{ id: m.id }} variant="ghost" confirm="Delete this memory permanently?">
            Delete memory
          </ActionButton>
        </div>
      </details>
    </li>
  );
}

export default async function MemoriesPage() {
  const user = await requireMember();
  const [memories, intentions, companion, consents] = [await listMemories(user.id), await listIntentions(user.id, true), await getCompanion(user.id), await getConsents(user.id)];
  const proposed = memories.filter((m) => m.status === "proposed");
  const active = memories.filter((m) => m.status === "active");
  const proposedIntentions = intentions.filter((i) => i.status === "proposed");
  const live = intentions.filter((i) => i.status === "active");
  const past = intentions.filter((i) => i.status === "ended" || i.status === "expired").slice(0, 5);

  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Memory"
        title={`What ${companion.name} remembers`}
        description="Everything here is private to you. You approve each memory, you can edit or delete it, and you decide which ones — if any — become signals for finding connections."
      />

      {!consents.matching_enabled && (
        <Notice tone="peach">
          Matching is switched off, so nothing here is being shared at the moment — whatever the switches say. <LinkButton href="/settings/privacy" variant="ghost" size="sm">Review privacy settings</LinkButton>
        </Notice>
      )}

      {(proposed.length > 0 || proposedIntentions.length > 0) && (
        <section>
          <SectionTitle>Waiting for your approval</SectionTitle>
          <ul className="space-y-3">
            {proposed.map((m) => {
              const cat = MEMORY_CATEGORIES.find((c) => c.id === m.category);
              return (
                <li key={m.id} className="rounded-xl border border-sage-200 bg-sage-50 p-4">
                  <p className="text-charcoal">{m.content}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{cat?.label} · suggested by {companion.name}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton action={approveMemoryAction} fields={{ id: m.id, share: "false" }} variant="sage">
                      Remember privately
                    </ActionButton>
                    {cat?.shareable && (
                      <ActionButton action={approveMemoryAction} fields={{ id: m.id, share: "true" }}>
                        Remember and share as a signal
                      </ActionButton>
                    )}
                    <ActionButton action={dismissMemoryAction} fields={{ id: m.id }} variant="ghost">
                      Don&apos;t remember
                    </ActionButton>
                  </div>
                </li>
              );
            })}
            {proposedIntentions.map((i) => (
              <li key={i.id} className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <p className="font-medium text-charcoal">&ldquo;{i.title}&rdquo;</p>
                <p className="mt-0.5 text-xs text-ink-500">A temporary intention suggested by {companion.name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton action={approveIntentionAction} fields={{ id: i.id, share: "true", days: "7" }} variant="primary">
                    Share for a week
                  </ActionButton>
                  <ActionButton action={approveIntentionAction} fields={{ id: i.id, share: "false" }}>
                    Keep private
                  </ActionButton>
                  <ActionButton action={dismissIntentionAction} fields={{ id: i.id }} variant="ghost">
                    No thanks
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <Timer size={19} className="text-sky-500" /> Current intentions
          </span>
        </SectionTitle>
        <p className="-mt-1 mb-4 max-w-2xl text-sm text-ink-500">What you&apos;re hoping for right now. Shared intentions become temporary signals that expire on their own.</p>
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div>
            {live.length ? (
              <ul className="space-y-3">
                {live.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sand/70 bg-paper p-4">
                    <div>
                      <p className="font-medium text-charcoal">{i.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                        <Badge tone={i.shared && i.topics.length ? "sky" : "neutral"}>{i.shared && i.topics.length ? "Shared as a signal" : "Private"}</Badge>
                        Expires {timeAgo(i.expiresAt)}
                      </p>
                    </div>
                    <ActionButton action={endIntentionAction} fields={{ id: i.id }} variant="ghost">
                      End now
                    </ActionButton>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing on the go" body={`Tell ${companion.name} what you'd love company for, or add one yourself.`} />
            )}
            {past.length > 0 && (
              <details className="mt-4 text-sm text-ink-500">
                <summary className="cursor-pointer">Past intentions ({past.length})</summary>
                <ul className="mt-2 space-y-1">
                  {past.map((i) => (
                    <li key={i.id}>
                      {i.title} — {i.status}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <Card className="h-fit">
            <h3 className="text-lg text-charcoal">Share an intention</h3>
            <ActionForm action={createIntentionAction} className="mt-3 space-y-3" resetOnSuccess>
              <Field label="What are you hoping for?" hint="Name the activity — e.g. “Board games company this week”.">
                <input name="title" className="field text-sm" required minLength={5} maxLength={160} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Kind">
                  <select name="mode" className="field text-sm" defaultValue="intention">
                    <option value="moment">A moment (soon)</option>
                    <option value="intention">Ongoing</option>
                    <option value="collaboration">Collaboration</option>
                  </select>
                </Field>
                <Field label="Share for">
                  <select name="days" className="field text-sm" defaultValue="7">
                    <option value="3">3 days</option>
                    <option value="7">1 week</option>
                    <option value="14">2 weeks</option>
                    <option value="30">30 days</option>
                  </select>
                </Field>
              </div>
              <SubmitButton size="sm" variant="accent">
                <Share2 size={15} /> Share temporarily
              </SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </section>

      <section>
        <SectionTitle
          action={
            <details className="relative">
              <summary className={buttonClass("outline", "sm", "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                <Plus size={15} /> Add a memory
              </summary>
              <Card className="absolute right-0 z-10 mt-2 w-[min(22rem,85vw)] shadow-lift">
                <ActionForm action={createMemoryAction} className="space-y-3" resetOnSuccess>
                  <textarea name="content" rows={3} maxLength={500} required className="field text-sm" placeholder="Something you'd like your companion to keep in mind" aria-label="Memory" />
                  <CategorySelect />
                  <label className="flex items-center gap-2 text-sm text-ink-700">
                    <input type="checkbox" name="share" className="h-4 w-4 accent-lavender-600" /> Share as a signal (if the category allows)
                  </label>
                  <SubmitButton size="sm">Save memory</SubmitButton>
                </ActionForm>
              </Card>
            </details>
          }
        >
          Approved memories
        </SectionTitle>
        {active.length ? (
          <div className="space-y-6">
            {MEMORY_CATEGORIES.filter((c) => active.some((m) => m.category === c.id)).map((c) => (
              <div key={c.id}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-500">
                  {c.label} <span className="font-normal normal-case tracking-normal text-ink-300">· {c.hint}</span>
                </h3>
                <ul className="space-y-2.5">
                  {active
                    .filter((m) => m.category === c.id)
                    .map((m) => (
                      <MemoryItem key={m.id} m={m} />
                    ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No memories yet" body={`As you chat, ${companion.name} will suggest things worth remembering. Nothing is saved without your say-so.`} action={<LinkButton href="/companion">Talk to {companion.name}</LinkButton>} />
        )}
        {active.length > 0 && (
          <div className="mt-8 border-t border-sand/70 pt-5">
            <ActionButton action={deleteAllMemoriesAction} variant="danger" confirm="Delete ALL of your memories permanently? Your companion will forget everything you've approved.">
              Delete all memories
            </ActionButton>
          </div>
        )}
      </section>
    </div>
  );
}
