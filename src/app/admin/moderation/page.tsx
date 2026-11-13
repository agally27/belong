import type { Metadata } from "next";
import { adminResolveReportAction } from "@/app/actions";
import { PrivacyNote, StatusPill } from "@/components/admin-ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, timeAgo } from "@/components/ui";
import { listReports } from "@/lib/services/admin";
import { REPORT_REASONS } from "@/lib/services/safety";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Moderation" };

export default async function AdminModerationPage() {
  const admin = await requireAdmin();
  const reports = await listReports(admin.id);
  const open = reports.filter((r) => r.status === "open" || r.status === "reviewing");
  const closed = reports.filter((r) => r.status !== "open" && r.status !== "reviewing");
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Safety" title="Moderation" description="Reports from members, reviewed by a person. The reported member is never told who raised the report." />
      <section>
        <SectionTitle>Needs review ({open.length})</SectionTitle>
        {open.length ? (
          <div className="space-y-4">
            {open.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg text-charcoal">
                      {r.reported ?? "Former member"} <span className="font-sans text-sm text-ink-500">reported by {r.reporter ?? "a former member"}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <Badge tone="peach">{REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? r.reason}</Badge>
                      <span>About a {r.context_type}</span>·<span>{timeAgo(r.created_at)}</span>·<span>{Number(r.prior)} report{Number(r.prior) === 1 ? "" : "s"} about this member in total</span>
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                {r.detail && <blockquote className="mt-3 rounded-xl bg-ivory px-4 py-3 text-sm text-ink-700">{r.detail}</blockquote>}
                <p className="mt-2 text-xs text-ink-500">Only what the reporter chose to write is shown. Private conversations are not accessible to moderators.</p>
                <ActionForm action={adminResolveReportAction} className="mt-4 space-y-3">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="sr-only" htmlFor={`note-${r.id}`}>
                    Resolution note
                  </label>
                  <input id={`note-${r.id}`} name="note" maxLength={300} placeholder="Resolution note (optional, internal)" className="field text-sm" />
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton name="action" value="dismiss" variant="outline" size="sm">
                      No action needed
                    </SubmitButton>
                    <SubmitButton name="action" value="warn" variant="soft" size="sm">
                      Send a guidelines reminder
                    </SubmitButton>
                    <SubmitButton name="action" value="suspend" variant="danger" size="sm">
                      Suspend member
                    </SubmitButton>
                  </div>
                </ActionForm>
                {r.status === "open" && (
                  <div className="mt-2">
                    <ActionButton action={adminResolveReportAction} fields={{ id: r.id, action: "reviewing" }} variant="ghost">
                      Mark as under review
                    </ActionButton>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing waiting" body="New reports from members will appear here." />
        )}
      </section>
      {closed.length > 0 && (
        <section>
          <SectionTitle>Resolved</SectionTitle>
          <ul className="space-y-2">
            {closed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sand/70 bg-paper px-4 py-3 text-sm">
                <span>
                  <span className="font-medium text-charcoal">{r.reported ?? "Former member"}</span> <span className="text-ink-500">· {REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? r.reason}</span>
                  <span className="block text-xs text-ink-500">{r.resolution}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-ink-500">
                  {r.resolved_at && timeAgo(r.resolved_at)} <StatusPill status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <PrivacyNote />
    </div>
  );
}
