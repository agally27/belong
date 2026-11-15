# Development log

## 2026-11-11 → 2026-11-13 · Session 1 — initial build

**Environment**
- Started in an empty clone of `agally27/belong` on branch `claude/kind-hamilton-jclph4`. The repository already
  existed, so none was created. The session was only permitted to push to that branch, so `main` was not created.
- The session runs in an ephemeral managed cloud container. It cannot create or name a persistent container, so
  **no container named `belong` exists**; GitHub is the source of truth. The worker restarted once mid-session;
  uncommitted work survived and was committed immediately afterwards.
- Tooling: Node 22, Next.js 16.4, React 19.3, Tailwind 4.3, Vitest 5, Playwright 1.63 (pre-installed), PostgreSQL 16 (local).

**Built**
- Portable schema (`db/migrations/0001_init.sql`, 29 tables); `Db` interface with SQLite and PostgreSQL drivers; migration runner.
- Topic taxonomy (50 topics), semantic matcher interface, pure three-dimension matching engine.
- Services: auth, profile, memory and intentions, signals, agent network and Live Connection Intelligence,
  introductions, messaging and connection assistant, safety, Circles, events, companion, subscriptions,
  account (notifications, graph, export, erasure, support), admin.
- AI layer: provider interface, rule-based simulated companion, Claude adapter (official SDK, structured outputs).
- Adapters: payments (mock + Stripe stub), email/push, embeddings, maps, storage.
- Demo seed: 13 fictional members with memories, intentions and signals; 5 Circles; 6 events; connections,
  a pending introduction, reports and a support ticket.
- UI: design system, public site (7 pages), sign-in/registration, 5-step onboarding, 22 member routes,
  11 admin routes, 4 API routes, error/not-found/loading states.
- Docs: this set, plus README, CONTRIBUTING, `.env.example`, deployment and database guides, CI workflow.

**Tests performed**
- `npm test`: 63 passed, 1 skipped (PostgreSQL, opt-in).
- `npm run test:pg` against local PostgreSQL 16: passed.
- `npm run lint`, `npm run typecheck`, `npm run build`: clean.
- `scripts/e2e.mjs` against a production build with a fresh database: 390 checks, 0 problems.
- Visual review of landing, Discover, companion and Circles screenshots.

**Bugs found and fixed**
- Onboarding: clicking "Continue" on step 4 also submitted the form (React reused the button element). Fixed with keys.
- New members got one notification per match (9 on joining). Now one summary notification per network run.
- Joining a Circle marked its earlier chat as unread. Now marked read at join.
- Build warning: runtime filesystem reads traced the whole project. Scoped with `turbopackIgnore` and `outputFileTracingIncludes`.
- Three `react-hooks/set-state-in-effect` lint errors replaced with derived state / event handlers.
- Single-button actions did not show success messages. They do now.

**Decisions** — D-001 to D-024 in `DECISIONS.md`.

**Commits**
- `4e224c1` Scaffold: schema, service layer, matching engine, AI adapters, demo seed and tests
- Design system, public site, auth, onboarding and core member pages
- Complete member app, admin console, API routes and browser journey test
- Component and PostgreSQL tests, CI, documentation and handover (this commit)

## 2026-11-14 · Session 1 (continued) — local matching, smarter engine, gatherings

**Built**
- `src/lib/geo`: bundled UK postcode-district lookup (2,848 districts, from github.com/academe/UK-Postcodes, derived from
  ONS/OS open data; BS3 cross-checked against postcodes.io), distance and vague distance bands.
- Migration `0002`: district, centre point, travel radius, open-to-online and availability on profiles; `gatherings`,
  `gathering_invites`; gathering conversations.
- Engine: distance filter and proximity boost, rarity weighting, social-style fit, availability overlap, friends-of-friends.
  Personality is no longer counted as a shared interest.
- New consents: `share_availability`, `mutual_connections`, `group_suggestions`. New flag: `gatherings`.
- `services/gatherings.ts` and `/gatherings`: companion-proposed get-togethers with opt-in, minimum size, group chat,
  reminders, lapse, drop-out handling and conversion to a Circle. Demo control for fictional invitees.
- Profile and onboarding: postcode district, travel radius, online option, usual free time.

**Tests** — `tests/local.test.ts` (18 new). Total 81 passed, 1 skipped. Browser run: 411 checks, 0 problems.
PostgreSQL run of the seeded journey re-verified with the new migration.

**Not done** — real calendar sync (needs provider credentials); venue suggestions (needs a places provider);
recurring gatherings other than via a Circle; licence confirmation for the bundled district data (owner to check).

## 2026-11-15 · Session 2 — admin tuning, feedback loop and learning

**Built**
- Admin → Matching: adjustable strengths for distance, rarity, social style, free time, friends of friends,
  learning from responses and after-meeting feedback.
- Admin → Gatherings: counts-only list with cancel (everyone invited is notified).
- Fixes: gathering times in UK local time (were an hour late in summer); gathering → Circle respects allowances.
- Migration `0003_feedback.sql`; `services/feedback.ts`: private "How did it go?" prompts on the dashboard,
  learned preferences from responses and feedback, "What your companion has learned from you" on Memories,
  feedback in data export, aggregate "How meetings went" in Admin → Analytics.

**Bug found and fixed in the browser run** — after answering a feedback question the card disappeared before the
thank-you could show; cards now stay on screen with the acknowledgement.

**Tests** — new `tests/admin-tuning.test.ts` (7) and `tests/feedback.test.ts` (5). Total 93 passed, 1 skipped;
PostgreSQL journey passes with all three migrations; browser run 421 checks, 0 problems.

**Later in session 2**
- Simulated companion negation handling (D-037).
- Host tools: remove a Circle member; edit or cancel an event (migration `0004_host_tools.sql`).
- Bug found and fixed: times picked in a date picker were read as UTC, so summer events were saved an hour late
  (`src/lib/time.ts`, D-040).
- Tests: 98 passed, 1 skipped; PostgreSQL journey passes with all four migrations; browser run 423 checks, 0 problems
  (now includes hosting, editing and cancelling an event, and the after-meeting feedback card).

**Matching ideas (owner asked for these before account/security work)**
- Life stages (migration `0005`): profile and onboarding choices, consent, signals, phrasing, adjustable weight.
- Reciprocity: `likelyYes()` in `services/feedback.ts`, adjustable "Both likely to say yes" factor.
- Bridges: `proposeBridges()` in `services/gatherings.ts`, run with every network run; side-aware confirmation;
  "Two Circles" presentation; seeded "Southville Dog Walkers" so Alex sees a bridge with Sunday Walkers.
- Fixes found by reviewing screenshots: double-booked gatherings (D-044), duplicate titles, pair wording in group titles.
- Tests: `tests/matching-ideas.test.ts` (14). Total 111 passed, 1 skipped; PostgreSQL with five migrations passes;
  browser run 429 checks, 0 problems.
