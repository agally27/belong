import type { Metadata } from "next";
import { updateProfileAction } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Card, Field, PageHeader } from "@/components/ui";
import { PERSONALITY } from "@/lib/config";
import { TOPIC_LIST } from "@/lib/matching/topics";
import { AGE_RANGES, getProfile, LOOKING_FOR } from "@/lib/services/profile";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireMember();
  const p = (await getProfile(user.id))!;
  const categories = [...new Set(TOPIC_LIST.map((t) => t.category))];
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="You" title="Your profile" description="This is what people see once your companions have suggested you to each other — a first name, your general area, and what you choose to write here. Nothing more." />
      <ActionForm action={updateProfileAction} className="space-y-6">
        <Card className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={p.displayName} hue={p.hue} size={64} />
            <p className="text-sm text-ink-500">BELONG uses a generated avatar rather than photos, so first impressions come from what you share — not how you look.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className="field" name="displayName" defaultValue={p.displayName} required minLength={2} maxLength={40} />
            </Field>
            <Field label="Pronouns">
              <input className="field" name="pronouns" defaultValue={p.pronouns ?? ""} maxLength={30} />
            </Field>
            <Field label="Age range">
              <select className="field" name="ageRange" defaultValue={p.ageRange ?? ""}>
                <option value="">Prefer not to say</option>
                {AGE_RANGES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </Field>
            <Field label="General area" hint="A town or neighbourhood. Never an address.">
              <input className="field" name="area" defaultValue={p.area ?? ""} maxLength={60} />
            </Field>
          </div>
          <input type="hidden" name="region" value={p.region ?? ""} />
          <Field label="About you">
            <textarea className="field" name="bio" rows={3} maxLength={400} defaultValue={p.bio ?? ""} />
          </Field>
          <Field label="Values" hint="A few words, separated by commas. These are shown on your profile but never used as signals.">
            <input className="field" name="values" defaultValue={p.values.join(", ")} maxLength={200} />
          </Field>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-xl text-charcoal">Interests</h2>
          <p className="-mt-2 text-sm text-ink-500">Up to 12. These become interest signals if you&apos;ve allowed that in Privacy &amp; consent.</p>
          {categories.map((c) => (
            <fieldset key={c}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">{c}</legend>
              <div className="flex flex-wrap gap-2">
                {TOPIC_LIST.filter((t) => t.category === c).map((t) => (
                  <label key={t.id} className="chip-toggle capitalize">
                    <input type="checkbox" name="interests" value={t.id} defaultChecked={p.interests.includes(t.id)} className="sr-only" />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </Card>

        <Card className="space-y-5">
          <h2 className="text-xl text-charcoal">How you like to meet</h2>
          {(Object.keys(PERSONALITY) as (keyof typeof PERSONALITY)[]).map((key) => (
            <fieldset key={key}>
              <legend className="mb-2 text-sm font-medium text-ink-700">{PERSONALITY[key].label}</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PERSONALITY[key].options).map(([value, label]) => (
                  <label key={value} className="chip-toggle">
                    <input type="radio" name={key} value={value} defaultChecked={p.personality[key] === value} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">I&apos;m hoping to find…</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LOOKING_FOR).map(([value, label]) => (
                <label key={value} className="chip-toggle">
                  <input type="checkbox" name="lookingFor" value={value} defaultChecked={p.lookingFor.includes(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <SubmitButton className="shadow-lift" pendingLabel="Saving…">
            Save profile
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
