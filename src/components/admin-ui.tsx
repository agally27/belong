import type { ReactNode } from "react";
import { cx } from "./ui";

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-sand/70 bg-paper">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-sand/70 text-xs uppercase tracking-wider text-ink-500">
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand/50">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-8 text-center text-sm text-ink-500">Nothing to show yet.</p>}
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("px-4 py-3 align-top text-ink-700", className)}>{children}</td>;
}

const STATUS: Record<string, string> = {
  active: "bg-sage-100 text-sage-700",
  open: "bg-peach-100 text-peach-700",
  suggested: "bg-lavender-100 text-lavender-700",
  pending: "bg-lavender-100 text-lavender-700",
  reviewing: "bg-sky-100 text-sky-700",
  connected: "bg-sage-100 text-sage-700",
  approved: "bg-sage-100 text-sage-700",
  resolved: "bg-sage-100 text-sage-700",
  suspended: "bg-rose-100 text-rose-700",
  declined: "bg-cream text-ink-700",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS[status] ?? "bg-cream text-ink-700")}>{status}</span>;
}

export function PrivacyNote() {
  return (
    <p className="rounded-xl border border-sage-200 bg-sage-50 px-4 py-2.5 text-xs text-sage-700">
      By design, administrators cannot read companion conversations, memories or private messages. This console shows only network-level data and aggregates.
    </p>
  );
}
