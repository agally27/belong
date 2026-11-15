import type { Metadata } from "next";
import { adminCancelGatheringAction } from "@/app/actions";
import { Pager, StatusPill, Table, Td, pageFrom } from "@/components/admin-ui";
import { ActionButton } from "@/components/forms";
import { PageHeader, Stat, formatDateTime, timeAgo } from "@/components/ui";
import { SLOT_LABEL } from "@/lib/matching/engine";
import { topicLabel } from "@/lib/matching/topics";
import { gatheringStats, listGatheringsAdmin } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Gatherings" };

export default async function AdminGatheringsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const admin = await requireAdmin();
  const page = pageFrom((await searchParams).page);
  const { rows, hasNext } = await listGatheringsAdmin(admin.id, page);
  const stats = await gatheringStats(admin.id);
  const by = (s: string) => stats.byStatus[s] ?? 0;
  const decided = by("confirmed") + by("completed") + by("lapsed");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Community" title="Gatherings" description="One-off get-togethers proposed by members' companions. Who was invited is not shown here — only counts." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting for replies" value={by("proposed")} />
        <Stat label="Going ahead" value={by("confirmed")} />
        <Stat label="Happened" value={by("completed")} hint={`${stats.becameCircles} became Circles`} />
        <Stat label="Success rate" value={decided ? `${Math.round(((by("confirmed") + by("completed")) / decided) * 100)}%` : "—"} hint="of proposals that were decided" />
      </section>
      <Table head={["Gathering", "Topic", "When", "Replies", "Status", "Proposed", ""]} empty={!rows.length}>
        {rows.map((g) => (
          <tr key={g.id}>
            <Td className="font-medium text-charcoal">
              {g.title}
              {g.area && <p className="text-xs font-normal text-ink-500">Around {g.area}</p>}
            </Td>
            <Td className="capitalize">{topicLabel(g.topic)}</Td>
            <Td className="text-xs">
              {formatDateTime(g.starts_at)}
              <p className="text-ink-500">{SLOT_LABEL[g.slot] ?? g.slot}</p>
            </Td>
            <Td className="tabular-nums text-xs">
              {Number(g.accepted)} yes · {Number(g.declined)} no · {Number(g.invited)} invited
            </Td>
            <Td>
              <StatusPill status={g.status} />
            </Td>
            <Td className="text-xs text-ink-500">{timeAgo(g.created_at)}</Td>
            <Td>
              {["proposed", "confirmed"].includes(g.status) && (
                <ActionButton action={adminCancelGatheringAction} fields={{ id: g.id }} variant="danger" confirm="Cancel this gathering? Everyone invited will be told.">
                  Cancel
                </ActionButton>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      <Pager page={page} hasNext={hasNext} path="/admin/gatherings" />
    </div>
  );
}
