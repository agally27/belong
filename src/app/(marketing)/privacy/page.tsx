import type { Metadata } from "next";
import { ProsePage } from "@/components/prose";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy at BELONG" intro="A plain-English summary of what BELONG holds about you, why, and how you stay in control." draft>
      <section>
        <h2>What we hold</h2>
        <ul>
          <li>
            <strong>Account:</strong> your email address and a securely hashed password.
          </li>
          <li>
            <strong>Profile:</strong> the name, general area, bio and interests you choose to add.
          </li>
          <li>
            <strong>Companion conversation and memories:</strong> private to you. Memories are only saved when you approve them.
          </li>
          <li>
            <strong>Connection signals:</strong> generalised topics derived from what you&apos;ve approved, used for matching.
          </li>
          <li>
            <strong>Messages:</strong> between you and people you&apos;ve mutually connected with.
          </li>
        </ul>
      </section>
      <section>
        <h2>What we never do</h2>
        <ul>
          <li>We never share your conversations or memories with other members or their companions.</li>
          <li>We never track your precise location. We keep only the area name and postcode district (such as “BS3”) you choose to give, and other members never see your district.</li>
          <li>We never sell your personal data.</li>
          <li>We never introduce you to anyone without your approval and theirs.</li>
        </ul>
      </section>
      <section>
        <h2>Our lawful bases (UK GDPR)</h2>
        <p>We process account and messaging data to provide the service you&apos;ve asked for (contract). Matching signals, analytics and marketing are based on your consent, which you can withdraw at any time in Privacy &amp; consent.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <ul>
          <li>
            <strong>Access and portability:</strong> download everything in Settings → Privacy &amp; consent.
          </li>
          <li>
            <strong>Rectification:</strong> edit your profile and memories at any time.
          </li>
          <li>
            <strong>Erasure:</strong> delete your account permanently from the same page.
          </li>
          <li>
            <strong>Objection and withdrawal of consent:</strong> switch off any sharing individually.
          </li>
          <li>You also have the right to complain to the Information Commissioner&apos;s Office (ico.org.uk).</li>
        </ul>
      </section>
      <section>
        <h2>AI processing</h2>
        <p>When a live AI model powers your companion, your messages to it and your approved memories are sent to our AI provider to generate replies. They are not used to train models on our behalf. Matching does not use the AI provider at all.</p>
      </section>
    </ProsePage>
  );
}
