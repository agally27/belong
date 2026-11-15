# BELONG

**Your people are out there.**

BELONG is an AI-powered human connection platform. Every member has a personal AI companion that
gets to know them and takes part — with permission — in a network of companions that looks for
opportunities for real human connection. The defining principle:

> AI should bring people closer together, not replace human relationships.

This repository contains the complete application: public site, member app, agent network and
matching engine, admin console, tests and documentation. It runs locally with **no external
credentials**.

## Quick start

Requires Node.js 22.5 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

On first start the app creates a local SQLite database (`./data/belong.db`), applies migrations and
seeds a demonstration world of 13 **fictional** members.

| Sign in as | Email | Password |
| --- | --- | --- |
| Demo member (Alex) | `alex@belong.example` | `belong-demo` |
| Administrator | `admin@belong.example` | `belong-admin` |

The sign-in page also has one-click buttons for both. Or register a new account and walk the whole
journey yourself: onboarding → companion → approve a signal → Discover → introduction → messaging.
Fictional members can be asked to "answer" an introduction through a clearly labelled demo control.

> Demo accounts exist only while `BELONG_DEMO_MODE` is not `false`. Never run production in demo mode.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit, integration, privacy and component tests (Vitest) |
| `npm run test:e2e` | Browser journey + every page at desktop and phone widths (needs a running server; also runs in CI) |
| `npm run test:pg` | The seeded journey against a real PostgreSQL database |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run check` | Lint, typecheck, tests and build |
| `npm run db:reset` | Delete and re-seed the local database |
| `npm run db:migrate` | Apply migrations without seeding |
| `npm run db:make-admin -- you@example.com` | Promote an existing account to administrator |

## What's inside

| Area | Where |
| --- | --- |
| Public site (landing, membership, about, safety, privacy, terms, help) | `src/app/(marketing)` |
| Sign-in, registration, onboarding | `src/app/(auth)`, `src/app/onboarding` |
| Member app — dashboard, companion, memories, Discover, Live, introductions, messages, Circles, events, connections, graph, profile, privacy, membership, notifications, settings, help | `src/app/(app)` |
| Admin console — members, signals, matching, introductions, Circles, moderation, subscriptions, analytics, flags, audit | `src/app/admin` |
| Business logic and permission checks | `src/lib/services` |
| Matching engine (pure, AI-independent) | `src/lib/matching` |
| AI provider interface, simulated companion, Claude adapter | `src/lib/ai` |
| Database drivers and migrations | `src/lib/db`, `db/migrations` |
| Integration adapters (payments, email, push, embeddings, maps, storage) | `src/lib/adapters` |

## Documentation

- [`BELONG_MASTER_SPEC.md`](BELONG_MASTER_SPEC.md) — product specification and architecture
- [`PROJECT_STATUS.md`](PROJECT_STATUS.md) — what is done, known limitations, what's next
- [`INTEGRATION_CHECKLIST.md`](INTEGRATION_CHECKLIST.md) — everything the owner needs to configure for production
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/DATABASE.md`](docs/DATABASE.md)
- [`DECISIONS.md`](DECISIONS.md) · [`DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`CLAUDE.md`](CLAUDE.md) and [`NEXT_SESSION.md`](NEXT_SESSION.md) — how an AI development session resumes work

## Privacy at a glance

- Companion conversations and memories are private to their member. Nothing is remembered without approval.
- The agent network reads **only** generalised signals the member has approved — never their words.
- A connection, and therefore messaging, exists only after **both** members approve an introduction.
- Administrators cannot read companion conversations, memories or private messages.
- Members can export all their data or permanently delete their account.
- Email is confirmed before members can contact anyone; passwords can be reset by email.
- A strict, nonce-based Content-Security-Policy is applied to every page.

These rules are enforced in the service layer and covered by `tests/privacy.test.ts` and `tests/workflow.test.ts`.
The architecture is prepared for UK GDPR, subject to legal and security review before launch.
