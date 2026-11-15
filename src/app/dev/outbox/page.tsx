import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, Logo, Notice, PageHeader, timeAgo } from "@/components/ui";
import { devOutbox, emailConfigured } from "@/lib/adapters/notifications";
import { env } from "@/lib/config";

export const metadata: Metadata = { title: "Development outbox", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Turns URLs in plain-text email into links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          // Open on whichever host you're viewing the outbox from.
          <a key={i} href={(() => { const u = new URL(p); return u.pathname + u.search; })()} className="break-all font-medium text-lavender-600 underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * DEMO MODE ONLY. Emails that would have been sent, so verification and reset
 * can be tried without an email provider. Never available in production.
 */
export default function DevOutboxPage() {
  if (!env.demoMode() || emailConfigured()) notFound();
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Logo />
      <main id="main" className="mt-8">
        <PageHeader eyebrow="Demonstration mode" title="Development outbox" description="Emails BELONG would have sent, newest first. Kept in memory only, and cleared when the server restarts." />
        <Notice tone="peach" className="mb-6">
          This page exists only in demo mode with no email service connected. It must never be reachable in production — set <code>BELONG_DEMO_MODE=false</code>.
        </Notice>
        {devOutbox.length ? (
          <ul className="space-y-4">
            {devOutbox.map((m, i) => (
              <li key={`${m.sentAt}-${i}`}>
                <Card>
                  <p className="text-xs text-ink-500">
                    To {m.to} · {timeAgo(m.sentAt)}
                  </p>
                  <h2 className="mt-1 text-lg text-charcoal">{m.subject}</h2>
                  <p className="mt-3 whitespace-pre-line text-sm text-ink-700">
                    <Linkified text={m.text} />
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-500">Nothing has been sent yet.</p>
        )}
      </main>
    </div>
  );
}
