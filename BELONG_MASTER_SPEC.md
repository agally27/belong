# BELONG — master specification

_Product: BELONG · Tagline: "Your people are out there." · This document describes the product as built and intended._

## 1. Vision

A premium, AI-powered human connection platform. Every member has a personal AI companion that learns about
their interests, preferences, experiences and current intentions. Companions take part in a permission-controlled
network that identifies opportunities for meaningful human connection, and the platform helps people move from
discovery to genuine relationships.

**Principle:** AI should bring people closer together, not replace human relationships. The companion is the
thoughtful mutual acquaintance who says "you two should meet" — never the friend itself. It always says it is an
AI, steers members toward people, and signposts human support in a crisis.

## 2. Modules (all built)

| # | Module | Route(s) |
| --- | --- | --- |
| 1 | Public marketing website | `/`, `/pricing`, `/about`, `/safety`, `/privacy`, `/terms`, `/support` |
| 2 | Registration and authentication | `/register`, `/login` |
| 3 | Member onboarding (5 steps, consent opt-in) | `/onboarding` |
| 4 | Personal AI companion | `/companion`, `/companion/settings` |
| 5 | Companion memory interface | `/memories` |
| 6 | Personal profile | `/profile`, `/members/[id]` |
| 7 | Privacy and consent settings | `/settings/privacy` |
| 8 | Agent network architecture | `src/lib/services/network.ts`, `signals.ts` |
| 9 | Connection signal generation | `src/lib/services/signals.ts` |
| 10 | Live Connection Intelligence | `/live` |
| 11 | Matching engine | `src/lib/matching` |
| 12 | Discover | `/discover` |
| 13 | Introduction management | `/introductions` |
| 14 | Private messaging | `/messages`, `/messages/[id]` |
| 15 | BELONG Circles | `/circles`, `/circles/[id]` |
| 16 | Events and activities | `/events`, `/events/[id]` |
| 17 | Connection assistant | panel in `/messages/[id]` |
| 18 | My Connections | `/connections` |
| 19 | Connection Graph | `/graph` |
| 20 | Member dashboard | `/dashboard` |
| 21 | Notifications | `/notifications` |
| 22 | Membership and subscription | `/membership` |
| 23 | Administration dashboard | `/admin`, `/admin/users`, `/admin/circles`, `/admin/flags`, `/admin/audit` |
| 24 | Moderation | `/admin/moderation` |
| 25 | Analytics | `/admin/analytics`, `/admin/signals`, `/admin/matching`, `/admin/introductions`, `/admin/subscriptions` |
| 26 | Account settings | `/settings` |
| 27 | Help and support | `/help`, `/support` |

## 3. The core journey

1. A member joins and completes onboarding. Every consent starts **off**.
2. They meet their companion (configurable name, voice, look, proactivity).
3. They talk about an interest. The companion proposes **memories**; nothing is saved until approved.
4. The companion identifies an **intention** ("hiking company this weekend") and proposes it.
5. On approval, a temporary **connection signal** is created (it expires automatically).
6. Another member's companion carries a compatible signal.
7. The **matching engine** compares signals and finds the opportunity.
8. A **match** is recorded and both members are notified, with the reasons.
9. One member asks for an **introduction**.
10. The other is asked. Only if **both approve**…
11. …a **connection** is created,
12. and **messaging** becomes available, with a connection assistant offering starters and activity ideas.

## 4. Architecture

```
Browser ── Next.js 16 App Router (React 19 Server Components, Tailwind 4)
              │ pages read via services · mutations via server actions (src/app/actions.ts)
              ▼
        src/lib/services      ← all business rules + permission checks
          │        │      └──────────────┐
          ▼        ▼                     ▼
   src/lib/db   src/lib/matching    src/lib/ai            src/lib/adapters
   Db interface  pure engine        AIProvider            payments · email/push
   SQLite | PG   (signals only)     mock | Claude         embeddings · maps · storage
```

- **Rendering:** request-time dynamic rendering; every page is per-member. No client-side data fetching layer.
- **Auth:** email + password (scrypt), opaque session tokens stored hashed, httpOnly SameSite=Lax cookie.
  Behind `services/auth.ts` so Supabase Auth or another provider can replace it.
- **Database:** one portable SQL schema (`db/migrations`). SQLite (`node:sqlite`) locally; PostgreSQL/Supabase
  when `DATABASE_URL` is set. Verified on PostgreSQL 16 by `tests/postgres.test.ts`.
- **AI:** `AIProvider` interface. `mock` is a deterministic simulated companion; `claude` uses the Anthropic SDK
  with structured outputs when `ANTHROPIC_API_KEY` is set, falling back to the simulation on any failure.

### 4.1 Privacy boundary (the heart of the design)

```
 PRIVATE to the member                         SHARED with the agent network
 ─────────────────────                         ─────────────────────────────
 companion conversation                        signals: { kind, topic, strength,
 memories (proposed → approved)   ──derive──▶            temporary, expires_at }
 profile bio, values, email            ▲       topics come from a fixed taxonomy
 messages                              │       (src/lib/matching/topics.ts)
                              consent + per-item approval
```

`syncSignals(userId)` is the only code that creates signals. It requires: matching consent, the relevant
per-category consent, and — for memories — an approved memory individually marked shareable in a shareable
category. Categories `values`, `preferences`, `relationships`, `life` can never produce signals. Signals carry a
taxonomy topic, never the member's words. `networkSignals()` is the network's single read path.

### 4.2 Matching engine

Pure functions in `src/lib/matching/engine.ts`; no I/O, no AI. Input: two members' live signals and weights.
Three dimensions, each saturating to 0–1:

1. **Shared interests** — durable signals (interest, experience, personality) on the same or related topics.
2. **Shared moments** — temporary signals (intention, moment) that overlap now; plus a temporary signal meeting
   the other member's lasting interest. This is **Live Connection Intelligence**.
3. **Complementary interests** — offer ↔ seek pairs, collaboration signals, and naturally complementary topics.

Score = weighted blend (admin-configurable weights and threshold) scaled to 0–100. Each match stores reasons
phrased for both members. Semantic similarity goes through a `SemanticMatcher` interface: the local taxonomy
matcher today, `embeddingMatcher()` when an embeddings provider is configured.

The network run (`runNetwork`) skips blocked and already-connected pairs, retires suggestions that fall below
threshold or whose members withdrew, never re-suggests declined pairs, and sends at most one notification per
member per run.

### 4.3 Data model

`users`, `sessions`, `profiles`, `companions`, `companion_messages`, `memories`, `intentions`, `consents`,
`signals`, `matches`, `introductions`, `connections`, `conversations`, `messages`, `conversation_reads`,
`blocks`, `reports`, `circles`, `circle_members`, `events`, `event_rsvps`, `notifications`, `plans`,
`subscriptions`, `feature_flags`, `app_settings`, `audit_log`, `analytics_events`, `support_tickets`.
See `db/migrations/0001_init.sql` and `docs/DATABASE.md`.

## 5. Rules the product must always obey

1. Memory isolation — members reach only their own memories and companion conversation.
2. Signals only — the network reads nothing but approved, generalised signals.
3. Consent is opt-in; withdrawing it removes signals at once.
4. Mutual approval — no connection or messaging without both members' explicit yes.
5. Administrators cannot read private content.
6. Temporary signals expire. Locations are named areas only; device location is never requested.
7. Fictional demo members and simulated AI output are always labelled.
8. Matching never depends on an AI API.
9. No features that encourage dependency on the companion.

## 6. Membership

| Tier | Indicative price | Limits |
| --- | --- | --- |
| Free | £0 | 3 introduction requests/month · 1 Circle · 2 shared intentions |
| BELONG Plus | £7.99/month | 15 requests · 4 Circles · 5 intentions · host open events |
| BELONG Premium | £14.99/month | Unlimited · Connection Graph insights |

Defaults live in `src/lib/config.ts`; after first run they are edited centrally in Admin → Subscriptions.
Safety, privacy, blocking and reporting are free for everyone. Payments go through `PaymentProvider`
(simulated until Stripe is configured).

## 7. Brand and design

Warm ivory, cream, muted lavender, sage, soft blue and warm charcoal; Fraunces (display) and DM Sans (text),
self-hosted; organic "blob" shapes, soft gradients, generous whitespace. The companion is an abstract orb —
never a robot or a face. Members have generated avatars rather than photos, so first impressions come from what
people share. Tokens: `src/app/globals.css`. Primitives: `src/components/ui.tsx`. Mobile-first, with a bottom tab
bar on phones and a sidebar on desktop.

## 8. Out of scope for this build (owner configuration or future work)

Production Supabase/PostgreSQL, Claude API key, embeddings, Stripe and webhooks, email, push, maps, storage,
external analytics, domain/DNS and deployment credentials. See `INTEGRATION_CHECKLIST.md` and `PROJECT_STATUS.md`.
