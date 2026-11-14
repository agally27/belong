import type { Metadata } from "next";
import { Download, Eye, Timer } from "lucide-react";
import { deleteAccountAction, setConsentAction, setSignalRevokedAction, unblockUserAction } from "@/app/actions";
import { ActionButton, ActionForm, AutoSwitch, SubmitButton } from "@/components/forms";
import { Avatar, Badge, Card, Field, Notice, PageHeader, SectionTitle, buttonClass, timeAgo } from "@/components/ui";
import { CONSENTS } from "@/lib/config";
import { getConsents } from "@/lib/services/core";
import { getCompanion } from "@/lib/services/profile";
import { listBlocked } from "@/lib/services/safety";
import { listMySignals, signalTopicLabel } from "@/lib/services/signals";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Privacy & consent" };

const KIND_LABEL: Record<string, string> = {
  interest: "Interest",
  experience: "Experience",
  personality: "Social style",
  intention: "Current intention",
  moment: "Current moment",
  offer: "Something I can share",
  seek: "Something I'd like to learn",
  collaboration: "Open to collaborating",
  availability: "When I'm usually free",
};
const SOURCE_LABEL: Record<string, string> = { profile: "from your profile", memory: "from a memory you shared", intention: "from an intention you shared" };

export default async function PrivacyPage() {
  const user = await requireMember();
  const [consents, signals, blocked, companion] = [await getConsents(user.id), await listMySignals(user.id), await listBlocked(user.id), await getCompanion(user.id)];
  const groups = [...new Set(CONSENTS.map((c) => c.group))];
  const activeSignals = signals.filter((s) => s.status === "active");
  const revoked = signals.filter((s) => s.status === "revoked");

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader eyebrow="You're in control" title="Privacy & consent" description="See exactly what leaves your account, switch any of it off, and take your data with you whenever you like." />

      <Notice tone="sage">
        <strong>The short version:</strong> your conversations with {companion.name}, your memories and your messages are never shared with other members or their companions. The agent network only sees the signals listed on this page.
      </Notice>

      <section>
        <SectionTitle>What you allow</SectionTitle>
        <div className="space-y-6">
          {groups.map((g) => (
            <Card key={g} className="!p-0">
              <h3 className="border-b border-sand/70 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-ink-500">{g}</h3>
              <ul className="divide-y divide-sand/60">
                {CONSENTS.filter((c) => c.group === g).map((c) => (
                  <li key={c.key} className="flex items-start justify-between gap-5 px-5 py-4">
                    <div>
                      <p className="font-medium text-charcoal">{c.title}</p>
                      <p className="mt-0.5 text-sm text-ink-500">{c.description}</p>
                    </div>
                    <AutoSwitch action={setConsentAction} fields={{ key: c.key }} checked={consents[c.key]} label={c.title} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <Eye size={19} className="text-lavender-500" /> What {companion.name} is sharing right now
          </span>
        </SectionTitle>
        <p className="-mt-1 mb-4 text-sm text-ink-500">This is the complete list of what other companions can match against. Each one is a general topic — never your own words.</p>
        {activeSignals.length ? (
          <Card className="!p-0">
            <ul className="divide-y divide-sand/60">
              {activeSignals.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <p className="font-medium capitalize text-charcoal">{signalTopicLabel(s.topic)}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <Badge tone={s.temporary ? "sky" : "lavender"}>
                        {s.temporary && <Timer size={11} />} {KIND_LABEL[s.kind] ?? s.kind}
                      </Badge>
                      {SOURCE_LABEL[s.sourceType]}
                      {s.expiresAt && <span>· expires {timeAgo(s.expiresAt)}</span>}
                    </p>
                  </div>
                  <ActionButton action={setSignalRevokedAction} fields={{ id: s.id, revoked: "true" }} variant="ghost">
                    Stop sharing
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Notice tone="lavender">Nothing is being shared. {consents.matching_enabled ? "Add interests to your profile or share an intention to get started." : "Matching is switched off."}</Notice>
        )}
        {revoked.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-ink-700">Signals you&apos;ve stopped sharing ({revoked.length})</summary>
            <ul className="mt-2 space-y-2">
              {revoked.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-cream/60 px-4 py-2.5 text-sm">
                  <span className="capitalize text-ink-700">
                    {signalTopicLabel(s.topic)} <span className="text-ink-500">· {KIND_LABEL[s.kind]}</span>
                  </span>
                  <ActionButton action={setSignalRevokedAction} fields={{ id: s.id, revoked: "false" }} variant="ghost">
                    Share again
                  </ActionButton>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <SectionTitle>People you&apos;ve blocked</SectionTitle>
        {blocked.length ? (
          <ul className="space-y-2">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-sand/70 bg-paper px-4 py-3">
                <span className="flex items-center gap-3">
                  <Avatar name={b.name} hue={b.hue} size={34} /> {b.name}
                </span>
                <ActionButton action={unblockUserAction} fields={{ targetId: b.id }} variant="ghost">
                  Unblock
                </ActionButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-500">You haven&apos;t blocked anyone.</p>
        )}
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="text-xl text-charcoal">Download your data</h2>
          <p className="mt-2 text-sm text-ink-500">A complete copy of everything BELONG holds about you — profile, companion conversation, memories, signals and the messages you&apos;ve sent — as a JSON file.</p>
          <a href="/api/account/export" download className={buttonClass("outline", "sm", "mt-4")}>
            <Download size={15} /> Download my data
          </a>
        </Card>
        <Card className="border-rose-100">
          <h2 className="text-xl text-charcoal">Delete your account</h2>
          <p className="mt-2 text-sm text-ink-500">Permanently erases your profile, companion, memories, signals, connections and the messages you&apos;ve sent. This can&apos;t be undone.</p>
          <details className="mt-4">
            <summary className={buttonClass("danger", "sm", "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>Delete my account…</summary>
            <ActionForm action={deleteAccountAction} className="mt-4 space-y-3">
              <Field label="Your password">
                <input type="password" name="password" className="field text-sm" required autoComplete="current-password" />
              </Field>
              <Field label="Type DELETE to confirm">
                <input name="confirm" className="field text-sm" required autoComplete="off" />
              </Field>
              <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
                Permanently delete everything
              </SubmitButton>
            </ActionForm>
          </details>
        </Card>
      </section>
    </div>
  );
}
