import { z } from "zod";
import { getDb, json, now } from "../db";
import { COMPANION_STYLES, COMPANION_TONES, PERSONALITY, type Personality } from "../config";
import { TOPICS } from "../matching/topics";
import { AppError, audit } from "./core";
import { syncSignals } from "./signals";

export interface Profile {
  userId: string;
  displayName: string;
  pronouns: string | null;
  ageRange: string | null;
  bio: string | null;
  area: string | null;
  region: string | null;
  hue: number;
  interests: string[];
  values: string[];
  personality: Personality;
  lookingFor: string[];
}

type ProfileRow = {
  user_id: string;
  display_name: string;
  pronouns: string | null;
  age_range: string | null;
  bio: string | null;
  area: string | null;
  region: string | null;
  hue: number;
  interests: string;
  values: string;
  personality: string;
  looking_for: string;
};

export const toProfile = (r: ProfileRow): Profile => ({
  userId: r.user_id,
  displayName: r.display_name,
  pronouns: r.pronouns,
  ageRange: r.age_range,
  bio: r.bio,
  area: r.area,
  region: r.region,
  hue: Number(r.hue),
  interests: json<string[]>(r.interests, []),
  values: json<string[]>(r.values, []),
  personality: json<Personality>(r.personality, {}),
  lookingFor: json<string[]>(r.looking_for, []),
});

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = await getDb();
  const row = await db.get<ProfileRow>("SELECT * FROM profiles WHERE user_id = ?", [userId]);
  return row ? toProfile(row) : null;
}

export const LOOKING_FOR = {
  friendship: "New friends",
  activity_partners: "People to do things with",
  community: "A sense of community",
  collaboration: "Creative or professional collaborators",
  conversation: "Good conversation",
} as const;

export const AGE_RANGES = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Tell us what to call you.").max(40),
  pronouns: optionalText(30),
  ageRange: z.enum(AGE_RANGES).nullable().optional(),
  bio: optionalText(400),
  area: optionalText(60),
  region: optionalText(60),
  interests: z.array(z.string()).max(12, "Choose up to 12 interests.").default([]),
  values: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  personality: z
    .object({
      group: z.enum(Object.keys(PERSONALITY.group.options) as [string, ...string[]]).optional(),
      energy: z.enum(Object.keys(PERSONALITY.energy.options) as [string, ...string[]]).optional(),
      pace: z.enum(Object.keys(PERSONALITY.pace.options) as [string, ...string[]]).optional(),
    })
    .default({}),
  lookingFor: z.array(z.enum(Object.keys(LOOKING_FOR) as [string, ...string[]])).default([]),
});

export type ProfileInput = z.input<typeof profileSchema>;

export async function updateProfile(userId: string, input: ProfileInput) {
  const d = profileSchema.parse(input);
  const interests = d.interests.filter((i) => TOPICS[i]);
  const db = await getDb();
  await db.run(
    'UPDATE profiles SET display_name = ?, pronouns = ?, age_range = ?, bio = ?, area = ?, region = ?, interests = ?, "values" = ?, personality = ?, looking_for = ?, updated_at = ? WHERE user_id = ?',
    [
      d.displayName,
      d.pronouns ?? null,
      d.ageRange ?? null,
      d.bio ?? null,
      d.area ?? null,
      d.region ?? null,
      JSON.stringify(interests),
      JSON.stringify(d.values),
      JSON.stringify(d.personality),
      JSON.stringify(d.lookingFor),
      now(),
      userId,
    ],
  );
  await syncSignals(userId);
}

export interface Companion {
  name: string;
  tone: keyof typeof COMPANION_TONES;
  style: (typeof COMPANION_STYLES)[number];
  proactivity: "gentle" | "balanced" | "proactive";
}

export async function getCompanion(userId: string): Promise<Companion> {
  const db = await getDb();
  const row = await db.get<{ name: string; tone: string; style: string; proactivity: string }>(
    "SELECT name, tone, style, proactivity FROM companions WHERE user_id = ?",
    [userId],
  );
  return {
    name: row?.name ?? "Sol",
    tone: (row?.tone ?? "warm") as Companion["tone"],
    style: (row?.style ?? "lavender") as Companion["style"],
    proactivity: (row?.proactivity ?? "balanced") as Companion["proactivity"],
  };
}

export const companionSchema = z.object({
  name: z.string().trim().min(1, "Give your companion a name.").max(24),
  tone: z.enum(Object.keys(COMPANION_TONES) as [string, ...string[]]),
  style: z.enum(COMPANION_STYLES),
  proactivity: z.enum(["gentle", "balanced", "proactive"]),
});

export async function updateCompanion(userId: string, input: z.input<typeof companionSchema>) {
  const d = companionSchema.parse(input);
  const db = await getDb();
  const ts = now();
  await db.run(
    "INSERT INTO companions (user_id, name, tone, style, proactivity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET name = excluded.name, tone = excluded.tone, style = excluded.style, proactivity = excluded.proactivity, updated_at = excluded.updated_at",
    [userId, d.name, d.tone, d.style, d.proactivity, ts, ts],
  );
}

export async function completeOnboarding(userId: string) {
  const db = await getDb();
  const p = await getProfile(userId);
  if (!p) throw new AppError("Profile missing.", "not_found");
  await db.run("UPDATE users SET onboarded_at = ? WHERE id = ? AND onboarded_at IS NULL", [now(), userId]);
  await audit(userId, "user.onboarded", "user", userId);
  await syncSignals(userId);
}
