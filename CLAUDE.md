# BELONG — permanent development instructions

BELONG ("Your people are out there.") is a premium AI-powered human connection platform.
Every member has a personal AI companion; companions take part in a permission-controlled
agent network that finds opportunities for real human connection.
**AI should bring people closer together, not replace human relationships.**

## At the start of EVERY session — do this before anything else

1. `pwd && git status && git log --oneline | head -15`
2. Read `NEXT_SESSION.md` (the handover — most important), then `PROJECT_STATUS.md`.
3. Skim `BELONG_MASTER_SPEC.md` and the last entries of `DEVELOPMENT_LOG.md`; consult `DECISIONS.md` before re-deciding anything.
4. `npm install` (if `node_modules` is missing), then `npm run typecheck && npm test`.
5. Resume from the "Exact next task" in `NEXT_SESSION.md`. **Do not restart, regenerate or overwrite completed work.
   Do not ask the owner what was being built.**

## Operating rules

- Work autonomously. Make sensible decisions, record significant ones in `DECISIONS.md`, and keep going.
- The app must always run with **no external credentials** (`npm run dev`). External services go behind
  adapters in `src/lib/adapters` and `src/lib/ai`, with mock/local defaults.
- Do not spend time provisioning production services (Supabase, Stripe, email, push, maps, domains).
  Document what the owner must do in `INTEGRATION_CHECKLIST.md`.
- Never commit secrets, `.env*` files (except `.env.example`), database files or personal data.
- Never report something as configured, deployed or tested unless it actually is.
- This is Next.js 16 — APIs differ from older versions. Read `node_modules/next/dist/docs/` before using an
  unfamiliar Next API (see `AGENTS.md`).

## Non-negotiable product invariants (covered by tests — keep them passing)

1. **Memory isolation** — a member can only ever read or change their own memories and companion conversation.
2. **Signals only** — the agent network / matching engine reads `signals` plus the consented coarse context from
   `networkContexts()` (postcode-district centre, travel radius, friends-of-friends and gathering opt-ins) and
   nothing else. Signals are generalised taxonomy topics, derived only from sources the member approved, and never
   contain their own words.
3. **Consent is opt-in** — no consent row means not granted. Withdrawing consent removes signals immediately.
4. **Mutual approval** — a connection (and therefore messaging) is created only in
   `respondToIntroduction` when BOTH decisions are `approved`.
5. **No admin access to private content** — `services/admin.ts` must never return memories, companion chats or messages.
6. **Temporary signals expire**; exact locations are never stored — only a postcode district (e.g. "BS3"), never a
   full postcode or device location, and another member's district is never shown.
9. **Groups are opt-in** — nobody is placed in a gathering; invitees stay hidden until it is confirmed and the
   viewer has accepted; a mutual connection is named only if all three people allow it.
7. **Honest labelling** — fictional demo members and simulated AI output are always labelled in the UI.
8. The matching engine (`src/lib/matching`) stays pure and independent of any AI API.

## Before finishing a session, or when context is running low

1. Stop starting new features; leave the app runnable.
2. `npm run check` (lint, typecheck, tests, build) — fix or record failures.
3. Update `PROJECT_STATUS.md`, append to `DEVELOPMENT_LOG.md`, and rewrite `NEXT_SESSION.md` with the exact next task.
4. Commit with a meaningful message and `git push -u origin <current branch>`.

## Commands

| Task | Command |
| --- | --- |
| Run locally (auto-migrates and seeds demo data) | `npm run dev` |
| Tests / typecheck / lint / build | `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` |
| Everything | `npm run check` |
| Browser smoke test (needs a running server) | `npm run test:e2e` |
| Reset the local database | `npm run db:reset` |

Demo sign-in (demo mode only): `alex@belong.example` / `belong-demo` · admin `admin@belong.example` / `belong-admin`.

## Map

- `src/lib/matching` — taxonomy, semantic matcher, pure matching engine (three dimensions + practical-fit multipliers)
- `src/lib/geo` — postcode-district lookup and distance; `src/lib/services/gatherings.ts` — companion-proposed groups
- `src/lib/services` — all business logic and permission checks (the repository/service layer)
- `src/lib/db` — driver abstraction (SQLite locally, PostgreSQL via `DATABASE_URL`), migrations in `db/migrations`
- `src/lib/ai` — AI provider interface, simulated companion, Claude adapter
- `src/lib/adapters` — payments, email/push, embeddings, maps, storage integration points
- `src/app` — Next.js routes: `(marketing)`, `(auth)`, `onboarding`, `(app)` member area, `admin`, `api`
- `tests` — Vitest suites; `scripts/e2e.mjs` — Playwright smoke and responsive checks
