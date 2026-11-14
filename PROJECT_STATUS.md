# Project status

_Last updated: 2026-11-14 · local matching, smarter engine and gatherings added_

## Summary

All 27 modules in the specification are built and working locally with no external credentials.
Verified by: 81 automated tests, a real-browser run of the whole member journey plus every page at desktop and
phone widths (411 checks), a clean lint/typecheck/production build, and the seeded journey on PostgreSQL 16.

**Not done, by design:** production services (database hosting, Claude key, Stripe, email, push, maps, storage,
domain, deployment). **Nothing has been deployed.**

## Milestones

| | Milestone | Status |
| --- | --- | --- |
| M0 | Environment and repository | ✅ (see limitations: branch, container) |
| M1 | Design system and application foundation | ✅ |
| M2 | Authentication, onboarding and profiles | ✅ (no email verification / password reset — needs email) |
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
- No email verification and no "forgot password" flow (both need an email provider).
- No two-factor authentication. Sign-in throttling is in-memory per server instance.
- No Content-Security-Policy header yet. No independent security review has been done.

**AI**
- The Claude adapter compiles against the current SDK but has never been run against the live API.
- The simulated companion is keyword-based: it only recognises topics in the taxonomy (~50 topics) and can
  misread negations ("I don't like hiking" would still propose a hiking memory — the member can decline it).
- Companion replies are not streamed.

**Local matching and gatherings (added 2026-11-14)**
- Distance uses postcode-district centres, so it is approximate by design (typically within a mile or two).
  UK only. Members without a district are matched regardless of distance.
- The bundled district table came from an open GitHub dataset derived from ONS/Ordnance Survey open data; its
  licence terms should be confirmed before launch, or the table regenerated from the ONS Postcode Directory.
- Availability is six broad slots, not a calendar. Real calendar sync needs provider credentials.
- Gatherings suggest an activity and a date but no venue; the group agrees a meeting point in chat.
- Gathering dates are computed in UTC, so times can be an hour out during British Summer Time.
- Converting a gathering to a Circle does not check members' Circle allowance.
- The multiplier sizes (distance ±, timing ±, mutuals +) are reasoned starting points, not tuned on real behaviour,
  and are not yet editable in the admin console.
- Gatherings do not yet appear in the admin console beyond the audit log.

**Matching and network**
- Interests outside the taxonomy are not matched until the taxonomy is extended or embeddings are connected.
- Personality signals contribute modestly to "shared interests"; scoring weights are a sensible first guess,
  not tuned on real data. Adjustable in Admin → Matching.
- `runNetwork` compares pairs in-process (O(n²) for a full run, O(n) per member change). Fine for hundreds to low
  thousands of members; beyond that, move to topic-indexed candidate generation and a background worker.
- Area filtering compares town names as text; there is no distance calculation.

**Messaging and community**
- Messages appear on page load/submit, not in real time. No typing indicators, attachments or read receipts.
- Circle hosts cannot remove members; events cannot be edited or cancelled after creation.
- Ending a connection or leaving a Circle is immediate with no undo (blocks can be undone).

**Commercial**
- Payments are simulated. The Stripe adapter and webhook are documented stubs.
- Plan limits apply immediately on downgrade; there is no proration or grace-period logic.

**Data and operations**
- SQLite local mode uses one connection; it is not for production.
- List pages are not paginated (admin lists are capped at 100–400 rows) and some run one query per row.
- No backups, error monitoring or external analytics are configured.
- Service-level code is covered by tests; server actions and pages are covered by the browser run rather than unit tests.
- The browser test is a script, not part of `npm test`, and CI does not run it.

**Content and design**
- `/privacy`, `/terms`, `/safety` are plain-English drafts that need legal review.
- No photography; visuals are CSS/SVG. No dark theme. English (UK) only.
- Accessibility was built in (landmarks, labels, focus states, reduced motion, text alternatives for charts) but
  has not been audited with assistive technology.

**Environment**
- Work is on branch `claude/kind-hamilton-jclph4`; there is no `main` yet.
- A cloud container named `belong` could not be created from the session (see `DEVELOPMENT_LOG.md`).
- Repository visibility could not be checked or changed from the session.
- The CI workflow (`.github/workflows/ci.yml`) has been written but never run.

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
