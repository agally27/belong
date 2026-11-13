import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { CompanionOrb, LinkButton, Notice, SimulatedBadge } from "@/components/ui";
import { MEMORY_CATEGORIES } from "@/lib/config";
import { aiStatus, ensureWelcome, getThread } from "@/lib/services/companion";
import { getConsents } from "@/lib/services/core";
import { getCompanion } from "@/lib/services/profile";
import { requireMember } from "@/lib/session";
import { CompanionChat, type ChatMessage } from "./chat";

export const metadata: Metadata = { title: "Companion" };

export default async function CompanionPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireMember();
  await ensureWelcome(user.id);
  const [companion, thread, ai, consents, { welcome }] = [await getCompanion(user.id), await getThread(user.id), await aiStatus(), await getConsents(user.id), await searchParams];
  const messages: ChatMessage[] = thread.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    suggestions: m.suggestions,
    memories: m.memories.map((mem) => {
      const cat = MEMORY_CATEGORIES.find((c) => c.id === mem.category);
      return { id: mem.id, category: mem.category, categoryLabel: cat?.label ?? mem.category, content: mem.content, shareable: Boolean(cat?.shareable) };
    }),
    intention: m.intention ? { id: m.intention.id, title: m.intention.title, mode: m.intention.mode } : null,
  }));
  return (
    <div>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CompanionOrb style={companion.style} size={44} animate />
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl text-charcoal">
              {companion.name} {ai.simulated && <SimulatedBadge label="Simulated companion" />}
            </h1>
            <p className="text-sm text-ink-500">
              Your AI companion · private to you ·{" "}
              <Link href="/memories" className="text-lavender-600 hover:underline">
                what {companion.name} remembers
              </Link>
            </p>
          </div>
        </div>
        <LinkButton href="/companion/settings" variant="outline" size="sm" aria-label="Companion settings">
          <Settings2 size={16} /> <span className="hidden sm:inline">Settings</span>
        </LinkButton>
      </header>
      {welcome && (
        <Notice tone="sage" className="mb-4">
          You&apos;re all set. Say hello to {companion.name} — try telling it about something you&apos;d love company for this week.
        </Notice>
      )}
      <CompanionChat messages={messages} companionName={companion.name} companionStyle={companion.style} canShareIntentions={consents.share_intentions && consents.matching_enabled} />
      <p className="mt-3 text-center text-xs text-ink-500">
        {companion.name} is an AI and can make mistakes. It isn&apos;t a crisis service — if you need support now, call Samaritans on 116 123.
      </p>
    </div>
  );
}
