import type { Metadata } from "next";
import { FaqList } from "@/components/faq";
import { LinkButton } from "@/components/ui";
import { APP } from "@/lib/config";

export const metadata: Metadata = { title: "Help & contact" };

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <h1 className="text-4xl text-charcoal sm:text-5xl">Help &amp; contact</h1>
      <p className="mt-4 text-lg text-ink-700">Answers to the questions we hear most. Members can also message our team from inside BELONG.</p>
      <div className="mt-8">
        <FaqList />
      </div>
      <div className="mt-8 rounded-2xl bg-cream/60 p-6">
        <h2 className="text-xl text-charcoal">Still need a hand?</h2>
        <p className="mt-1 text-sm text-ink-500">
          Email us at <span className="font-medium text-ink-700">{APP.supportEmail}</span>, or sign in and use Help → Contact support.
        </p>
        <LinkButton href="/login" variant="outline" size="sm" className="mt-4">
          Sign in
        </LinkButton>
      </div>
    </div>
  );
}
