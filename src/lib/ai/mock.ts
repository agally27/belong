import { extractTopics, topicLabel, TOPICS } from "../matching/topics";
import type {
  AIProvider,
  CompanionContext,
  CompanionReply,
  ConnectionIdeas,
  ConnectionIdeasInput,
  ProposedIntention,
  ProposedMemory,
} from "./types";

/**
 * Simulated companion. A deterministic, rule-based stand-in so the whole
 * BELONG experience works with no API key. Its output is always labelled as
 * simulated in the interface.
 */

const pick = <T>(items: T[], seed: number): T => items[Math.abs(seed) % items.length];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const OPENERS: Record<string, string[]> = {
  warm: ["That's lovely to hear.", "I really like that.", "Thank you for telling me that."],
  thoughtful: ["That's interesting.", "I can see why that matters to you.", "That says a lot."],
  playful: ["Oh, I like this.", "Now we're talking.", "Good — tell me everything."],
  direct: ["Got it.", "Understood.", "Noted."],
};

const FOLLOW_UPS: Record<string, string[]> = {
  outdoors: ["What does a really good day outside look like for you?", "Do you prefer going with company, or is it your thinking time?"],
  movement: ["Is it more about the routine or the people for you?", "Would you enjoy doing that with someone at a similar pace?"],
  food: ["Do you like cooking for people, or eating out and exploring?", "What's the best thing you've made or eaten lately?"],
  arts: ["What have you seen or made recently that stayed with you?", "Do you like sharing it with others, or is it more of a private thing?"],
  music: ["Do you play with other people, or mostly on your own?", "What have you been listening to this week?"],
  words: ["What are you reading or writing at the moment?", "Would you enjoy talking it through with someone who gets it?"],
  making: ["What are you making at the moment?", "Did someone teach you, or did you find your own way in?"],
  play: ["Are you more competitive or more in it for the laughs?", "Do you have a regular group, or would you like one?"],
  mind: ["What's an idea you keep coming back to lately?", "Do you have people you can talk about that with?"],
  community: ["What drew you to that in the first place?", "Would you like company when you do it?"],
  work: ["What are you working on that you're excited about?", "Is there a kind of person who'd make that easier or more fun?"],
  life: ["How has that been for you, honestly?", "What would make this chapter feel a bit easier?"],
};

const GENERIC = [
  "What's something you've enjoyed recently, even something small?",
  "When do you feel most like yourself around other people?",
  "Is there something you'd love to do more of, if you had the right company?",
  "What kind of people do you find it easiest to be around?",
  "What would a really good weekend look like for you?",
];

const CRISIS = /(suicid|kill myself|end my life|self[- ]harm|hurt myself|don't want to be here|no reason to live)/i;
const LONELY = /(lonely|loneliness|isolated|no friends|no one to talk to|nobody to talk to|on my own a lot|feel alone)/i;

function detectIntention(text: string, topics: string[]): ProposedIntention | null {
  if (!topics.length) return null;
  const wants =
    /(i('d| would) (love|like) to|i want to|i wanna|looking for|hoping to|i wish i (had|could|knew)|find (someone|somebody|people|a group|a partner|others)|anyone (to|who)|someone to|people to|would be (nice|great|good) to|need a .*(partner|buddy|group)|keen to|fancy)/i.test(
      text,
    );
  const soon = /(today|tonight|tomorrow|this weekend|this week|next week|on (saturday|sunday)|at the weekend)/i.exec(text);
  if (!wants && !soon) return null;
  const main = topicLabel(topics[0]);
  if (/(collaborat|co-?founder|work on .*together|partner on|side project|start(ing)? (a|an|my) .*(project|business|band|zine|podcast))/i.test(text)) {
    return { title: `Open to collaborating on ${list(topics.slice(0, 2).map(topicLabel))}`, mode: "collaboration", days: 21 };
  }
  if (soon) {
    return { title: `${cap(main)} company ${soon[0].toLowerCase()}`, mode: "moment", days: 4 };
  }
  return { title: `Looking for people to share ${main} with`, mode: "intention", days: 14 };
}

function detectMemories(text: string, topics: string[], ctx: CompanionContext): ProposedMemory[] {
  const out: ProposedMemory[] = [];
  const labels = list(topics.slice(0, 3).map(topicLabel));
  const sentence = text.trim().replace(/\s+/g, " ").slice(0, 220);
  if (topics.length) {
    if (/(i (can |could )?teach|i('m| am) (quite |pretty |really )?good at|i('ve| have) (been )?(played|playing|done|doing) .*for (\d+|many|several|a few) years|happy to (show|teach|help))/i.test(text)) {
      out.push({ category: "skills", content: `Can share: ${labels}` });
    } else if (/(learn(ing)?|want to (try|get into|start|take up)|beginner|never (tried|done)|new to|getting into|teach me)/i.test(text)) {
      out.push({ category: "goals", content: `Would like to learn or try ${labels}` });
    } else if (/(love|enjoy|really like|i like|into|passion|favourite|obsessed|keen on|i do a lot of|every (week|weekend|morning)|i go )/i.test(text)) {
      out.push({ category: "interests", content: `Enjoys ${labels}` });
    }
  }
  if (/(just moved|recently moved|moved (to|here|from)|new (in|to) (town|the city|the area)|became a (parent|dad|mum|mother|father)|retired|changed career|career change|grew up in|lived (in|abroad)|went through|divorce|redundan)/i.test(text)) {
    out.push({ category: "experiences", content: sentence });
  }
  if (/(matters (a lot )?to me|i value|important to me|i believe in|i care (a lot )?about)/i.test(text)) {
    out.push({ category: "values", content: sentence });
  }
  if (/(i prefer|small groups?|one[- ]to[- ]one|big groups?|large groups?|introvert|extrovert|i'm shy|takes me a while to warm up|i find .* (hard|draining|tiring))/i.test(text)) {
    out.push({ category: "preferences", content: sentence });
  }
  const known = new Set(ctx.memories.map((m) => m.content.toLowerCase()));
  return out.filter((m) => !known.has(m.content.toLowerCase())).slice(0, 2);
}

export function mockCompanionReply(ctx: CompanionContext): CompanionReply {
  const text = ctx.message.trim();
  const seed = hash(text) + ctx.history.length;
  const tone = OPENERS[ctx.tone] ? ctx.tone : "warm";
  const name = ctx.memberName.split(" ")[0];

  if (CRISIS.test(text)) {
    return {
      text: `${name}, I'm really glad you told me, and I'm sorry things feel this heavy. I'm an AI companion, so I'm not the right support for this — but people are. In the UK you can call Samaritans free on 116 123 at any time, or text SHOUT to 85258. If you're in immediate danger, please call 999. Is there someone you trust who you could reach out to today?`,
      memories: [],
      intention: null,
      suggestions: [],
    };
  }

  if (/^(hi|hello|hey|hiya|good (morning|afternoon|evening))\b/i.test(text) && text.length < 30) {
    return {
      text: `Hello ${name}. It's good to see you. ${pick(GENERIC, seed)}`,
      memories: [],
      intention: null,
      suggestions: ["I've been getting into something new", "I'd like to meet people who…", "What do you remember about me?"],
    };
  }

  if (/(are you (a |an )?(real|human|person|ai|bot|robot)|who are you|what are you)/i.test(text)) {
    return {
      text: `I'm ${ctx.companionName}, your AI companion on BELONG — not a person, and I won't pretend to be. My job is to get to know what matters to you and help you find real people you'd genuinely get along with. The friendships themselves are all yours.`,
      memories: [],
      intention: null,
      suggestions: ["How do you find people for me?", "What do you remember about me?"],
    };
  }

  if (/(what (do|can) you (remember|know)|what have you (learned|remembered))/i.test(text)) {
    const approved = ctx.memories.slice(0, 5).map((m) => `• ${m.content}`);
    return {
      text: approved.length
        ? `Here's what you've approved me to remember:\n${approved.join("\n")}\n\nYou can edit or delete any of it in Memories, and choose what (if anything) is shared as a signal.`
        : `Nothing yet — I only remember what you approve. Tell me a little about what you enjoy and I'll suggest things worth keeping.`,
      memories: [],
      intention: null,
      suggestions: ["Something I love doing is…", "How is my information shared?"],
    };
  }

  if (/(how (do|does) (you|this|it|matching|belong) (find|work|match)|how is my (information|data) (shared|used)|what do you share|privacy)/i.test(text)) {
    return {
      text: `Here's how it works. I turn the things you approve into simple signals — like “hiking” or “looking for board game company this week”. Other members' companions do the same. The network compares signals only: it never sees our conversations or your memories. If there's a good fit, you'll both be asked, and nothing happens unless you both say yes. You can see every signal I share under Privacy.`,
      memories: [],
      intention: null,
      suggestions: ["Who might I get along with?", "I'd like to meet people who…"],
    };
  }

  if (/(who (should|could|might) i (meet|get along)|any (matches|suggestions|connections|introductions)|find (me )?(someone|people))/i.test(text) && !extractTopics(text).length) {
    const waiting = ctx.waitingSuggestions + ctx.waitingIntroductions;
    return {
      text: waiting
        ? `I've noticed ${ctx.waitingSuggestions} possible connection${ctx.waitingSuggestions === 1 ? "" : "s"} for you${ctx.waitingIntroductions ? `, and ${ctx.waitingIntroductions} introduction${ctx.waitingIntroductions === 1 ? " is" : "s are"} waiting for your answer` : ""}. Have a look in Discover — I've explained why I think each one could work.`
        : `Nothing new just yet. The more I understand what you're hoping for right now, the better I can look. What would you love company for at the moment?`,
      memories: [],
      intention: null,
      suggestions: ["I'd love company for…", "What do you share about me?"],
    };
  }

  const topics = extractTopics(text);
  const intention = detectIntention(text, topics);
  const memories = ctx.canProposeMemories ? detectMemories(text, topics, ctx) : [];
  const parts: string[] = [];

  if (LONELY.test(text)) {
    parts.push(
      `Thank you for trusting me with that, ${name}. Feeling that way is far more common than people admit, and it isn't a flaw in you.`,
      `I can be a good listener, but what I'd really like is to help you find a few people who feel easy to be around.`,
    );
  } else {
    parts.push(pick(OPENERS[tone], seed));
  }

  if (topics.length) {
    const main = TOPICS[topics[0]];
    const others = ctx.interests.filter((i) => !topics.includes(i)).slice(0, 1);
    if (!LONELY.test(text)) {
      parts.push(
        others.length && seed % 2 === 0
          ? `${cap(main.label)} fits with what I know about you — alongside ${topicLabel(others[0])}, it paints a picture.`
          : `${cap(main.label)} is a good thing to have in your life.`,
      );
    }
    if (intention) {
      parts.push(
        intention.mode === "collaboration"
          ? `It sounds like you're open to making something with someone. I can share that as a signal so companions of like-minded members can notice it.`
          : `It sounds like you'd welcome some company for that. I can share it as a temporary signal — it expires on its own, and you approve it first.`,
      );
    } else {
      parts.push(pick(FOLLOW_UPS[main.category] ?? GENERIC, seed));
    }
  } else if (!LONELY.test(text)) {
    parts.push(pick(GENERIC, seed));
  } else {
    parts.push(pick(GENERIC, seed + 2));
  }

  if (memories.length) {
    parts.push(`I've suggested ${memories.length === 1 ? "something" : "a couple of things"} to remember below — nothing is saved unless you approve it.`);
  }
  if (!intention && ctx.waitingIntroductions > 0 && ctx.proactivity !== "gentle" && seed % 3 === 0) {
    parts.push(`By the way, an introduction is waiting for your answer whenever you're ready.`);
  }

  const suggestions = intention
    ? ["Tell me more about how signals work", "What else should I share?"]
    : topics.length
      ? [`I'd love to find someone to share ${topicLabel(topics[0])} with`, "Who might I get along with?"]
      : ["Something I love doing is…", "I'd like to meet people who…", "This weekend I'm hoping to…"];

  return { text: parts.join(" "), memories, intention, suggestions };
}

const STARTERS: Record<string, string[]> = {
  outdoors: ["What's your favourite spot within an hour of here?", "Are you a sunrise-start person or a leisurely-flask person?"],
  movement: ["What got you started with it?", "What does a good week of it look like for you?"],
  food: ["What's the dish you're proudest of?", "Where would you take someone who'd never eaten round here?"],
  arts: ["What's something you've seen recently that stuck with you?", "What are you working on, or wishing you were?"],
  music: ["What's been on repeat for you lately?", "What was the first song you properly learned?"],
  words: ["What are you reading at the moment?", "Which book do you press on everyone?"],
  making: ["What are you making at the moment?", "What's the project you're secretly most proud of?"],
  play: ["What's your go-to game for a good evening?", "Are you a ruthless strategist or a chaos agent?"],
  mind: ["What's an idea you can't stop thinking about?", "What's the best thing you've learned this year?"],
  community: ["What got you involved in the first place?", "What's a small local thing you wish more people knew about?"],
  work: ["What are you building or dreaming of building?", "What would you work on if nobody was watching?"],
  life: ["How are you finding it so far?", "What's helped you feel at home?"],
};

const ACTIVITIES: Record<string, string[]> = {
  outdoors: ["A gentle Saturday-morning walk with a coffee stop", "Pick a local trail neither of you has tried"],
  movement: ["An easy session together, then breakfast", "Try a beginner-friendly class neither of you has done"],
  food: ["Meet at a weekend food market", "Cook the same recipe and compare notes"],
  arts: ["Visit an exhibition and trade favourites over tea", "An afternoon sketching or shooting somewhere scenic"],
  music: ["Catch a small local gig or open mic", "Swap three songs each and talk them through"],
  words: ["Browse an independent bookshop together", "Read the same short story and meet to discuss it"],
  making: ["Book a taster workshop together", "Bring your current projects to a café"],
  play: ["An evening at a board game café", "A low-stakes pub quiz as a team of two"],
  mind: ["A walk-and-talk on a big question", "Go to a public lecture or talk together"],
  community: ["Volunteer for a single morning together", "Visit a repair café or community garden day"],
  work: ["A co-working morning in a café", "Trade feedback on something each of you is making"],
  life: ["A relaxed coffee somewhere easy to reach", "A daytime walk in a busy local park"],
};

export function mockConnectionIdeas(input: ConnectionIdeasInput): ConnectionIdeas {
  const cats = [...new Set(input.sharedTopics.map((t) => TOPICS[t]?.category).filter(Boolean))] as string[];
  const starters: string[] = [];
  const activities: string[] = [];
  for (const topic of input.sharedTopics.slice(0, 2)) {
    if (TOPICS[topic]) starters.push(`How did you first get into ${topicLabel(topic)}?`);
  }
  for (const c of cats.slice(0, 3)) {
    starters.push(...(STARTERS[c] ?? []).slice(0, 1));
    activities.push(...(ACTIVITIES[c] ?? []));
  }
  if (!starters.length) starters.push("What made you say yes to this introduction?", "What does a good weekend look like for you?");
  if (!activities.length) activities.push(...ACTIVITIES.life);
  return { starters: [...new Set(starters)].slice(0, 4), activities: [...new Set(activities)].slice(0, 4) };
}

export const mockProvider: AIProvider = {
  name: "mock",
  simulated: true,
  async companionReply(ctx) {
    return mockCompanionReply(ctx);
  },
  async connectionIdeas(input) {
    return mockConnectionIdeas(input);
  },
};
