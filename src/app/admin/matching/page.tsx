import type { Metadata } from "next";
import { adminRunNetworkAction, adminSetWeightsAction } from "@/app/actions";
import { StatusPill, Table, Td } from "@/components/admin-ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, PageHeader, timeAgo } from "@/components/ui";
import { getWeightsAdmin, listMatchesAdmin } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Matching" };

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function AdminMatchingPage() {
  const admin = await requireAdmin();
  const [weights, matches] = [await getWeightsAdmin(admin.id), await listMatchesAdmin(admin.id)];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Agent network" title="Matching engine" description="The engine compares approved signals across three dimensions. It runs locally and does not depend on any AI service." actions={<ActionButton action={adminRunNetworkAction} variant="primary" size="md" pendingLabel="Running…">Run now</ActionButton>} />
      <Card>
        <h2 className="text-xl text-charcoal">Matching weights</h2>
        <p className="mt-1 text-sm text-ink-500">How much each dimension contributes to a match score (0–1), and the minimum score (0–100) needed before a suggestion is shown. Saving re-runs the network.</p>
        <ActionForm action={adminSetWeightsAction} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Shared interests">
              <input type="number" name="shared" step="0.05" min="0" max="1" defaultValue={weights.shared} className="field" required />
            </Field>
            <Field label="Shared moments">
              <input type="number" name="moments" step="0.05" min="0" max="1" defaultValue={weights.moments} className="field" required />
            </Field>
            <Field label="Complementary">
              <input type="number" name="complementary" step="0.05" min="0" max="1" defaultValue={weights.complementary} className="field" required />
            </Field>
            <Field label="Minimum score">
              <input type="number" name="threshold" step="1" min="0" max="100" defaultValue={weights.threshold} className="field" required />
            </Field>
          </div>
          <SubmitButton className="mt-4" pendingLabel="Saving and re-running…">
            Save weights
          </SubmitButton>
        </ActionForm>
      </Card>
      <Table head={["Pair", "Score", "Shared", "Moments", "Complementary", "Top reason", "Status", "Updated"]} empty={!matches.length}>
        {matches.map((m) => (
          <tr key={m.id}>
            <Td className="font-medium text-charcoal">
              {m.a} &amp; {m.b}
            </Td>
            <Td className="tabular-nums font-medium">{m.score}</Td>
            <Td className="tabular-nums">{pct(m.dimensions.shared)}</Td>
            <Td className="tabular-nums">{pct(m.dimensions.moments)}</Td>
            <Td className="tabular-nums">{pct(m.dimensions.complementary)}</Td>
            <Td className="max-w-[16rem] text-xs text-ink-500">{m.topReason}</Td>
            <Td>
              <StatusPill status={m.status} />
            </Td>
            <Td className="text-xs text-ink-500">{timeAgo(m.updatedAt)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
