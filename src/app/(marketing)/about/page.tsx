import type { Metadata } from "next";
import { ProsePage } from "@/components/prose";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <ProsePage title="Why BELONG exists" intro="Making friends as an adult is hard. Not because people don't want to — but because the right people rarely find each other at the right moment.">
      <section>
        <h2>The idea</h2>
        <p>
          Most of us have met a great friend through a mutual acquaintance who said, &ldquo;You two should meet.&rdquo; BELONG gives everyone that acquaintance: a personal AI companion that understands what you enjoy and what you&apos;re hoping for, and looks out for people who fit.
        </p>
      </section>
      <section>
        <h2>What we believe</h2>
        <ul>
          <li>AI should bring people closer together, not replace human relationships.</li>
          <li>The goal is fewer, better connections — not more time on a screen.</li>
          <li>You should always know, and control, what is shared about you.</li>
          <li>Small groups and shared activities are where friendship really happens.</li>
        </ul>
      </section>
      <section>
        <h2>What BELONG is not</h2>
        <p>It isn&apos;t a dating app, a social feed, or a chatbot to keep you company. Your companion will always nudge you toward real people, and it will always tell you it&apos;s an AI.</p>
      </section>
      <LinkButton href="/register" size="lg">
        Meet your companion
      </LinkButton>
    </ProsePage>
  );
}
