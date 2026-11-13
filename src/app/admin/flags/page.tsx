import type { Metadata } from "next";
import { adminSetFlagAction } from "@/app/actions";
import { AutoSwitch } from "@/components/forms";
import { Card, PageHeader, timeAgo } from "@/components/ui";
import { listFlags } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Feature flags" };

export default async function AdminFlagsPage() {
  const admin = await requireAdmin();
  const flags = await listFlags(admin.id);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader eyebrow="Configuration" title="Feature flags" description="Switch parts of BELONG on or off for everyone, instantly. Changes are recorded in the audit log." />
      <Card className="!p-0">
        <ul className="divide-y divide-sand/60">
          {flags.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-5 px-5 py-4">
              <div>
                <p className="font-medium text-charcoal">{f.description}</p>
                <p className="text-xs text-ink-500">
                  <code>{f.key}</code> · updated {timeAgo(f.updated_at)}
                </p>
              </div>
              <AutoSwitch action={adminSetFlagAction} fields={{ key: f.key }} checked={Boolean(f.enabled)} label={f.description} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
