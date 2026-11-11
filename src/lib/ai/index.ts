import { env } from "../config";
import { mockProvider } from "./mock";
import type { AIProvider } from "./types";

export type { AIProvider, CompanionContext, CompanionReply, ConnectionIdeas } from "./types";

let override: AIProvider | undefined;

/** Test hook. */
export function setAIProvider(p: AIProvider | undefined) {
  override = p;
}

/** Returns the configured AI provider: Claude when a key is present, otherwise the local simulation. */
export async function getAIProvider(): Promise<AIProvider> {
  if (override) return override;
  if (env.aiProvider() === "claude") {
    const { claudeProvider } = await import("./claude");
    return claudeProvider;
  }
  return mockProvider;
}
