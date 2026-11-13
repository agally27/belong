"use client";

import { useActionState, useState } from "react";
import { completeOnboardingAction } from "@/app/actions";
import { FormMessage } from "@/components/forms";
import { Button, Card, CompanionOrb, Field, cx } from "@/components/ui";
import { COMPANION_STYLES, COMPANION_TONES, PERSONALITY } from "@/lib/config";

const AGE_RANGES = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"];
const LOOKING_FOR: [string, string][] = [
  ["friendship", "New friends"],
  ["activity_partners", "People to do things with"],
  ["community", "A sense of community"],
  ["collaboration", "Creative or professional collaborators"],
  ["conversation", "Good conversation"],
];
const STEPS = ["About you", "What you love", "How you like to meet", "Your companion", "Your privacy"];

type Topic = { id: string; label: string; category: string };
type Consent = { key: string; title: string; description: string; group: string; recommended: boolean };

export function OnboardingWizard({ initialName, companionName, topics, consents }: { initialName: string; companionName: string; topics: Topic[]; consents: Consent[] }) {
  const [step, setStep] = useState(0);
  const [state, formAction, pending] = useActionState(completeOnboardingAction, {});
  const [interests, setInterests] = useState<string[]>([]);
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [style, setStyle] = useState<string>("lavender");
  const [name, setName] = useState(initialName);
  const [localError, setLocalError] = useState("");

  const categories = [...new Set(topics.map((t) => t.category))];
  const toggleInterest = (id: string) => setInterests((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 12 ? cur : [...cur, id]));

  const next = () => {
    setLocalError("");
    if (step === 0 && name.trim().length < 2) return setLocalError("Tell us what to call you.");
    if (step === 1 && interests.length < 2) return setLocalError("Choose at least two interests so your companion has somewhere to start.");
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0 });
  };

  return (
    <form
      action={formAction}
      onKeyDown={(e) => {
        // Enter moves to the next step rather than submitting early.
        if (e.key === "Enter" && step < STEPS.length - 1 && (e.target as HTMLElement).tagName !== "TEXTAREA" && (e.target as HTMLElement).tagName !== "BUTTON") {
          e.preventDefault();
          next();
        }
      }}
    >
      <p className="text-sm font-medium text-lavender-600" aria-live="polite">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} className={cx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-lavender-500" : "bg-sand")} />
        ))}
      </div>

      {/* Every step stays mounted so the whole form is submitted at the end. */}
      <Card className={cx("mt-6 space-y-5", step !== 0 && "hidden")}>
        <div>
          <h1 className="text-3xl text-charcoal">Let&apos;s start with you</h1>
          <p className="mt-1.5 text-ink-500">Just the basics. You can change any of this later.</p>
        </div>
        <Field label="First name, or what you like to be called">
          <input className="field" name="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pronouns (optional)">
            <input className="field" name="pronouns" placeholder="e.g. she/her" maxLength={30} />
          </Field>
          <Field label="Age range (optional)">
            <select className="field" name="ageRange" defaultValue="">
              <option value="">Prefer not to say</option>
              {AGE_RANGES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Your general area" hint="A town or neighbourhood is plenty — for example “Southville, Bristol”. BELONG never uses your exact location.">
          <input className="field" name="area" maxLength={60} placeholder="Town or neighbourhood" />
        </Field>
        <Field label="A line or two about you (optional)">
          <textarea className="field" name="bio" rows={3} maxLength={400} placeholder="What would a friend say about you?" />
        </Field>
      </Card>

      <Card className={cx("mt-6 space-y-5", step !== 1 && "hidden")}>
        <div>
          <h1 className="text-3xl text-charcoal">What do you love?</h1>
          <p className="mt-1.5 text-ink-500">Pick between 2 and 12. Your companion will ask about the rest in conversation.</p>
        </div>
        {interests.map((i) => (
          <input key={i} type="hidden" name="interests" value={i} />
        ))}
        {categories.map((c) => (
          <fieldset key={c}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">{c}</legend>
            <div className="flex flex-wrap gap-2">
              {topics
                .filter((t) => t.category === c)
                .map((t) => (
                  <button key={t.id} type="button" aria-pressed={interests.includes(t.id)} onClick={() => toggleInterest(t.id)} className="chip-toggle capitalize">
                    {t.label}
                  </button>
                ))}
            </div>
          </fieldset>
        ))}
        <p className="text-sm text-ink-500" aria-live="polite">
          {interests.length} selected
        </p>
      </Card>

      <Card className={cx("mt-6 space-y-6", step !== 2 && "hidden")}>
        <div>
          <h1 className="text-3xl text-charcoal">How do you like to meet people?</h1>
          <p className="mt-1.5 text-ink-500">There are no right answers. This helps your companion suggest people and settings that suit you.</p>
        </div>
        {(Object.keys(PERSONALITY) as (keyof typeof PERSONALITY)[]).map((key) => (
          <fieldset key={key}>
            <legend className="mb-2 text-sm font-medium text-ink-700">{PERSONALITY[key].label}</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PERSONALITY[key].options).map(([value, label]) => (
                <label key={value} className="chip-toggle">
                  <input type="radio" name={key} value={value} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-700">I&apos;m hoping to find…</legend>
          <div className="flex flex-wrap gap-2">
            {LOOKING_FOR.map(([value, label]) => (
              <label key={value} className="chip-toggle">
                <input type="checkbox" name="lookingFor" value={value} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className={cx("mt-6 space-y-5", step !== 3 && "hidden")}>
        <div className="flex items-center gap-4">
          <CompanionOrb style={style} size={64} animate />
          <div>
            <h1 className="text-3xl text-charcoal">Meet your companion</h1>
            <p className="mt-1 text-ink-500">An AI that gets to know you, and looks out for people you&apos;d like. It will always be honest that it&apos;s an AI.</p>
          </div>
        </div>
        <Field label="What would you like to call it?">
          <input className="field" name="companionName" defaultValue={companionName} maxLength={24} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-700">How should it speak with you?</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(COMPANION_TONES).map(([value, label], i) => (
              <label key={value} className="chip-toggle">
                <input type="radio" name="tone" value={value} defaultChecked={i === 0} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-700">Choose its look</legend>
          <div className="flex gap-3">
            {COMPANION_STYLES.map((s) => (
              <label key={s} className={cx("cursor-pointer rounded-full p-1 ring-2 transition", style === s ? "ring-lavender-500" : "ring-transparent")}>
                <input type="radio" name="style" value={s} checked={style === s} onChange={() => setStyle(s)} className="sr-only" aria-label={`${s} style`} />
                <CompanionOrb style={s} size={44} />
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className={cx("mt-6 space-y-5", step !== 4 && "hidden")}>
        <div>
          <h1 className="text-3xl text-charcoal">You decide what&apos;s shared</h1>
          <p className="mt-1.5 text-ink-500">
            Everything is off until you turn it on. Your conversations and memories are never shared — only the generalised signals you allow here. You can change these at any time.
          </p>
        </div>
        <Button type="button" variant="soft" size="sm" onClick={() => setGranted(Object.fromEntries(consents.map((c) => [c.key, c.recommended])))}>
          Use recommended settings
        </Button>
        {[...new Set(consents.map((c) => c.group))].map((group) => (
          <fieldset key={group} className="space-y-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-500">{group}</legend>
            {consents
              .filter((c) => c.group === group)
              .map((c) => (
                <label key={c.key} className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-sand/70 bg-ivory px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium text-charcoal">{c.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-500">{c.description}</span>
                  </span>
                  <input type="checkbox" role="switch" name={`consent_${c.key}`} className="switch mt-1" checked={Boolean(granted[c.key])} onChange={(e) => setGranted((g) => ({ ...g, [c.key]: e.target.checked }))} />
                </label>
              ))}
          </fieldset>
        ))}
        {!granted.matching_enabled && <p className="text-sm text-ink-500">With matching off, your companion can still chat with you, but it won&apos;t look for connections.</p>}
      </Card>

      {localError && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-100 bg-rose-100/60 px-4 py-2.5 text-sm text-rose-700">
          {localError}
        </p>
      )}
      <FormMessage state={state} className="mt-4" />

      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button key="next" type="button" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button key="finish" type="submit" variant="accent" disabled={pending}>
            {pending ? "Setting things up…" : "Finish and meet my companion"}
          </Button>
        )}
      </div>
    </form>
  );
}
