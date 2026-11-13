import type { Metadata } from "next";
import { ProsePage } from "@/components/prose";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" intro="The short version: be an adult, be yourself, be kind — and remember that BELONG introduces people, it doesn't vouch for them." draft>
      <section>
        <h2>Using BELONG</h2>
        <ul>
          <li>You must be 18 or over and provide accurate information.</li>
          <li>You&apos;re responsible for keeping your sign-in details safe.</li>
          <li>You agree to follow the community guidelines. We may suspend accounts that don&apos;t.</li>
        </ul>
      </section>
      <section>
        <h2>Your companion</h2>
        <p>Your companion is an AI. It can be wrong, and its suggestions are not professional advice of any kind. It is not a substitute for medical, mental-health or emergency services.</p>
      </section>
      <section>
        <h2>Meeting other members</h2>
        <p>BELONG suggests introductions based on signals members choose to share. We don&apos;t verify identities or run background checks. You are responsible for your own decisions and safety when interacting with others.</p>
      </section>
      <section>
        <h2>Membership and payments</h2>
        <p>Paid memberships renew until cancelled. You can cancel at any time and keep your benefits until the end of the paid period. Statutory cancellation rights apply.</p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>What you write remains yours. You give BELONG permission to store and process it solely to run the service for you, as described in the privacy summary.</p>
      </section>
    </ProsePage>
  );
}
