import type { Metadata } from "next";
import { StatusPill, Table, Td } from "@/components/admin-ui";
import { PageHeader, Stat, timeAgo } from "@/components/ui";
import { listIntroductionsAdmin } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Introductions" };

export default async function AdminIntroductionsPage() {
  const admin = await requireAdmin();
  const intros = await listIntroductionsAdmin(admin.id);
  const by = (s: string) => intros.filter((i) => i.status === s).length;
  const decided = by("connected") + by("declined");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Agent network" title="Introductions" description="Every introduction and both members' decisions. A connection exists only where both approved." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending" value={by("pending")} />
        <Stat label="Connected" value={by("connected")} />
        <Stat label="Declined" value={by("declined")} />
        <Stat label="Approval rate" value={decided ? `${Math.round((by("connected") / decided) * 100)}%` : "—"} hint="of decided introductions" />
      </section>
      <Table head={["Members", "First decision", "Second decision", "Outcome", "Requested", "Decided"]} empty={!intros.length}>
        {intros.map((i) => (
          <tr key={i.id}>
            <Td className="font-medium text-charcoal">
              {i.a} &amp; {i.b}
            </Td>
            <Td>
              <StatusPill status={i.a_decision} /> <span className="text-xs text-ink-500">{i.a.split(" ")[0]}</span>
            </Td>
            <Td>
              <StatusPill status={i.b_decision} /> <span className="text-xs text-ink-500">{i.b.split(" ")[0]}</span>
            </Td>
            <Td>
              <StatusPill status={i.status} />
            </Td>
            <Td className="text-xs text-ink-500">{timeAgo(i.created_at)}</Td>
            <Td className="text-xs text-ink-500">{i.decided_at ? timeAgo(i.decided_at) : "—"}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
