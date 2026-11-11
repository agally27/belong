import type { Db } from "../db/types";
import { CONSENTS, type ConsentKey, type MemoryCategory } from "../config";
import { hashPassword } from "../services/auth";
import { requestIntroduction, respondToIntroduction } from "../services/introductions";
import { createIntention, createMemory } from "../services/memory";
import { runNetwork } from "../services/network";
import { syncSignals } from "../services/signals";

/**
 * Demonstration data. Every person here is FICTIONAL and flagged is_demo = 1,
 * which the interface labels clearly. Demo accounts share a published
 * password and must never exist in production: set BELONG_DEMO_MODE=false.
 */
export const DEMO_PASSWORD = "belong-demo";
export const DEMO_MEMBER_EMAIL = "alex@belong.example";
export const DEMO_ADMIN_EMAIL = "admin@belong.example";
export const DEMO_ADMIN_PASSWORD = "belong-admin";

type Mem = [MemoryCategory, string, boolean?];
type Intent = [string, "moment" | "intention" | "collaboration", number];

interface DemoMember {
  key: string;
  name: string;
  pronouns: string;
  age: string;
  area: string;
  bio: string;
  hue: number;
  interests: string[];
  values: string[];
  personality: { group: string; energy: string; pace: string };
  lookingFor: string[];
  companion: [string, string, string];
  memories: Mem[];
  intentions: Intent[];
  plan?: "plus" | "premium";
  joinedDaysAgo: number;
}

const MEMBERS: DemoMember[] = [
  {
    key: "alex", name: "Alex Morgan", pronouns: "they/them", age: "25–34", area: "Southville, Bristol", hue: 262,
    bio: "Recently swapped Leeds for Bristol. Happiest halfway up a hill with a camera, or losing badly at a board game.",
    interests: ["hiking", "photography", "board-games", "coffee"], values: ["kindness", "curiosity", "showing up"],
    personality: { group: "small", energy: "balanced", pace: "planned" }, lookingFor: ["friendship", "activity_partners"],
    companion: ["Sol", "warm", "lavender"],
    memories: [["interests", "Enjoys hiking and photography", true], ["goals", "Would like to learn or try guitar", true], ["experiences", "Recently moved to Bristol from Leeds for a new job", false], ["values", "Being reliable matters a lot to me", false], ["preferences", "I prefer small groups to big nights out", false]],
    intentions: [["Hiking company this weekend", "moment", 4]], joinedDaysAgo: 9,
  },
  {
    key: "priya", name: "Priya Nair", pronouns: "she/her", age: "25–34", area: "Bedminster, Bristol", hue: 150,
    bio: "Nurse, early riser, collector of flasks. I like long walks that end near cake.",
    interests: ["hiking", "wild-swimming", "cooking", "reading"], values: ["care", "honesty"],
    personality: { group: "small", energy: "quiet", pace: "planned" }, lookingFor: ["friendship", "activity_partners"],
    companion: ["Juniper", "thoughtful", "sage"],
    memories: [["interests", "Enjoys hiking and wild swimming", true], ["skills", "Can share: cooking", true], ["life", "Shift work makes weekday evenings tricky", false]],
    intentions: [["Looking for people to share hiking with", "intention", 14]], joinedDaysAgo: 13,
  },
  {
    key: "tom", name: "Tom Okafor", pronouns: "he/him", age: "35–44", area: "Clifton, Bristol", hue: 28,
    bio: "Guitar teacher by day, enthusiastic but mediocre Catan player by night.",
    interests: ["guitar", "live-music", "board-games", "coffee"], values: ["patience", "humour"],
    personality: { group: "small", energy: "lively", pace: "steady" }, lookingFor: ["friendship", "community"],
    companion: ["Riff", "playful", "peach"],
    memories: [["skills", "Can share: guitar", true], ["interests", "Enjoys board games and live music", true]],
    intentions: [["Board games company this week", "moment", 5]], plan: "plus", joinedDaysAgo: 12,
  },
  {
    key: "mei", name: "Mei Lin Chen", pronouns: "she/her", age: "35–44", area: "Bath", hue: 330,
    bio: "Illustrator and film-camera devotee. Always looking for a reason to visit a gallery.",
    interests: ["photography", "painting", "museums", "travel"], values: ["craft", "generosity"],
    personality: { group: "one_to_one", energy: "quiet", pace: "planned" }, lookingFor: ["collaboration", "conversation"],
    companion: ["Ink", "thoughtful", "sky"],
    memories: [["skills", "Can share: photography", true], ["interests", "Enjoys painting & drawing and museums & galleries", true]],
    intentions: [["Open to collaborating on painting & drawing and writing", "collaboration", 21]], plan: "premium", joinedDaysAgo: 11,
  },
  {
    key: "daniel", name: "Daniel Reyes", pronouns: "he/him", age: "25–34", area: "Easton, Bristol", hue: 205,
    bio: "Software developer who runs to offset the snacks. Will talk about podcasts for too long.",
    interests: ["running", "cycling", "coding", "podcasts"], values: ["growth", "directness"],
    personality: { group: "small", energy: "lively", pace: "spontaneous" }, lookingFor: ["activity_partners", "collaboration"],
    companion: ["Pace", "direct", "sky"],
    memories: [["interests", "Enjoys running and cycling", true], ["skills", "Can share: coding", true]],
    intentions: [["Running company this weekend", "moment", 4]], joinedDaysAgo: 10,
  },
  {
    key: "aisha", name: "Aisha Rahman", pronouns: "she/her", age: "25–34", area: "Redland, Bristol", hue: 290,
    bio: "Writing a novel very slowly. Theatre usher, poetry night regular, tea snob.",
    interests: ["writing", "poetry", "reading", "theatre"], values: ["imagination", "empathy"],
    personality: { group: "small", energy: "quiet", pace: "steady" }, lookingFor: ["collaboration", "friendship"],
    companion: ["Quill", "warm", "lavender"],
    memories: [["interests", "Enjoys writing and poetry", true], ["goals", "Would like to learn or try painting & drawing", true]],
    intentions: [["Open to collaborating on writing", "collaboration", 21]], joinedDaysAgo: 8,
  },
  {
    key: "george", name: "George Whitfield", pronouns: "he/him", age: "65+", area: "Bath", hue: 95,
    bio: "Retired engineer. Allotment, binoculars, and a shed full of half-finished chairs.",
    interests: ["gardening", "birdwatching", "woodworking", "history"], values: ["patience", "usefulness"],
    personality: { group: "small", energy: "quiet", pace: "steady" }, lookingFor: ["community", "conversation"],
    companion: ["Wren", "thoughtful", "sage"],
    memories: [["skills", "Can share: woodworking", true], ["experiences", "Retired after forty years in engineering", false], ["interests", "Enjoys gardening and birdwatching", true]],
    intentions: [], joinedDaysAgo: 7,
  },
  {
    key: "sofia", name: "Sofia Marino", pronouns: "she/her", age: "35–44", area: "Montpelier, Bristol", hue: 12,
    bio: "Cook, market wanderer, feeder of friends. Trying to keep my Spanish alive.",
    interests: ["cooking", "baking", "food-markets", "languages"], values: ["hospitality", "joy"],
    personality: { group: "large", energy: "lively", pace: "spontaneous" }, lookingFor: ["friendship", "community"],
    companion: ["Basil", "playful", "peach"],
    memories: [["skills", "Can share: cooking and baking", true], ["interests", "Enjoys food markets", true]],
    intentions: [["Looking for people to share food markets with", "intention", 10]], joinedDaysAgo: 6,
  },
  {
    key: "kwame", name: "Kwame Mensah", pronouns: "he/him", age: "25–34", area: "St Pauls, Bristol", hue: 45,
    bio: "Five-a-side on Tuesdays, dancing on Fridays, community kitchen on Sundays.",
    interests: ["football", "dance", "live-music", "volunteering"], values: ["community", "energy"],
    personality: { group: "large", energy: "lively", pace: "spontaneous" }, lookingFor: ["community", "activity_partners"],
    companion: ["Tempo", "playful", "peach"],
    memories: [["interests", "Enjoys football and dancing", true]],
    intentions: [["Live music company this weekend", "moment", 4]], joinedDaysAgo: 5,
  },
  {
    key: "hannah", name: "Hannah Fischer", pronouns: "she/her", age: "35–44", area: "Bishopston, Bristol", hue: 178,
    bio: "New mum finding my feet. Yoga when I can, pottery when I'm lucky.",
    interests: ["yoga", "mindfulness", "pottery", "crafts"], values: ["gentleness", "balance"],
    personality: { group: "one_to_one", energy: "quiet", pace: "planned" }, lookingFor: ["friendship", "conversation"],
    companion: ["Fern", "warm", "sage"],
    memories: [["experiences", "Became a parent last year and it changed my routines — parenting", true], ["interests", "Enjoys yoga and pottery", true]],
    intentions: [], joinedDaysAgo: 4,
  },
  {
    key: "ravi", name: "Ravi Patel", pronouns: "he/him", age: "45–54", area: "Horfield, Bristol", hue: 235,
    bio: "Physics teacher. Chess, telescopes and a competitive streak I'm working on.",
    interests: ["chess", "board-games", "science", "astronomy"], values: ["curiosity", "fairness"],
    personality: { group: "small", energy: "balanced", pace: "planned" }, lookingFor: ["friendship", "conversation"],
    companion: ["Orbit", "direct", "sky"],
    memories: [["goals", "Would like to learn or try photography", true], ["interests", "Enjoys chess and stargazing", true]],
    intentions: [], joinedDaysAgo: 3,
  },
  {
    key: "eleanor", name: "Eleanor Brooks", pronouns: "she/her", age: "55–64", area: "Southville, Bristol", hue: 350,
    bio: "Moved here to be nearer my daughter. Bookshops, flat whites and a very opinionated terrier.",
    interests: ["reading", "coffee", "museums", "dogs"], values: ["warmth", "loyalty"],
    personality: { group: "small", energy: "balanced", pace: "steady" }, lookingFor: ["friendship", "community"],
    companion: ["Hazel", "warm", "lavender"],
    memories: [["experiences", "Just moved to the city and I'm new in town", true], ["interests", "Enjoys reading and coffee", true]],
    intentions: [["Looking for people to share reading with", "intention", 14]], joinedDaysAgo: 8,
  },
  {
    key: "jamal", name: "Jamal Carter", pronouns: "he/him", age: "25–34", area: "Totterdown, Bristol", hue: 130,
    bio: "Climbing wall regular, fair-weather camper, co-op gamer.",
    interests: ["climbing", "hiking", "camping", "video-games"], values: ["adventure", "loyalty"],
    personality: { group: "small", energy: "balanced", pace: "spontaneous" }, lookingFor: ["activity_partners", "friendship"],
    companion: ["Ridge", "direct", "sage"],
    memories: [["interests", "Enjoys climbing and hiking", true]],
    intentions: [["Climbing company this weekend", "moment", 4]], joinedDaysAgo: 2,
  },
];

const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
const ahead = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const id = () => crypto.randomUUID();

export async function seedIfEmpty(db: Db): Promise<boolean> {
  const row = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  if (Number(row?.n) > 0) return false;
  await seedDemo(db);
  return true;
}

export async function seedDemo(db: Db) {
  const demoHash = await hashPassword(DEMO_PASSWORD);
  const ids: Record<string, string> = {};
  const shareAll: ConsentKey[] = ["matching_enabled", "share_interests", "share_experiences", "share_skills_goals", "share_intentions", "share_personality", "share_area", "companion_memory"];

  // Administrator (not a member of the network).
  const adminId = id();
  await db.run("INSERT INTO users (id, email, password_hash, role, status, is_demo, onboarded_at, last_active_at, created_at) VALUES (?, ?, ?, 'admin', 'active', 1, NULL, ?, ?)", [
    adminId, DEMO_ADMIN_EMAIL, await hashPassword(DEMO_ADMIN_PASSWORD), ago(0, 2), ago(14),
  ]);
  await db.run("INSERT INTO profiles (user_id, display_name, hue, updated_at) VALUES (?, 'BELONG Admin', 220, ?)", [adminId, ago(14)]);
  await db.run("INSERT INTO companions (user_id, name, created_at, updated_at) VALUES (?, 'Sol', ?, ?)", [adminId, ago(14), ago(14)]);
  await db.run("INSERT INTO subscriptions (user_id, plan_id, status, provider, started_at, updated_at) VALUES (?, 'free', 'active', 'none', ?, ?)", [adminId, ago(14), ago(14)]);

  for (const m of MEMBERS) {
    const uidv = id();
    ids[m.key] = uidv;
    const joined = ago(m.joinedDaysAgo, 3);
    await db.run("INSERT INTO users (id, email, password_hash, role, status, is_demo, onboarded_at, last_active_at, created_at) VALUES (?, ?, ?, 'member', 'active', 1, ?, ?, ?)", [
      uidv, `${m.key}@belong.example`, demoHash, joined, ago(0, m.joinedDaysAgo % 7), joined,
    ]);
    await db.run(
      'INSERT INTO profiles (user_id, display_name, pronouns, age_range, bio, area, region, hue, interests, "values", personality, looking_for, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uidv, m.name, m.pronouns, m.age, m.bio, m.area, "South West England", m.hue, JSON.stringify(m.interests), JSON.stringify(m.values), JSON.stringify(m.personality), JSON.stringify(m.lookingFor), joined],
    );
    await db.run("INSERT INTO companions (user_id, name, tone, style, proactivity, created_at, updated_at) VALUES (?, ?, ?, ?, 'balanced', ?, ?)", [uidv, m.companion[0], m.companion[1], m.companion[2], joined, joined]);
    for (const c of CONSENTS) {
      await db.run("INSERT INTO consents (user_id, key, granted, updated_at) VALUES (?, ?, ?, ?)", [uidv, c.key, shareAll.includes(c.key) ? 1 : 0, joined]);
    }
    const plan = m.plan ?? "free";
    await db.run("INSERT INTO subscriptions (user_id, plan_id, status, provider, started_at, renews_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)", [
      uidv, plan, plan === "free" ? "none" : "mock", joined, plan === "free" ? null : ahead(20), joined,
    ]);
    for (const [category, content, share] of m.memories) {
      await createMemory(uidv, { category, content, shareForMatching: Boolean(share) }, { source: "onboarding", status: "active" });
    }
    for (const [title, mode, days] of m.intentions) {
      await createIntention(uidv, { title, mode, days, shared: true });
    }
    await syncSignals(uidv);
  }

  // The agent network compares signals and records opportunities.
  await runNetwork({ quiet: true });

  const matchBetween = async (a: string, b: string) => {
    const [x, y] = ids[a] < ids[b] ? [ids[a], ids[b]] : [ids[b], ids[a]];
    return (await db.get<{ id: string }>("SELECT id FROM matches WHERE user_a = ? AND user_b = ?", [x, y]))?.id;
  };
  const connect = async (a: string, b: string, daysAgo: number, messages: [string, string][]) => {
    const matchId = await matchBetween(a, b);
    if (!matchId) return;
    const introId = await requestIntroduction(ids[a], matchId);
    const res = await respondToIntroduction(ids[b], introId, "approved");
    if (!res.conversationId) return;
    await db.run("UPDATE connections SET created_at = ? WHERE id = ?", [ago(daysAgo), res.connectionId!]);
    await db.run("UPDATE introductions SET created_at = ?, decided_at = ? WHERE id = ?", [ago(daysAgo + 1), ago(daysAgo), introId]);
    let h = daysAgo * 24 - 1;
    for (const [who, text] of messages) {
      await db.run("INSERT INTO messages (id, conversation_id, sender_id, content, simulated, created_at) VALUES (?, ?, ?, ?, 0, ?)", [id(), res.conversationId, ids[who], text, ago(0, Math.max(1, h))]);
      h -= 5;
    }
    await db.run("INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES (?, ?, ?)", [res.conversationId, ids[b], ago(0, 30)]);
  };

  await connect("eleanor", "alex", 5, [
    ["eleanor", "Hello Alex! Fellow Southville newcomer here. Have you found a good coffee spot yet?"],
    ["alex", "Hi Eleanor! Still hunting, honestly. Any recommendations?"],
    ["eleanor", "There's a lovely little place on North Street. Biscuit (my terrier) approves of their outdoor tables."],
    ["alex", "Sold. Saturday morning?"],
    ["eleanor", "Perfect — 10 o'clock? I'll bring Biscuit so you can't miss us."],
  ]);
  await connect("priya", "jamal", 6, [["priya", "Leigh Woods on Sunday?"], ["jamal", "I'm in. I'll bring the good snacks."]]);
  await connect("tom", "ravi", 4, [["ravi", "Chess or Catan first?"], ["tom", "Catan. I need to lose at something new."]]);
  await connect("mei", "aisha", 3, [["aisha", "I'd love to see your illustrations — I have a story that needs pictures."], ["mei", "Send it over! That sounds like exactly my kind of project."]]);

  // Tom asks to be introduced to Alex — waiting for Alex's answer.
  const tomAlex = await matchBetween("tom", "alex");
  if (tomAlex) {
    const introId = await requestIntroduction(ids.tom, tomAlex, "Your companion mentioned you'd like to learn guitar — I teach, and I'm always after board game people too.");
    await db.run("UPDATE introductions SET created_at = ? WHERE id = ?", [ago(0, 6), introId]);
  }

  // Circles (4–8 people).
  const circle = async (name: string, description: string, topic: string, area: string, capacity: number, host: string, members: string[], daysAgo: number, chat: [string, string][]) => {
    const cid = id();
    await db.run("INSERT INTO circles (id, name, description, topic, area, capacity, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)", [cid, name, description, topic, area, capacity, ids[host], ago(daysAgo)]);
    await db.run("INSERT INTO circle_members (circle_id, user_id, role, joined_at) VALUES (?, ?, 'host', ?)", [cid, ids[host], ago(daysAgo)]);
    for (const [i, m] of members.entries()) {
      await db.run("INSERT INTO circle_members (circle_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", [cid, ids[m], ago(daysAgo - 1, i)]);
    }
    const conv = id();
    await db.run("INSERT INTO conversations (id, kind, circle_id, created_at) VALUES (?, 'circle', ?, ?)", [conv, cid, ago(daysAgo)]);
    let h = 40;
    for (const [who, text] of chat) {
      await db.run("INSERT INTO messages (id, conversation_id, sender_id, content, simulated, created_at) VALUES (?, ?, ?, ?, 0, ?)", [id(), conv, ids[who], text, ago(0, h)]);
      h -= 6;
    }
    return cid;
  };
  const walkers = await circle("Sunday Walkers", "Unhurried walks around Bristol and beyond, always ending somewhere with tea. All paces welcome.", "hiking", "South Bristol", 6, "priya", ["jamal", "alex", "daniel"], 6, [
    ["priya", "Morning all! Leigh Woods this Sunday — meeting by the main car park at 9:30."],
    ["jamal", "I'll be there. Forecast looks kind for once."],
    ["daniel", "Count me in, though I may be jogging to keep warm."],
  ]);
  await circle("Tuesday Tabletop", "A friendly weekly board game night. We teach the rules, nobody minds if you lose.", "board-games", "Central Bristol", 8, "tom", ["ravi", "kwame", "eleanor"], 5, [
    ["tom", "New game this week: Wingspan. Ravi has promised not to read the rulebook in advance."],
    ["ravi", "I promised no such thing."],
  ]);
  await circle("Kitchen Table Supper Club", "We take turns cooking something we love. Small, warm, and very well fed.", "cooking", "North Bristol", 6, "sofia", ["priya", "hannah", "george"], 4, [["sofia", "Next up: handmade pasta at mine. Bring an apron!"]]);
  await circle("Words & Pictures", "Writers and illustrators sharing work in progress over coffee.", "writing", "Bristol & Bath", 6, "aisha", ["mei", "eleanor"], 3, [["aisha", "Bring a page or a sketch on Thursday — no pressure for it to be finished."]]);
  await circle("Slow Mornings", "Gentle yoga and a quiet coffee afterwards. Babies and beginners very welcome.", "yoga", "North Bristol", 5, "hannah", ["priya"], 2, []);

  // Events — general areas only.
  const event = async (title: string, description: string, topic: string, area: string, format: string, days: number, hour: number, capacity: number, host: string, circleId: string | null, going: string[]) => {
    const eid = id();
    await db.run("INSERT INTO events (id, title, description, topic, area, format, starts_at, capacity, host_id, circle_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [eid, title, description, topic, area, format, ahead(days, hour), capacity, ids[host], circleId, ago(2)]);
    for (const g of [host, ...going]) {
      await db.run("INSERT INTO event_rsvps (event_id, user_id, status, created_at) VALUES (?, ?, 'going', ?)", [eid, ids[g], ago(1)]);
    }
  };
  await event("Leigh Woods morning walk", "About 6km at an easy pace, with a café stop at the end. Sturdy shoes recommended.", "hiking", "Leigh Woods, Bristol", "in_person", 3, 9, 6, "priya", walkers, ["jamal", "daniel"]);
  await event("Board game café evening", "Drop in from 7pm. We'll have a few easy-to-learn games on the table.", "board-games", "Central Bristol", "in_person", 5, 19, 8, "tom", null, ["ravi", "kwame"]);
  await event("Harbourside food market wander", "A slow lap of the stalls, then lunch by the water.", "food-markets", "Harbourside, Bristol", "in_person", 6, 11, 8, "sofia", null, ["priya"]);
  await event("Beginners' sketching afternoon", "Bring a pencil and a sketchbook. Mei will share a few simple exercises.", "painting", "Bath", "in_person", 9, 14, 6, "mei", null, ["aisha"]);
  await event("Stargazing on the Downs", "Weather permitting. Ravi is bringing a telescope and a flask.", "astronomy", "The Downs, Bristol", "in_person", 12, 20, 10, "ravi", null, []);
  await event("Online: first-chapter swap", "Share the first page of something you're writing and hear kind, useful feedback.", "writing", "Online", "online", 7, 19, 8, "aisha", null, ["mei"]);

  // Alex's companion conversation so far.
  const alex = ids.alex;
  const say = async (role: string, content: string, hoursAgo: number, meta: Record<string, unknown> = {}) =>
    db.run("INSERT INTO companion_messages (id, user_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)", [id(), alex, role, content, JSON.stringify({ simulated: role === "companion", ...meta }), ago(0, hoursAgo)]);
  await say("companion", "Hello Alex, I'm Sol — your companion here on BELONG. I'm an AI, and my whole purpose is to help you find real people you'll genuinely get along with. What have you been enjoying lately?", 200);
  await say("member", "I love hiking and photography. I moved to Bristol recently so I'm still finding my feet.", 199);
  await say("companion", "That's lovely to hear. Hiking and photography pair beautifully — and moving cities takes courage. Do you prefer going with company, or is it your thinking time?", 199);
  await say("member", "Company, definitely. I'd love to find someone to go hiking with this weekend.", 30);
  await say("companion", "I really like that. It sounds like you'd welcome some company for that. I've shared it as a temporary signal — it expires on its own in a few days. I'll let you know what I notice.", 30, {
    suggestions: ["Who might I get along with?", "What do you share about me?"],
  });

  // Notifications for Alex.
  const note = async (type: string, title: string, body: string, href: string, hoursAgo: number, read = false) =>
    db.run("INSERT INTO notifications (id, user_id, type, title, body, href, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id(), alex, type, title, body, href, read ? ago(0, hoursAgo - 1) : null, ago(0, hoursAgo)]);
  await db.run("DELETE FROM notifications WHERE user_id = ?", [alex]);
  await note("connection", "You're connected", "You and Eleanor both said yes. You can message each other now.", "/messages", 120, true);
  await note("circle", "Welcome to Sunday Walkers", "Say hello — the next walk is already planned.", "/circles", 96, true);
  await note("match", "Your companion noticed someone", "A possible connection around hiking. Take a look when you have a moment.", "/discover", 20);
  await note("introduction", "Someone would like to be introduced", "Their companion and yours think you'd get along. See why, and decide in your own time.", "/introductions", 6);

  // Moderation examples.
  await db.run("INSERT INTO reports (id, reporter_id, reported_user_id, context_type, reason, detail, status, created_at) VALUES (?, ?, ?, 'message', 'spam', 'Kept inviting me to a paid course after I said no thanks. (Fictional demo report.)', 'open', ?)", [id(), ids.hannah, ids.kwame, ago(0, 9)]);
  await db.run("INSERT INTO reports (id, reporter_id, reported_user_id, context_type, reason, detail, status, resolution, resolved_by, created_at, resolved_at) VALUES (?, ?, ?, 'profile', 'other', 'Bio mentioned a business. (Fictional demo report.)', 'dismissed', 'No action needed — bio is within guidelines', ?, ?, ?)", [id(), ids.george, ids.daniel, adminId, ago(4), ago(3)]);
  await db.run("INSERT INTO support_tickets (id, user_id, subject, body, status, created_at) VALUES (?, ?, 'Can I change my companion''s name?', 'I picked a name in a hurry and would like something different. (Fictional demo ticket.)', 'open', ?)", [id(), ids.ravi, ago(1)]);

  // A little history for the analytics charts.
  for (let d = 13; d >= 0; d--) {
    for (let i = 0; i < ((d * 7) % 5) + 1; i++) {
      await db.run("INSERT INTO analytics_events (id, user_id, name, props, created_at) VALUES (?, NULL, 'companion_message', '{}', ?)", [id(), ago(d, i)]);
    }
  }
  await db.run("INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta, created_at) VALUES (?, NULL, 'demo.seeded', 'system', 'demo', '{}', ?)", [id(), new Date().toISOString()]);
}
