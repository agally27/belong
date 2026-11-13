import type { Metadata } from "next";
import { Table, Td } from "@/components/admin-ui";
import { PageHeader } from "@/components/ui";
import { listAudit } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage() {
  const admin = await requireAdmin();
  const rows = await listAudit(admin.id);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Accountability" title="Audit log" description="A record of security- and privacy-relevant actions: consent changes, introductions, moderation and configuration. The most recent 150 entries." />
      <Table head={["When", "Who", "Action", "Target", "Details"]} empty={!rows.length}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-xs text-ink-500">{new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}</Td>
            <Td>{r.actor ?? <span className="text-ink-500">System</span>}</Td>
            <Td>
              <code className="rounded bg-cream px-1.5 py-0.5 text-xs">{r.action}</code>
            </Td>
            <Td className="text-xs text-ink-500">{r.target_type}</Td>
            <Td className="max-w-[18rem] truncate text-xs text-ink-500">{r.meta === "{}" ? "" : r.meta}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
