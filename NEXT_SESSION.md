# NEXT SESSION — handover

_Last updated: 2026-11-15, session 2._

## 1. Current project state

The first complete build is finished, tested and pushed. Every module in `BELONG_MASTER_SPEC.md` works locally
with no credentials. Nothing is half-done.

## 2. Architecture (one paragraph)

Next.js 16 App Router. Pages (Server Components) read through `src/lib/services`; mutations are server actions in
`src/app/actions.ts`. Services hold every business rule and permission check and talk to the database only through
the `Db` interface (`src/lib/db`): SQLite locally, PostgreSQL when `DATABASE_URL` is set. The matching engine
(`src/lib/matching`) is pure and reads only signals. AI sits behind `AIProvider` (`src/lib/ai`): simulated by
default, Claude when `ANTHROPIC_API_KEY` is set. Other external services are stubs in `src/lib/adapters`.

## 3. Completed

All milestones M0–M14. See `PROJECT_STATUS.md`.

## 4. In progress

Nothing.

## 5. Unfinished / next

See "Suggested next priorities" and "Known limitations" in `PROJECT_STATUS.md`. Most depend on owner credentials.

## 6. Known errors

None. `npm run check` is clean. The `ExperimentalWarning: SQLite` line in output is expected (DECISIONS D-003).

## 7. Exact next task

Added 2026-11-14: local matching (postcode district + radius), engine multipliers (rarity, style, timing,
friends-of-friends) and companion-proposed gatherings — see the last entry in `DEVELOPMENT_LOG.md` and D-025–D-031.
Ideas discussed with the owner but NOT built: learning from accept/dismiss behaviour, post-meeting feedback,
reciprocity scoring, "bridge" introductions between friend groups, admin controls for the multipliers and gatherings.

If the owner has given no other instruction, work down this list, one commit each, without waiting for credentials:

Done 2026-11-15: task 0 (admin tuning, gatherings admin, allowance check, UK-time fix) and the feedback loop +
learning from responses (D-032–D-036). Remaining ideas not built: reciprocity scoring, bridge introductions
between friend groups, life-stage signals, conversation-style signals (needs live AI).

1. **Host tools**: let a Circle host remove a member, and an event host edit or cancel an event
   (`services/circles.ts`, `services/events.ts`, their pages, tests in `tests/workflow.test.ts`).
2. **Pagination** for messages, notifications and admin tables; batch the per-row queries in
   `listConversations`, `circles.view` and `events.view`.
3. **Negation handling** in the simulated companion (`src/lib/ai/mock.ts`): don't propose memories for
   "I don't like / hate / can't stand X". Add tests.
4. **Password reset and email verification** behind the email adapter, using the dev outbox locally.
5. **Content-Security-Policy** header in `next.config.ts`, verified with `scripts/e2e.mjs`.
6. Wire `scripts/e2e.mjs` into CI.

If the owner HAS supplied credentials, do the matching item in `INTEGRATION_CHECKLIST.md` first.

## 8. Commands to resume

```bash
git status && git log --oneline | head
npm install
npm run typecheck && npm test
npm run dev                      # http://localhost:3000 — alex@belong.example / belong-demo
```

Browser test (needs Playwright + Chromium):

```bash
npm run build
rm -f data/e2e.db*
DATABASE_FILE=./data/e2e.db PORT=3100 BELONG_INSECURE_COOKIES=true npm start &
NODE_PATH=$(npm root -g) BASE_URL=http://localhost:3100 npm run test:e2e
```

PostgreSQL test, if a local server is available: `npm run test:pg`.

## 9. Warnings

- Keep `cacheComponents` off in `next.config.ts` (D-004).
- Stop any running `next start` before rebuilding, or the old server serves stale chunks and the browser test
  fails with chunk-load errors.
- `scripts/e2e.mjs` needs a **fresh** database each run (it expects seeded demo data and creates a member).
- Don't weaken the invariants in `CLAUDE.md`; the privacy tests exist to catch that.
- Branch is `claude/kind-hamilton-jclph4`. Push there unless the owner says otherwise.
- Don't claim a container named `belong`, a `main` branch, a deployment or live integrations exist — they don't.

## 10. Last commit

"Add component and PostgreSQL tests, CI, documentation and handover" on `claude/kind-hamilton-jclph4`
(run `git log -1` for the hash).
