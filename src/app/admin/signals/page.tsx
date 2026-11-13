import type { Metadata } from "next";
import { StatusPill, Table, Td } from "@/components/admin-ui";
import { BarList } from "@/components/charts";
import { Badge, PageHeader, timeAgo } from "@/components/ui";
import { listSignalsAdmin } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Signals" };

export default async function AdminSignalsPage() {
  const admin = await requireAdmin();
  const data = await listSignalsAdmin(admin.id);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Agent network" title="Connection signals" description="Signals are the only layer the agent network can read: generalised topics that members have approved. Their sources — memories and conversations — are not visible here." />
      <div className="grid gap-5 lg:grid-cols-2">
        <BarList title="Most common topics" note="Active signals by topic" data={data.byTopic} />
        <BarList title="Signals by kind" note="Active signals" data={data.byKind} />
      </div>
      <Table head={["Member", "Signal", "Kind", "Source", "Status", "Created"]} empty={!data.signals.length}>
        {data.signals.map((s) => (
          <tr key={s.id}>
            <Td className="font-medium text-charcoal">{s.member}</Td>
            <Td className="capitalize">{s.label}</Td>
            <Td>
              <Badge tone={s.temporary ? "sky" : "lavender"}>{s.kind}</Badge>
              {s.expiresAt && <p className="mt-0.5 text-xs text-ink-500">expires {timeAgo(s.expiresAt)}</p>}
            </Td>
            <Td className="text-xs text-ink-500">{s.source}</Td>
            <Td>
              <StatusPill status={s.status} />
            </Td>
            <Td className="text-xs text-ink-500">{timeAgo(s.createdAt)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
