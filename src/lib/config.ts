/** Central product configuration. Seeded into the database on first run;
 * plans, flags and matching weights are then editable in the admin console. */

export const APP = {
  name: "BELONG",
  tagline: "Your people are out there.",
  supportEmail: "hello@belong.example",
} as const;

export const env = {
  demoMode: () => process.env.BELONG_DEMO_MODE !== "false",
  isProd: () => process.env.NODE_ENV === "production",
  aiProvider: () => (process.env.ANTHROPIC_API_KEY && process.env.BELONG_AI_PROVIDER !== "mock" ? "claude" : "mock"),
  claudeModel: () => process.env.BELONG_CLAUDE_MODEL ?? "claude-opus-5-5",
  paymentsProvider: () => (process.env.STRIPE_SECRET_KEY ? "stripe" : "mock"),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export interface PlanLimits {
  /** Introductions a member may request per calendar month (-1 = unlimited). */
  introsPerMonth: number;
  /** Circles a member may belong to at once (-1 = unlimited). */
  circles: number;
  /** Temporary intentions that may be shared at once (-1 = unlimited). */
  activeIntentions: number;
  /** Connection Graph insights panel. */
  graphInsights: boolean;
  /** May host events. */
  hostEvents: boolean;
}

export interface PlanSeed {
  id: "free" | "plus" | "premium";
  name: string;
  tagline: string;
  pricePence: number;
  features: string[];
  limits: PlanLimits;
}

/** Indicative launch pricing. Edit here before first run, or in Admin → Subscriptions afterwards. */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Meet your companion and start finding your people.",
    pricePence: 0,
    features: [
      "Your personal AI companion",
      "Full memory and privacy controls",
      "3 introductions each month",
      "Join 1 BELONG Circle",
      "2 shared intentions at a time",
    ],
    limits: { introsPerMonth: 3, circles: 1, activeIntentions: 2, graphInsights: false, hostEvents: false },
  },
  {
    id: "plus",
    name: "BELONG Plus",
    tagline: "More room to explore and say yes.",
    pricePence: 799,
    features: [
      "Everything in Free",
      "15 introductions each month",
      "Join up to 4 Circles",
      "5 shared intentions at a time",
      "Host your own events",
    ],
    limits: { introsPerMonth: 15, circles: 4, activeIntentions: 5, graphInsights: false, hostEvents: true },
  },
  {
    id: "premium",
    name: "BELONG Premium",
    tagline: "The fullest BELONG experience.",
    pricePence: 1499,
    features: [
      "Everything in Plus",
      "Unlimited introductions",
      "Unlimited Circles and intentions",
      "Connection Graph insights",
      "Priority support",
    ],
    limits: { introsPerMonth: -1, circles: -1, activeIntentions: -1, graphInsights: true, hostEvents: true },
  },
];

export const DEFAULT_FLAGS: { key: string; description: string; enabled: boolean }[] = [
  { key: "registration_open", description: "Allow new members to register", enabled: true },
  { key: "live_intelligence", description: "Live Connection Intelligence (temporary signals)", enabled: true },
  { key: "circles", description: "BELONG Circles", enabled: true },
  { key: "events", description: "Events and activities", enabled: true },
  { key: "gatherings", description: "Companion-proposed gatherings", enabled: true },
  { key: "connection_graph", description: "Connection Graph", enabled: true },
  { key: "connection_assistant", description: "Connection assistant in conversations", enabled: true },
  { key: "subscriptions", description: "Membership upgrades", enabled: true },
  { key: "demo_simulation", description: "Simulated responses from fictional demo members", enabled: true },
];

export type ConsentKey =
  | "matching_enabled"
  | "share_interests"
  | "share_experiences"
  | "share_skills_goals"
  | "share_intentions"
  | "share_personality"
  | "share_area"
  | "share_availability"
  | "mutual_connections"
  | "group_suggestions"
  | "companion_memory"
  | "product_analytics"
  | "marketing_emails";

export const CONSENTS: { key: ConsentKey; title: string; description: string; group: string; default: boolean }[] = [
  {
    key: "matching_enabled",
    title: "Let my companion look for connections",
    description:
      "Your companion joins the BELONG agent network on your behalf. Turn this off and no signals leave your account at all.",
    group: "Agent network",
    default: true,
  },
  {
    key: "share_interests",
    title: "Share my interests",
    description: "Generalised interest signals, such as “hiking” or “board games”. Never your own words.",
    group: "Agent network",
    default: true,
  },
  {
    key: "share_experiences",
    title: "Share experiences I've approved",
    description: "Only memories you have individually marked as shareable are turned into signals.",
    group: "Agent network",
    default: false,
  },
  {
    key: "share_skills_goals",
    title: "Share what I can offer and what I'd like to learn",
    description: "Lets the network find complementary connections, like a guitarist and someone learning.",
    group: "Agent network",
    default: true,
  },
  {
    key: "share_intentions",
    title: "Share my current intentions",
    description: "Temporary signals you approve one by one. They expire automatically.",
    group: "Agent network",
    default: true,
  },
  {
    key: "share_personality",
    title: "Share my social style",
    description: "Whether you prefer one-to-one or groups, your pace and energy.",
    group: "Agent network",
    default: true,
  },
  {
    key: "share_area",
    title: "Use my general area",
    description: "Your postcode district (like “BS3”) and travel distance, so suggestions are people you could actually meet. Never your address or live location.",
    group: "Agent network",
    default: true,
  },
  {
    key: "share_availability",
    title: "Share when I'm usually free",
    description: "Broad slots only, such as “weekend mornings”, so plans can suit everyone. Never your calendar.",
    group: "Agent network",
    default: true,
  },
  {
    key: "mutual_connections",
    title: "Friends of friends",
    description: "Let BELONG notice when someone suggested to you knows one of your connections, and name that connection if all three of you allow it.",
    group: "Agent network",
    default: true,
  },
  {
    key: "group_suggestions",
    title: "Suggest small gatherings",
    description: "Let your companion propose a one-off get-together with a few nearby members who share an interest. You always choose whether to join.",
    group: "Agent network",
    default: true,
  },
  {
    key: "companion_memory",
    title: "Let my companion suggest memories",
    description: "Your companion proposes things to remember. Nothing is saved until you approve it.",
    group: "Companion",
    default: true,
  },
  {
    key: "product_analytics",
    title: "Help improve BELONG",
    description: "Anonymous usage counts only. Never conversations, memories or messages.",
    group: "Product",
    default: false,
  },
  {
    key: "marketing_emails",
    title: "Occasional emails from BELONG",
    description: "Product news and community stories. Unsubscribe at any time.",
    group: "Product",
    default: false,
  },
];

export const MEMORY_CATEGORIES = [
  { id: "interests", label: "Interests", shareable: true, signal: "interest", hint: "Things you love doing" },
  { id: "experiences", label: "Experiences", shareable: true, signal: "experience", hint: "Chapters of your life" },
  { id: "skills", label: "Things I can share", shareable: true, signal: "offer", hint: "Skills you'd happily pass on" },
  { id: "goals", label: "Things I'd like to learn", shareable: true, signal: "seek", hint: "What you're hoping to try" },
  { id: "values", label: "Values", shareable: false, signal: null, hint: "What matters to you" },
  { id: "preferences", label: "Social preferences", shareable: false, signal: null, hint: "How you like to meet people" },
  { id: "relationships", label: "People in my life", shareable: false, signal: null, hint: "Always private" },
  { id: "life", label: "Life right now", shareable: false, signal: null, hint: "Always private" },
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]["id"];

export const PERSONALITY = {
  group: {
    label: "I'm happiest…",
    options: { one_to_one: "one-to-one", small: "in small groups", large: "at bigger gatherings" },
    signal: { one_to_one: "one-to-one", small: "small-group", large: "big-gathering" },
  },
  energy: {
    label: "My social energy is…",
    options: { quiet: "quiet and thoughtful", balanced: "somewhere in between", lively: "lively and outgoing" },
    signal: { quiet: "quiet-evening", balanced: "easy-going", lively: "high-energy" },
  },
  pace: {
    label: "I like plans that are…",
    options: { planned: "made in advance", steady: "regular and steady", spontaneous: "spontaneous" },
    signal: { planned: "plan-ahead", steady: "steady-rhythm", spontaneous: "spontaneous" },
  },
} as const;

export const AVAILABILITY_SLOTS = {
  weekday_mornings: "Weekday mornings",
  weekday_afternoons: "Weekday afternoons",
  weekday_evenings: "Weekday evenings",
  weekend_mornings: "Weekend mornings",
  weekend_afternoons: "Weekend afternoons",
  weekend_evenings: "Weekend evenings",
} as const;

export type PersonalityKey = keyof typeof PERSONALITY;
export type Personality = Partial<Record<PersonalityKey, string>>;

export const COMPANION_TONES = {
  warm: "Warm and encouraging",
  thoughtful: "Calm and thoughtful",
  playful: "Light and playful",
  direct: "Clear and to the point",
} as const;

export const COMPANION_STYLES = ["lavender", "sage", "sky", "peach"] as const;

export const formatPrice = (pence: number, currency = "GBP") =>
  pence === 0
    ? "Free"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(pence / 100);
