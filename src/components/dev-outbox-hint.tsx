import Link from "next/link";
import { emailConfigured } from "@/lib/adapters/notifications";
import { env } from "@/lib/config";
import { Notice } from "./ui";

/** In demo mode without a real email provider, explain where emails go. */
export function DevOutboxHint({ className }: { className?: string }) {
  if (emailConfigured() || !env.demoMode()) return null;
  return (
    <Notice tone="sky" className={className ?? "mt-5"}>
      <strong>Demonstration mode.</strong> No email service is connected, so emails are kept in the{" "}
      <Link href="/dev/outbox" className="font-medium underline">
        development outbox
      </Link>{" "}
      instead of being sent.
    </Notice>
  );
}
