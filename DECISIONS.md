# Decisions

Significant architectural, technical, UX and product decisions. Don't revisit without a genuine technical reason;
if you do, add a new entry rather than rewriting history.

| ID | Decision | Why |
| --- | --- | --- |
| D-001 | **Next.js 16 App Router, React 19, TypeScript, Tailwind 4.** Server Components read through services; mutations are server actions. No separate API layer or client data library. | One deployable unit, least code, permission checks stay on the server. |
| D-002 | **Hand-written portable SQL behind a tiny `Db` interface**, not an ORM. TEXT ids/timestamps, INTEGER booleans, JSON in TEXT. | ORMs need separate SQLite and Postgres schema definitions. One schema that runs unchanged on both avoids a rebuild when Supabase is connected. Proven by `tests/postgres.test.ts`. |
| D-003 | **`node:sqlite` for local persistence** (built into Node ≥ 22.5), loaded with `process.getBuiltinModule`. | No native dependency to compile. It prints an "experimental" warning, which is harmless; SQLite is for development only. |
| D-004 | **`cacheComponents` and `partialPrefetching` are off** (the Next 16 scaffold enables them). | Every page is per-member and request-time. Cache Components would require Suspense boundaries around every session read for no benefit here. Revisit only for the marketing pages if needed. |
| D-005 | **Own session auth** (scrypt + hashed opaque tokens in an httpOnly cookie) behind `services/auth.ts`. | Works with no external service. Replaceable by Supabase Auth without touching pages. |
| D-006 | **Signals are generalised to a fixed topic taxonomy.** Free text never becomes a signal. | Makes "the network never sees your words" true by construction, and lets matching work with no AI or embeddings. Cost: topics outside the taxonomy aren't matched until it grows or embeddings are added. |
| D-007 | **Memory categories decide shareability.** `values`, `preferences`, `relationships`, `life` are always private. | A simple rule members can understand, enforced in one place. |
| D-008 | **Consent is opt-in and starts off**, with a "Use recommended settings" button in onboarding rather than pre-ticked boxes. | Pre-ticked consent is not valid under UK GDPR. |
| D-009 | **The companion proposes; the member approves.** Proposed memories and intentions are stored inert (`status = 'proposed'`). | "Remember approved information" and "never automatically share personal memories". |
| D-010 | **Intention titles are written neutrally by the companion** and shown verbatim before sharing. | The member sees exactly what will be matched against. |
| D-011 | **One mutual-approval gate** in `respondToIntroduction`. Both members asking independently counts as mutual. | A single place to audit the most important rule. |
| D-012 | **Declines are quiet and final.** No reason is given; the pair is never re-suggested. | Kindness and safety. |
| D-013 | **Admins cannot read private content.** Moderation sees only what a reporter writes. | Privacy-first; trades some moderation power for trust. Revisit with legal advice if safeguarding duties require more. |
| D-014 | **Generated avatars, no photos.** | First impressions from interests rather than appearance; avoids image moderation and storage. |
| D-015 | **Named areas only**; device location is never requested (and is blocked by `Permissions-Policy`). | "Do not expose exact locations unnecessarily." |
| D-016 | **The simulated companion is rule-based and deterministic**, with crisis signposting, honesty about being an AI, and nudges toward people. | The demo must work with no key, and must model the behaviour we want from the real model. |
| D-017 | **Claude adapter uses the official SDK with structured outputs** (`messages.parse` + Zod) and server-side refusal fallbacks; default model `claude-opus-5-5`, overridable. Any failure falls back to the simulation. | Reliable JSON without forced tool use, and members are never left without a reply. The owner may choose a cheaper model. |
| D-018 | **Demo members cannot act for themselves**, so a labelled "demo control" simulates their answer to an introduction, and their chat replies are marked simulated. Refused for real members; off when demo mode or the `demo_simulation` flag is off. | Lets the full journey be shown without pretending fictional people are real. |
| D-019 | **The network runs on demand** (after a member changes what they share), from the admin console, and via an optional cron endpoint. It compares pairs in-process. | Simple and immediate at launch scale. See limitations for scaling. |
| D-020 | **Plans, flags and matching weights live in the database**, seeded from `src/lib/config.ts`. | "Pricing must be editable centrally." |
| D-021 | **Messaging is request/response**, not real-time. | No websocket infrastructure needed locally. Supabase Realtime is the natural upgrade. |
| D-022 | **Fonts are self-hosted via `@fontsource`**; illustrations are CSS/SVG. No stock photography. | Builds offline, no third-party requests, and avoids licensing questions. Professional photography can be added by the owner. |
| D-023 | **Charts are small server-rendered SVG**, one measure per chart, single hue, with table views. | No chart library; accessible by default. |
| D-024 | **Development branch is `claude/kind-hamilton-jclph4`**, not `main`. | The development environment only permitted pushing to its designated branch. Owner to merge/rename. |
| D-025 | **Location is a postcode district plus a member-set travel radius.** A typed postcode is cut to its district before storage; the district's published centre point is used for distance; other members only ever see vague bands. The lookup table (2,848 districts) is bundled. | Makes "people I could actually meet" real without storing anything more precise than a district. Supersedes the "named areas only" part of D-015. |
| D-026 | **Distance is a hard filter, then a nudge.** Outside either radius = not suggested (unless both are open to online). | A brilliant match 200 miles away is not a match for a friendship app. |
| D-027 | **Style, timing, rarity and mutual friends are multipliers on a real match, never a dimension.** Personality moved out of "shared interests". | Two people who both like small groups but share nothing else are not a match. Keeps the three dimensions honest. |
| D-028 | **For pairs, similar social style scores higher; for groups, a mix of energy is preferred.** | One-to-one, opposite extremes rarely click; in a group, a blend carries the conversation. |
| D-029 | **Friends-of-friends needs consent from both people being matched, and the mutual friend's too before their name is shown.** | Naming a mutual reveals that friend's connections. |
| D-030 | **Gatherings are proposals with individual opt-in, hidden invitees and a minimum of three.** Availability is broad slots, not calendars. | Nobody is put in a group or has their free time exposed; real calendar sync needs provider credentials (owner). |
| D-031 | **Gathering titles come from the built-in activity ideas; the meeting point is agreed in chat.** | No venue data without a maps/places provider. |
