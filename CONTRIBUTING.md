# Contributing to BELONG

## Setup

```bash
npm install
npm run dev
```

No environment variables are needed. See `.env.example` for optional ones.

## Before you push

```bash
npm run check     # lint + typecheck + tests + production build
```

For UI changes also run the browser test against a fresh database:

```bash
npm run build
DATABASE_FILE=./data/e2e.db PORT=3100 npm start &
BASE_URL=http://localhost:3100 npm run test:e2e
```

(The script needs Playwright with Chromium available — `npm i -D playwright && npx playwright install chromium` on a
machine that doesn't already have it. Delete `data/e2e.db*` before each run.)

## Conventions

- **Business rules live in `src/lib/services`**, never in pages or components. Every service function that touches
  member data takes the acting `userId` and checks permission itself. Pages and server actions only call services.
- **Database access goes through the `Db` interface** (`src/lib/db/types.ts`) with `?` placeholders. Write SQL that
  runs on both SQLite and PostgreSQL: TEXT ids and ISO timestamps, INTEGER booleans, JSON in TEXT, no
  dialect-specific functions. Schema changes are new numbered files in `db/migrations` — never edit an applied one.
- **External services go behind an adapter** with a local default, so the app always runs without credentials.
- **Mutations are server actions** in `src/app/actions.ts` returning `{ ok, error, message }`. Throw `AppError` for
  anything a member should read.
- **UI** uses the primitives in `src/components/ui.tsx` and the tokens in `src/app/globals.css`. Label fictional
  members (`DemoBadge`) and simulated AI output (`SimulatedBadge`) wherever they appear.
- British English in member-facing copy. Warm, plain, never salesy.
- This is Next.js 16: read `node_modules/next/dist/docs/` before using an API you're unsure of.

## The invariants

The eight product invariants in `CLAUDE.md` are non-negotiable. If a change touches memories, signals, consent,
introductions, messaging or the admin console, add or update a test in `tests/privacy.test.ts` or
`tests/workflow.test.ts`.

## Commits

Small, meaningful commits with a clear subject line. Never commit secrets, `.env*` files (other than
`.env.example`), database files or real personal data.
