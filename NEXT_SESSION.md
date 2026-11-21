# NEXT SESSION — handover

_Last updated: 2026-11-15, end of session 2._

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

Everything from the earlier lists is done (session 2, 2026-11-15): admin tuning, after-meeting feedback and learning,
host tools, negation handling, life stages, reciprocity, bridges between Circles, email verification and password
reset, a nonce-based CSP, pagination/batching, and the browser journey in CI. Decisions D-032–D-048.

If the owner has given no other instruction, work down this list, one commit each, without waiting for credentials:

1. ~~Automated accessibility checks~~ — done 2026-11-15 (axe-core in `scripts/e2e.mjs`; fixes in D-049).
2. ~~Notification emails~~ — done 2026-11-21 (D-053–D-055).
3. ~~Vercel readiness~~ — done 2026-11-18 (D-050–D-052). A Dockerfile is only needed if the owner leaves Vercel.
4. ~~Admin view of host removals~~ — done 2026-11-15 (Admin → Circles).
5. Ideas still open with the owner: conversation-style signals (needs the live AI), bridges between informal friend
   clusters (not just Circles).

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
DATABASE_FILE=./data/e2e.db PORT=3100 APP_URL=http://localhost:3100 BELONG_INSECURE_COOKIES=true npm start &
BASE_URL=http://localhost:3100 npm run test:e2e
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
