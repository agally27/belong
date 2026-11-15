import type { Metadata } from "next";
import { adminSetCircleStatusAction } from "@/app/actions";
import { StatusPill, Table, Td } from "@/components/admin-ui";
import { ActionButton } from "@/components/forms";
import { PageHeader, formatDate } from "@/components/ui";
import { topicLabel } from "@/lib/matching/topics";
import { listCircleRemovals, listCirclesAdmin } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Circles" };

export default async function AdminCirclesPage() {
  const admin = await requireAdmin();
  const [circles, removals] = [await listCirclesAdmin(admin.id), await listCircleRemovals(admin.id)];
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
      <section className="space-y-3">
        <h2 className="text-xl text-charcoal">Removed by hosts</h2>
        <p className="text-sm text-ink-500">Hosts can remove someone from their Circle. Repeated removals of the same person, or one host removing many people, may be worth a closer look.</p>
        <Table head={["When", "Circle", "Removed", "By host"]} empty={!removals.length}>
          {removals.map((r, i) => (
            <tr key={`${r.removed_id}-${r.created_at}-${i}`}>
              <Td className="text-xs text-ink-500">{formatDate(r.created_at)}</Td>
              <Td>{r.circle}</Td>
              <Td>
                {r.removed ?? "Former member"}
                {Number(r.times_removed) > 1 && <span className="ml-2 rounded-full bg-peach-100 px-2 py-0.5 text-xs text-peach-700">removed {Number(r.times_removed)} times</span>}
              </Td>
              <Td>
                {r.host ?? "Former member"}
                {Number(r.host_removals) > 2 && <span className="ml-2 rounded-full bg-peach-100 px-2 py-0.5 text-xs text-peach-700">{Number(r.host_removals)} removals</span>}
              </Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
