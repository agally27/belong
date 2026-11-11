# NEXT SESSION — handover

_Last updated: 2026-11-11 (session 1, mid-build)_

## Current state

Backend complete and tested (49 Vitest tests passing). UI not yet built.

- Done: schema + migrations, DB drivers, matching engine, all services, AI layer, adapters, demo seed, tests.
- In progress: M1 design system and all pages under `src/app`.

## Exact next task

Build the UI: design tokens in `src/app/globals.css`, components in `src/components`, session helpers in
`src/lib/session.ts`, server actions in `src/app/actions`, then pages (marketing → auth → onboarding → member app → admin).

## Commands

`npm install && npm run typecheck && npm test`, then `npm run dev`.

## Warnings

- `next.config.ts` deliberately has no `cacheComponents` (see DECISIONS.md D-004).
- Work on branch `claude/kind-hamilton-jclph4`.
