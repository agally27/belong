import type { Metadata } from "next";
import { adminSetUserPlanAction, adminSetUserRoleAction, adminSetUserStatusAction } from "@/app/actions";
import { PrivacyNote, StatusPill, Table, Td } from "@/components/admin-ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Badge, PageHeader, formatDate, timeAgo } from "@/components/ui";
import { listUsers } from "@/lib/services/admin";
import { listPlans } from "@/lib/services/subscriptions";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Members" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requireAdmin();
  const { q = "" } = await searchParams;
  const [users, plans] = [await listUsers(admin.id, q), await listPlans(true)];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Members" description="Accounts, profiles and companion status. Counts only — never content." />
      <form className="flex max-w-md gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search members
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by name or email" className="field text-sm" />
        <button className="rounded-full bg-charcoal px-5 text-sm font-medium text-ivory">Search</button>
      </form>
      <Table head={["Member", "Status", "Membership", "Companion", "Activity", "Actions"]} empty={!users.length}>
        {users.map((u) => (
          <tr key={u.id}>
            <Td>
              <p className="font-medium text-charcoal">{u.name}</p>
              <p className="text-xs text-ink-500">{u.email}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {u.isDemo && <Badge tone="outline">Fictional demo</Badge>}
                {u.role === "admin" && <Badge tone="peach">Admin</Badge>}
                {!u.onboarded && u.role !== "admin" && <Badge tone="neutral">Not onboarded</Badge>}
              </p>
            </Td>
            <Td>
              <StatusPill status={u.status} />
              <p className="mt-1 text-xs text-ink-500">{u.area}</p>
            </Td>
            <Td>
              <ActionForm action={adminSetUserPlanAction} className="flex items-center gap-1.5">
                <input type="hidden" name="userId" value={u.id} />
                <select name="planId" defaultValue={u.plan} className="rounded-lg border border-sand bg-paper px-2 py-1 text-xs" aria-label={`Membership for ${u.name}`}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="ghost" size="sm" className="!px-2 !py-1 text-xs">
                  Set
                </SubmitButton>
              </ActionForm>
            </Td>
            <Td>
              <p>{u.companion ?? "—"}</p>
              <p className="text-xs text-ink-500">
                {u.companionMessages} messages · {u.memories} memories
              </p>
            </Td>
            <Td>
              <p className="text-xs text-ink-500">
                {u.signals} signals · {u.connections} connections
              </p>
              <p className="text-xs text-ink-500">Joined {formatDate(u.createdAt)}</p>
              {u.lastActiveAt && <p className="text-xs text-ink-500">Active {timeAgo(u.lastActiveAt)}</p>}
            </Td>
            <Td>
              {u.id !== admin.id && (
                <div className="flex flex-col items-start gap-1.5">
                  {u.status === "active" ? (
                    <ActionButton action={adminSetUserStatusAction} fields={{ userId: u.id, status: "suspended" }} variant="danger" confirm={`Suspend ${u.name}? They will be signed out and removed from matching.`}>
                      Suspend
                    </ActionButton>
                  ) : (
                    <ActionButton action={adminSetUserStatusAction} fields={{ userId: u.id, status: "active" }} variant="sage">
                      Reinstate
                    </ActionButton>
                  )}
                  <ActionButton
                    action={adminSetUserRoleAction}
                    fields={{ userId: u.id, role: u.role === "admin" ? "member" : "admin" }}
                    variant="ghost"
                    confirm={u.role === "admin" ? `Remove admin access from ${u.name}?` : `Give ${u.name} full admin access?`}
                  >
                    {u.role === "admin" ? "Remove admin" : "Make admin"}
                  </ActionButton>
                </div>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      <PrivacyNote />
    </div>
  );
}
