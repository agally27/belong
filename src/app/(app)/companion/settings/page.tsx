import type { Metadata } from "next";
import { clearCompanionThreadAction, updateCompanionAction } from "@/app/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Card, CompanionOrb, Field, LinkButton, PageHeader } from "@/components/ui";
import { COMPANION_STYLES, COMPANION_TONES } from "@/lib/config";
import { aiStatus } from "@/lib/services/companion";
import { getCompanion } from "@/lib/services/profile";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Companion settings" };

export default async function CompanionSettingsPage() {
  const user = await requireMember();
  const [c, ai] = [await getCompanion(user.id), await aiStatus()];
  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Companion" title="Shape your companion" description="Its name, voice and how forward it is. These change how it speaks — never what it knows or shares." actions={<LinkButton href="/companion" variant="outline" size="sm">Back to chat</LinkButton>} />
      <Card>
        <ActionForm action={updateCompanionAction} className="space-y-6">
          <Field label="Name">
            <input className="field" name="name" defaultValue={c.name} maxLength={24} required />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">Voice</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COMPANION_TONES).map(([value, label]) => (
                <label key={value} className="chip-toggle">
                  <input type="radio" name="tone" value={value} defaultChecked={c.tone === value} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">Look</legend>
            <div className="flex gap-4">
              {COMPANION_STYLES.map((s) => (
                <label key={s} className="flex cursor-pointer flex-col items-center gap-1.5 text-xs capitalize text-ink-500 has-[:checked]:font-semibold has-[:checked]:text-lavender-700">
                  <input type="radio" name="style" value={s} defaultChecked={c.style === s} className="sr-only" />
                  <CompanionOrb style={s} size={48} />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">How forward should it be?</legend>
            <div className="flex flex-wrap gap-2">
              {[
                ["gentle", "Gentle — only when I ask"],
                ["balanced", "Balanced"],
                ["proactive", "Proactive — nudge me"],
              ].map(([value, label]) => (
                <label key={value} className="chip-toggle">
                  <input type="radio" name="proactivity" value={value} defaultChecked={c.proactivity === value} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton>Save changes</SubmitButton>
        </ActionForm>
      </Card>

      <Card className="mt-6">
        <h2 className="text-xl text-charcoal">About this companion</h2>
        <dl className="mt-3 grid gap-2 text-sm text-ink-700 sm:grid-cols-2">
          <div>
            <dt className="text-ink-500">Intelligence</dt>
            <dd>{ai.simulated ? "Built-in simulation (no live AI model connected)" : "Live AI model (Claude)"}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Who can read this conversation</dt>
            <dd>Only you</dd>
          </div>
        </dl>
        <div className="mt-5 border-t border-sand/70 pt-4">
          <p className="text-sm text-ink-500">Clearing the conversation removes every message. Approved memories are kept — manage those in Memories.</p>
          <div className="mt-3">
            <ActionButton action={clearCompanionThreadAction} variant="danger" confirm="Clear your whole conversation with your companion? This can't be undone.">
              Clear conversation
            </ActionButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
