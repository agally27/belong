import Link from "next/link";
import { adminCloseTicketAction, adminRunNetworkAction } from "@/app/actions";
import { PrivacyNote } from "@/components/admin-ui";
import { ActionButton } from "@/components/forms";
import { Card, Notice, PageHeader, SectionTitle, Stat, timeAgo } from "@/components/ui";
import { env } from "@/lib/config";
import { getPaymentProvider } from "@/lib/adapters/payments";
import { listTickets, overview } from "@/lib/services/admin";
import { aiStatus } from "@/lib/services/companion";
import { requireAdmin } from "@/lib/session";

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  const [o, tickets, ai] = [await overview(admin.id), await listTickets(admin.id), await aiStatus()];
  const open = tickets.filter((t) => t.status === "open");
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Administration" title="Overview" description="The health of the BELONG network at a glance." actions={<ActionButton action={adminRunNetworkAction} variant="primary" size="md" pendingLabel="Running…">Run agent network now</ActionButton>} />
      {env.demoMode() && (
        <Notice tone="sky">
          <strong>Demonstration data.</strong> {o.demoMembers} of the accounts here are fictional demo accounts seeded for evaluation. Set <code>BELONG_DEMO_MODE=false</code> before launch.
        </Notice>
      )}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={o.members} hint={`${o.onboarded} onboarded`} />
        <Stat label="Active this week" value={o.activeThisWeek} />
        <Stat label="Active signals" value={o.activeSignals} hint={`${o.liveSignals} temporary`} />
        <Stat label="Suggestions" value={o.suggestions} hint="awaiting members" />
        <Stat label="Pending introductions" value={o.pendingIntros} />
        <Stat label="Connections" value={o.connections} />
        <Stat label="Open Circles" value={o.circles} />
        <Stat label="Paid members" value={o.paidMembers} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Needs attention</SectionTitle>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between rounded-xl bg-ivory px-4 py-3">
              <span>Open reports</span>
              <Link href="/admin/moderation" className="font-medium text-lavender-600 hover:underline">
                {o.openReports} to review
              </Link>
            </li>
            <li className="flex justify-between rounded-xl bg-ivory px-4 py-3">
              <span>Open support tickets</span>
              <span className="font-medium">{o.openTickets}</span>
            </li>
          </ul>
        </Card>
        <Card>
          <SectionTitle>Service status</SectionTitle>
          <dl className="space-y-2 text-sm">
            {[
              ["Companion AI", ai.simulated ? "Built-in simulation (no API key)" : "Claude (live)"],
              ["Payments", getPaymentProvider().simulated ? "Simulated (no provider connected)" : getPaymentProvider().name],
              ["Database", process.env.DATABASE_URL ? "PostgreSQL" : "Local SQLite file"],
              ["Matching engine", "Local · independent of AI"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 rounded-xl bg-ivory px-4 py-3">
                <dt className="text-ink-500">{k}</dt>
                <dd className="text-right font-medium text-charcoal">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      <section>
        <SectionTitle>Support tickets</SectionTitle>
        {open.length ? (
          <ul className="space-y-3">
            {open.map((t) => (
              <li key={t.id} className="rounded-2xl border border-sand/70 bg-paper p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-charcoal">{t.subject}</p>
                    <p className="text-xs text-ink-500">
                      {t.member ?? "Former member"} · {timeAgo(t.created_at)}
                    </p>
                  </div>
                  <ActionButton action={adminCloseTicketAction} fields={{ id: t.id }}>
                    Mark resolved
                  </ActionButton>
                </div>
                <p className="mt-2 text-sm text-ink-700">{t.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-500">No open tickets.</p>
        )}
      </section>
      <PrivacyNote />
    </div>
  );
}
