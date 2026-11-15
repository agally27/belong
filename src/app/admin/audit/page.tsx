import type { Metadata } from "next";
import { Pager, Table, Td, pageFrom } from "@/components/admin-ui";
import { PageHeader } from "@/components/ui";
import { listAudit } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const admin = await requireAdmin();
  const page = pageFrom((await searchParams).page);
  const { rows, hasNext } = await listAudit(admin.id, page);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Accountability" title="Audit log" description="A record of security- and privacy-relevant actions: consent changes, introductions, moderation and configuration. Most recent first." />
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
      <Pager page={page} hasNext={hasNext} path="/admin/audit" />
    </div>
  );
}
