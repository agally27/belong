import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MEMORY_CATEGORIES } from "../config";
import { TOPIC_LIST } from "../matching/topics";
import { mockProvider } from "./mock";
import type { AIProvider, CompanionContext, CompanionReply, ConnectionIdeas, ConnectionIdeasInput } from "./types";

/**
 * Claude-backed companion. Activated when ANTHROPIC_API_KEY is set (see
 * INTEGRATION_CHECKLIST.md). Untested against the live API in development —
 * the owner should verify with a real key. Any failure falls back to the local
 * provider so the member is never left without a reply.
 */

const replySchema = z.object({
  text: z.string(),
  memories: z.array(
    z.object({
      category: z.enum(MEMORY_CATEGORIES.map((c) => c.id) as [string, ...string[]]),
      content: z.string(),
    }),
  ),
  intention: z
    .object({
      title: z.string(),
      mode: z.enum(["moment", "intention", "collaboration"]),
      days: z.number(),
    })
    .nullable(),
  suggestions: z.array(z.string()),
});

const ideasSchema = z.object({ starters: z.array(z.string()), activities: z.array(z.string()) });

// Stable across requests so it can be prompt-cached.
const SYSTEM = `You are a personal AI companion inside BELONG, a platform whose purpose is to help people form real human friendships. "AI should bring people closer together, not replace human relationships."

How to behave:
- Be warm, curious and concise (2-4 sentences). Ask at most one question per reply. British English.
- You are an AI and say so if asked. Never role-play as a human friend or partner, and gently steer the member toward real people rather than toward relying on you.
- You only know what is in this conversation and the approved memories provided. You know nothing about other members and must never invent details about them.
- If the member mentions self-harm or crisis, respond with care and signpost Samaritans (116 123, UK) and emergency services (999). Propose no memories or intentions in that reply.

Structured output:
- "memories": 0-2 short third-person notes worth remembering IF the member said something durable about themselves this turn (e.g. "Enjoys wild swimming"). These are proposals; the member approves each one. Categories: ${MEMORY_CATEGORIES.map((c) => `${c.id} (${c.hint})`).join("; ")}. Never propose health, sexuality, religion, politics, finances or third parties' details.
- "intention": set ONLY when the member expresses a current wish for company or collaboration. The title is shared with the matching network if approved, so write it as a short neutral phrase using a topic from this list, with no personal details: ${TOPIC_LIST.map((t) => t.label).join(", ")}. "moment" = next few days (days 2-5), "intention" = ongoing (7-21), "collaboration" = making something together (14-30). Otherwise null.
- "suggestions": 2-3 short things the member might say next.`;

function client() {
  return new Anthropic(); // reads ANTHROPIC_API_KEY
}

function model() {
  return process.env.BELONG_CLAUDE_MODEL ?? "claude-opus-5-5";
}

export const claudeProvider: AIProvider = {
  name: "claude",
  simulated: false,

  async companionReply(ctx: CompanionContext): Promise<CompanionReply> {
    try {
      const profile = [
        `Companion name: ${ctx.companionName}. Tone: ${ctx.tone}. Proactivity: ${ctx.proactivity}.`,
        `Member's first name: ${ctx.memberName.split(" ")[0]}.`,
        ctx.interests.length ? `Profile interests: ${ctx.interests.join(", ")}.` : "",
        ctx.memories.length ? `Approved memories:\n${ctx.memories.map((m) => `- [${m.category}] ${m.content}`).join("\n")}` : "No approved memories yet.",
        ctx.intentions.length ? `Active intentions: ${ctx.intentions.join("; ")}.` : "",
        `Waiting in the app: ${ctx.waitingSuggestions} suggested connections, ${ctx.waitingIntroductions} introductions awaiting the member's answer.`,
        ctx.canProposeMemories ? "" : "The member has turned memory suggestions off: return an empty memories array.",
      ]
        .filter(Boolean)
        .join("\n");
      const history: Anthropic.Beta.BetaMessageParam[] = ctx.history.slice(-20).map((m) => ({
        role: m.role === "member" ? "user" : "assistant",
        content: m.content,
      }));
      while (history.length && history[0].role !== "user") history.shift();
      const response = await client().beta.messages.parse({
        model: model(),
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(replySchema) },
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: profile },
        ],
        messages: [...history, { role: "user", content: ctx.message }],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        return mockProvider.companionReply(ctx);
      }
      const out = response.parsed_output;
      return {
        text: out.text,
        memories: ctx.canProposeMemories ? (out.memories.slice(0, 2) as CompanionReply["memories"]) : [],
        intention: out.intention
          ? { ...out.intention, days: Math.min(30, Math.max(1, Math.round(out.intention.days))) }
          : null,
        suggestions: out.suggestions.slice(0, 3),
      };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        console.warn("[belong:ai] Claude rate limited; using local companion for this reply");
      } else if (error instanceof Anthropic.APIError) {
        console.error(`[belong:ai] Claude API error ${error.status}: ${error.message}`);
      } else {
        console.error("[belong:ai] Claude call failed", error);
      }
      return mockProvider.companionReply(ctx);
    }
  },

  async connectionIdeas(input: ConnectionIdeasInput): Promise<ConnectionIdeas> {
    try {
      const response = await client().beta.messages.parse({
        model: model(),
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(ideasSchema) },
        system:
          "You help two people who have just been introduced on BELONG, a friendship platform, get a conversation going. Suggest 3-4 friendly conversation starters and 3-4 low-pressure activities in public places, based only on the shared topics given. British English. No assumptions about either person beyond the topics.",
        messages: [
          {
            role: "user",
            content: `Shared topics: ${input.sharedTopics.join(", ") || "none recorded"}.\nWhy they were introduced: ${input.reasons.join("; ") || "general compatibility"}.`,
          },
        ],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) return mockProvider.connectionIdeas(input);
      return {
        starters: response.parsed_output.starters.slice(0, 4),
        activities: response.parsed_output.activities.slice(0, 4),
      };
    } catch (error) {
      console.error("[belong:ai] Claude connection ideas failed", error);
      return mockProvider.connectionIdeas(input);
    }
  },
};
