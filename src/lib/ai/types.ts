import type { MemoryCategory } from "../config";

/** Everything the companion model is given. All of it belongs to ONE member. */
export interface CompanionContext {
  companionName: string;
  tone: string;
  proactivity: string;
  memberName: string;
  interests: string[];
  memories: { category: string; content: string }[];
  intentions: string[];
  history: { role: "member" | "companion"; content: string }[];
  message: string;
  /** Counts only — never who. */
  waitingSuggestions: number;
  waitingIntroductions: number;
  canProposeMemories: boolean;
}

export interface ProposedMemory {
  category: MemoryCategory;
  content: string;
}

export interface ProposedIntention {
  title: string;
  mode: "moment" | "intention" | "collaboration";
  days: number;
}

export interface CompanionReply {
  text: string;
  memories: ProposedMemory[];
  intention: ProposedIntention | null;
  suggestions: string[];
}

export interface ConnectionIdeasInput {
  theirFirstName: string;
  sharedTopics: string[];
  reasons: string[];
}

export interface ConnectionIdeas {
  starters: string[];
  activities: string[];
}

/**
 * The AI boundary. The mock provider implements this locally; the Claude
 * provider implements it with the Anthropic API. The matching engine does NOT
 * depend on this interface — matching works with no AI available at all.
 */
export interface AIProvider {
  readonly name: "mock" | "claude";
  /** True when output is simulated and must be labelled as such in the UI. */
  readonly simulated: boolean;
  companionReply(ctx: CompanionContext): Promise<CompanionReply>;
  connectionIdeas(input: ConnectionIdeasInput): Promise<ConnectionIdeas>;
}
