import type { Metadata } from "next";
import { adminSetCircleStatusAction } from "@/app/actions";
import { StatusPill, Table, Td } from "@/components/admin-ui";
import { ActionButton } from "@/components/forms";
import { PageHeader, formatDate } from "@/components/ui";
import { topicLabel } from "@/lib/matching/topics";
import { listCirclesAdmin } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Circles" };

export default async function AdminCirclesPage() {
  const admin = await requireAdmin();
  const circles = await listCirclesAdmin(admin.id);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Community" title="Circles" description="Small groups of four to eight members. Group conversations are private to their members." />
      <Table head={["Circle", "Topic", "Area", "Members", "Status", "Created", "Actions"]} empty={!circles.length}>
        {circles.map((c) => (
          <tr key={c.id}>
            <Td className="font-medium text-charcoal">{c.name}</Td>
            <Td className="capitalize">{topicLabel(c.topic)}</Td>
            <Td>{c.area ?? "—"}</Td>
            <Td className="tabular-nums">
              {Number(c.members)} / {Number(c.capacity)}
            </Td>
            <Td>
              <StatusPill status={c.status} />
            </Td>
            <Td className="text-xs text-ink-500">{formatDate(c.created_at)}</Td>
            <Td>
              {c.status === "open" ? (
                <ActionButton action={adminSetCircleStatusAction} fields={{ id: c.id, status: "closed" }} variant="danger" confirm={`Close ${c.name}? It will no longer be listed or joinable.`}>
                  Close
                </ActionButton>
              ) : (
                <ActionButton action={adminSetCircleStatusAction} fields={{ id: c.id, status: "open" }} variant="sage">
                  Reopen
                </ActionButton>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
