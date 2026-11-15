# Project status

_Last updated: 2026-11-15 · life stages, reciprocity and bridges added_

## Summary

All 27 modules in the specification are built and working locally with no external credentials.
Verified by: 120 automated tests, a real-browser run of the whole member journey plus every page at desktop and
phone widths (446 checks), a clean lint/typecheck/production build, and the seeded journey on PostgreSQL 16.

**Not done, by design:** production services (database hosting, Claude key, Stripe, email, push, maps, storage,
domain, deployment). **Nothing has been deployed.**

## Milestones

| | Milestone | Status |
| --- | --- | --- |
| M0 | Environment and repository | ✅ (see limitations: branch, container) |
| M1 | Design system and application foundation | ✅ |
| M2 | Authentication, onboarding and profiles | ✅ (verification and reset built; real delivery needs an email key) |
| M3 | Personal AI companion | ✅ simulated; Claude adapter written, untested live |
| M4 | Memory architecture | ✅ |
| M5 | Agent network and connection signals | ✅ |
| M6 | Matching engine and Live Connection Intelligence | ✅ |
| M7 | Discover and introductions | ✅ |
| M8 | Messaging and BELONG Circles | ✅ (not real-time) |
| M9 | Connection Graph and activities | ✅ |
| M10 | Membership and subscriptions | ✅ with simulated payments |
| M11 | Administration and analytics | ✅ |
| M12 | Public website | ✅ (legal pages are drafts) |
| M13 | Testing and refinement | ✅ first pass |
| M14 | Integration handover and documentation | ✅ |

## What has been tested

| Area | How |
| --- | --- |
| Matching engine, taxonomy, semantic matcher | `tests/matching.test.ts` (14) |
| Memory isolation, signals-only, consent, expiry, visibility, blocking, reporting, export, erasure, admin gate | `tests/privacy.test.ts` (16) |
| Auth, sessions, the 12-step journey, mutual approval, plan limits, companion behaviour, Circles, events, membership, admin, demo seed | `tests/workflow.test.ts` (19) |
| UI primitives, charts, forms bound to actions | `tests/components.test.tsx` (13) |
| PostgreSQL driver: migrate, seed, journey, rollback | `tests/postgres.test.ts` (opt-in; passed locally on PG 16) |
| Full browser journey, access control, every page at 1280px and 390px, no console errors, no overflow | `scripts/e2e.mjs` (390 checks, passed) |

## Known limitations

**Account and security**
- Email verification and password reset are built, but use a local outbox until an email provider is configured;
  outside demo mode verification isn't enforced until then.
- No two-factor authentication. Sign-in throttling is in-memory per server instance.
- A strict nonce-based Content-Security-Policy is in place. No independent security review has been done.

**AI**
- The Claude adapter compiles against the current SDK but has never been run against the live API.
- The simulated companion is keyword-based: it only recognises topics in the taxonomy (~50 topics). Simple
  negations are handled clause by clause; sarcasm and complex phrasing are not.
- Companion replies are not streamed.

**Local matching and gatherings (added 2026-11-14)**
- Distance uses postcode-district centres, so it is approximate by design (typically within a mile or two).
  UK only. Members without a district are matched regardless of distance.
- The bundled district table came from an open GitHub dataset derived from ONS/Ordnance Survey open data; its
  licence terms should be confirmed before launch, or the table regenerated from the ONS Postcode Directory.
- Availability is six broad slots, not a calendar. Real calendar sync needs provider credentials.
- Gatherings suggest an activity and a date but no venue; the group agrees a meeting point in chat.
- The factor sizes are reasoned starting points, not tuned on real behaviour. They are adjustable in
  Admin → Matching, and the "How meetings went" chart in Admin → Analytics is the measure to tune against.
- Learning needs volume: with a handful of responses its effect is deliberately tiny.
- Reciprocity and learning have no effect until real members have answered introductions; they cannot be
  meaningfully evaluated on demo data.
- Bridges only connect Circles, not informal friend clusters in the connection graph.
- Feedback prompts appear on the dashboard only (no email/push reminder until those providers exist).

**Matching and network**
- Interests outside the taxonomy are not matched until the taxonomy is extended or embeddings are connected.
- Personality signals contribute modestly to "shared interests"; scoring weights are a sensible first guess,
  not tuned on real data. Adjustable in Admin → Matching.
- `runNetwork` compares pairs in-process (O(n²) for a full run, O(n) per member change). Fine for hundreds to low
  thousands of members; beyond that, move to topic-indexed candidate generation and a background worker.
- Area filtering compares town names as text; there is no distance calculation.

**Messaging and community**
- Messages appear on page load/submit, not in real time. No typing indicators, attachments or read receipts.
- Ending a connection or leaving a Circle is immediate with no undo (blocks can be undone).

**Commercial**
- Payments are simulated. The Stripe adapter and webhook are documented stubs.
- Plan limits apply immediately on downgrade; there is no proration or grace-period logic.

**Data and operations**
- SQLite local mode uses one connection; it is not for production.
- Admin tables page 50 rows at a time; long conversations and notification lists load the most recent first with
  "show earlier". Member-facing Discover, Circles and events lists are not paginated (fine at launch scale).
- No backups, error monitoring or external analytics are configured.
- Service-level code is covered by tests; server actions and pages are covered by the browser run rather than unit tests.
- The browser test runs in CI after the build (`.github/workflows/ci.yml`), separately from `npm test`.

**Content and design**
- `/privacy`, `/terms`, `/safety` are plain-English drafts that need legal review.
- No photography; visuals are CSS/SVG. No dark theme. English (UK) only.
- Every page passes automated WCAG 2.1 A/AA checks (axe-core, serious and critical issues fail CI) at desktop and
  phone widths. It has not been tested with real assistive technology or by disabled users.

**Environment**
- Work is on branch `claude/kind-hamilton-jclph4`; there is no `main` yet.
- A cloud container named `belong` could not be created from the session (see `DEVELOPMENT_LOG.md`).
- Repository visibility could not be checked or changed from the session.
- CI runs on every push to GitHub (lint, typecheck, tests including PostgreSQL, build, browser journey) and is passing.

## Known bugs

None open. (Found and fixed during testing: onboarding submitted early on the last "Continue"; a new member
received one notification per match.)

## Outstanding decisions for the owner

1. Which Claude model to run the companion on (cost vs quality).
2. Whether moderators should ever be able to see reported message content (currently never — D-013).
3. Whether to add profile photos (currently generated avatars — D-014).
4. Retention periods for messages, audit log and backups.

## Suggested next priorities

1. Email provider → verification, password reset, notification emails.
2. Connect Supabase and Claude; test the live companion; tune the system prompt.
3. Stripe adapter and webhook.
4. Real-time messaging (Supabase Realtime).
5. Embeddings-backed semantic matching; grow the taxonomy.
6. Pagination and query batching; background worker for the network.
7. Accessibility and security audits; CSP; error monitoring.
8. Host tools for Circles and events (edit, cancel, remove member).
