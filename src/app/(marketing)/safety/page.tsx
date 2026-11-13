import type { Metadata } from "next";
import { ProsePage } from "@/components/prose";

export const metadata: Metadata = { title: "Safety & community" };

export default function SafetyPage() {
  return (
    <ProsePage title="Safety & community guidelines" intro="BELONG works because members treat each other with warmth and respect. These are the standards we hold everyone to.">
      <section>
        <h2>Be kind, be honest, be yourself</h2>
        <ul>
          <li>Represent yourself truthfully. One account per person, adults (18+) only.</li>
          <li>BELONG is for friendship, community and collaboration — not for selling, recruiting or unwanted romantic advances.</li>
          <li>No harassment, hate, threats or pressure of any kind.</li>
          <li>Respect a &ldquo;no&rdquo;. Declined introductions are final and never explained.</li>
        </ul>
      </section>
      <section>
        <h2>Meeting in person</h2>
        <ul>
          <li>Meet somewhere public the first few times, and tell someone you trust where you&apos;ll be.</li>
          <li>Arrange your own travel. Keep your home address to yourself until you know someone well.</li>
          <li>Circles and events are a relaxed way to meet several people at once.</li>
          <li>Trust your instincts. You can leave at any time and you never owe anyone an explanation.</li>
        </ul>
      </section>
      <section>
        <h2>Tools that are always free</h2>
        <ul>
          <li>
            <strong>Block</strong> — instant and silent. The connection ends, and you&apos;ll never be suggested to each other again.
          </li>
          <li>
            <strong>Report</strong> — reviewed by a person. The member you report is never told who raised it.
          </li>
          <li>
            <strong>Privacy controls</strong> — see and switch off every signal your companion shares.
          </li>
        </ul>
      </section>
      <section>
        <h2>If you need support now</h2>
        <p>
          Your companion is not a crisis service. If you&apos;re struggling, Samaritans are available free, day or night, on <strong>116 123</strong> (UK &amp; ROI). In an emergency call <strong>999</strong>.
        </p>
      </section>
    </ProsePage>
  );
}
