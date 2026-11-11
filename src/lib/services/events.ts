import { z } from "zod";
import { getDb, json, now, uid } from "../db";
import { TOPICS, topicLabel } from "../matching/topics";
import { taxonomyMatcher } from "../matching/semantic";
import { mockConnectionIdeas } from "../ai/mock";
import { AppError, audit, flag, forbidden, notFound } from "./core";
import { getLimits } from "./subscriptions";

export interface EventView {
  id: string;
  title: string;
  description: string;
  topic: string;
  topicLabel: string;
  /** General area only — an exact meeting point is agreed between attendees. */
  area: string | null;
  format: "in_person" | "online";
  startsAt: string;
  capacity: number;
  going: number;
  iAmGoing: boolean;
  iAmHost: boolean;
  hostName: string | null;
  circleId: string | null;
  circleName: string | null;
  fit: string | null;
}

type EventRow = {
  id: string;
  title: string;
  description: string;
  topic: string;
  area: string | null;
  format: string;
  starts_at: string;
  capacity: number;
  host_id: string | null;
  circle_id: string | null;
  host_name: string | null;
  circle_name: string | null;
};

const SELECT = `SELECT e.*, p.display_name AS host_name, c.name AS circle_name
  FROM events e LEFT JOIN profiles p ON p.user_id = e.host_id LEFT JOIN circles c ON c.id = e.circle_id`;

async function view(userId: string, rows: EventRow[]): Promise<EventView[]> {
  const db = await getDb();
  const profile = await db.get<{ interests: string }>("SELECT interests FROM profiles WHERE user_id = ?", [userId]);
  const interests = json<string[]>(profile?.interests, []);
  const myCircles = new Set((await db.all<{ circle_id: string }>("SELECT circle_id FROM circle_members WHERE user_id = ?", [userId])).map((r) => r.circle_id));
  const out: EventView[] = [];
  for (const r of rows) {
    // Circle events are visible to that circle's members only.
    if (r.circle_id && !myCircles.has(r.circle_id)) continue;
    const rsvps = await db.all<{ user_id: string }>("SELECT user_id FROM event_rsvps WHERE event_id = ? AND status = 'going'", [r.id]);
    const best = interests.map((t) => ({ t, s: taxonomyMatcher.similarity(t, r.topic) })).sort((a, b) => b.s - a.s)[0];
    out.push({
      id: r.id,
      title: r.title,
      description: r.description,
      topic: r.topic,
      topicLabel: topicLabel(r.topic),
      area: r.area,
      format: r.format as EventView["format"],
      startsAt: r.starts_at,
      capacity: Number(r.capacity),
      going: rsvps.length,
      iAmGoing: rsvps.some((x) => x.user_id === userId),
      iAmHost: r.host_id === userId,
      hostName: r.host_name ? r.host_name.split(" ")[0] : null,
      circleId: r.circle_id,
      circleName: r.circle_name,
      fit: best && best.s >= 0.5 ? `Because you enjoy ${topicLabel(best.t)}` : null,
    });
  }
  return out;
}

export async function listEvents(userId: string): Promise<EventView[]> {
  const db = await getDb();
  const rows = await db.all<EventRow>(`${SELECT} WHERE e.starts_at > ? ORDER BY e.starts_at`, [now()]);
  return view(userId, rows);
}

export async function getEvent(userId: string, eventId: string): Promise<EventView | null> {
  const db = await getDb();
  const row = await db.get<EventRow>(`${SELECT} WHERE e.id = ?`, [eventId]);
  if (!row) return null;
  return (await view(userId, [row]))[0] ?? null;
}

export const eventSchema = z.object({
  title: z.string().trim().min(4, "Give your event a title.").max(80),
  description: z.string().trim().max(600).default(""),
  topic: z.string().refine((t) => Boolean(TOPICS[t]), "Choose a topic."),
  area: z.string().trim().max(60).optional(),
  format: z.enum(["in_person", "online"]).default("in_person"),
  startsAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)) && Date.parse(s) > Date.now(), "Choose a date in the future."),
  capacity: z.coerce.number().int().min(2).max(30).default(8),
  circleId: z.string().optional(),
});

export async function createEvent(userId: string, input: z.input<typeof eventSchema>): Promise<string> {
  if (!(await flag("events"))) throw forbidden("Events are paused right now.");
  const d = eventSchema.parse(input);
  const db = await getDb();
  if (d.circleId) {
    const member = await db.get("SELECT 1 AS x FROM circle_members WHERE circle_id = ? AND user_id = ?", [d.circleId, userId]);
    if (!member) throw forbidden("You can only plan events for Circles you belong to.");
  } else if (!(await getLimits(userId)).hostEvents) {
    throw new AppError("Hosting open events is part of BELONG Plus. You can still plan events inside your Circles.", "limit");
  }
  const id = uid();
  const ts = now();
  await db.run(
    "INSERT INTO events (id, title, description, topic, area, format, starts_at, capacity, host_id, circle_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, d.title, d.description, d.topic, d.area || null, d.format, new Date(d.startsAt).toISOString(), d.capacity, userId, d.circleId || null, ts],
  );
  await db.run("INSERT INTO event_rsvps (event_id, user_id, status, created_at) VALUES (?, ?, 'going', ?)", [id, userId, ts]);
  await audit(userId, "event.created", "event", id);
  return id;
}

export async function setRsvp(userId: string, eventId: string, going: boolean) {
  const db = await getDb();
  const ev = await getEvent(userId, eventId);
  if (!ev) throw notFound("That event isn't available.");
  if (!going) {
    await db.run("DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?", [eventId, userId]);
    return;
  }
  if (ev.iAmGoing) return;
  if (ev.going >= ev.capacity) throw new AppError("This event is full.", "conflict");
  await db.run("INSERT INTO event_rsvps (event_id, user_id, status, created_at) VALUES (?, ?, 'going', ?)", [eventId, userId, now()]);
}

/** Activity ideas for a member, drawn from their own interests. */
export async function suggestedActivities(userId: string): Promise<{ topic: string; label: string; idea: string }[]> {
  const db = await getDb();
  const profile = await db.get<{ interests: string }>("SELECT interests FROM profiles WHERE user_id = ?", [userId]);
  const interests = json<string[]>(profile?.interests, []).slice(0, 4);
  return interests.map((topic, i) => {
    const ideas = mockConnectionIdeas({ theirFirstName: "", sharedTopics: [topic], reasons: [] }).activities;
    return { topic, label: topicLabel(topic), idea: ideas[i % ideas.length] };
  });
}
