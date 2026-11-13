# Integration checklist — for the owner

Everything below is **not configured**. The application runs fully without any of it, using local or simulated
replacements. Each item says what to provide, where it plugs in, and what (if any) code is still to be written.

Legend: ✅ ready — just add credentials · 🔧 adapter stub — small implementation needed · 📝 non-technical.

## Before anything else

- [ ] Set `BELONG_DEMO_MODE=false` in production (removes demo accounts, demo sign-in buttons and simulated member replies).
- [ ] Register your own account, then promote it: `npm run db:make-admin -- you@example.com` (run with the production `DATABASE_URL`).
- [ ] Decide the default branch. Development was pushed to `claude/kind-hamilton-jclph4`; merge or rename it to `main` in GitHub.
- [ ] Confirm the GitHub repository is private (Settings → General → Danger zone). This was not verifiable from the development environment.

## 1. Database — Supabase / PostgreSQL ✅

- Provide: `DATABASE_URL` (Supabase: Project settings → Database → Connection string. Use the **pooler** string on serverless hosts).
- Plugs into: `src/lib/db/postgres.ts`. No code changes. Migrations apply automatically on start, or run `npm run db:migrate`.
- Verified: schema, seed and the full journey pass on PostgreSQL 16 (`npm run test:pg`). Not yet run against a hosted Supabase project.
- Note: the app connects server-side with the database role, so Supabase Row Level Security is not relied upon.
  Permissions are enforced in `src/lib/services`. If you later expose tables to the browser through Supabase's
  client libraries, write RLS policies first. See `docs/DATABASE.md`.

## 2. Claude API — the companion ✅ (verify with a real key)

- Provide: `ANTHROPIC_API_KEY`. Optional: `BELONG_CLAUDE_MODEL` (default `claude-opus-5-5`; a smaller model such as
  `claude-haiku-5-5` will cut cost considerably — your choice).
- Plugs into: `src/lib/ai/claude.ts`. No code changes. Server-side refusal fallbacks are enabled; any API failure
  falls back to the built-in simulation so members always get a reply.
- **Not tested against the live API** — no key was available during development. After adding a key: chat with the
  companion, confirm the "Simulated companion" badge disappears, and check that memory and intention proposals appear.
- Review the system prompt in that file and your data-processing terms with Anthropic (see privacy notes in `/privacy`).

## 3. Embeddings — semantic matching 🔧 (optional)

- Today matching uses the curated topic taxonomy, which works without any API.
- To upgrade: implement `getEmbeddingProvider()` in `src/lib/adapters/external.ts`, embed topic labels once, and pass
  the vectors to `embeddingMatcher()` (`src/lib/matching/semantic.ts`) in `runNetwork`. Env: `EMBEDDINGS_API_KEY`.

## 4. Stripe — payments 🔧

- Provide: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, one recurring Price per paid tier (`STRIPE_PRICE_PLUS`,
  `STRIPE_PRICE_PREMIUM`), and set `BELONG_PAYMENTS_PROVIDER=stripe`.
- To write: `stripePayments.createCheckout` / `cancel` in `src/lib/adapters/payments.ts`, and signature verification
  plus `applyPlan(...)` calls in `src/app/api/webhooks/payments/route.ts`. Both files contain step-by-step comments.
- Everything else (plans, limits, upgrade/downgrade UI, admin pricing editor) is done. Keep Stripe prices in step with
  Admin → Subscriptions.

## 5. Email 🔧

- Needed for: email verification, password reset, notification emails. **None of these exist yet** — see `PROJECT_STATUS.md`.
- Provide: a provider key (Resend, Postmark, SES…) as `EMAIL_API_KEY`, and `EMAIL_FROM`.
- To write: `getEmailProvider()` in `src/lib/adapters/notifications.ts`, then the verification and reset flows.

## 6. Push notifications 🔧 (optional)

- In-app notifications work today. For device push implement `getPushProvider()` in the same file (`PUSH_API_KEY`).

## 7. Maps 🔧 (optional)

- BELONG deliberately uses named areas, never coordinates. "In my area" compares town names.
- For distance-aware discovery implement `getMapsProvider()` in `src/lib/adapters/external.ts` (`MAPS_API_KEY`),
  geocoding area names server-side only.

## 8. File storage 🔧 (optional)

- Avatars are generated; no uploads exist. For profile photos implement `getStorageProvider()` (`STORAGE_BUCKET`) and
  add moderation for uploaded images.

## 9. Scheduled network run ✅

- Provide: `CRON_SECRET`, and a scheduler calling `POST /api/cron/network` with `Authorization: Bearer <secret>` every
  10–15 minutes. This expires temporary signals and refreshes matches. (The network also runs whenever a member
  changes what they share.)

## 10. Hosting, domain and secrets 📝

- See `docs/DEPLOYMENT.md`. Set `NEXT_PUBLIC_APP_URL` to the public URL. Store secrets in the host's secret manager.
- Health check: `GET /api/health`.

## 11. External analytics / error monitoring 🔧 (optional)

- First-party aggregate analytics are built in (Admin → Analytics). For error monitoring (e.g. Sentry) add
  `instrumentation.ts`; server errors are currently written to stdout with a `[belong:*]` prefix.

## 12. Legal and safety 📝

- [ ] Have `/privacy`, `/terms` and `/safety` reviewed by a qualified adviser — they are marked as drafts.
- [ ] Register with the ICO, appoint a data-protection lead, and complete a DPIA (the product profiles interests and handles potentially sensitive conversations).
- [ ] Decide retention periods for messages, audit logs and deleted-account backups.
- [ ] Commission an independent security review before launch.
- [ ] Plan moderation staffing and an escalation route for safeguarding concerns.

## Environment variables

| Variable | Required in production | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL/Supabase connection string |
| `BELONG_DEMO_MODE` | Yes (`false`) | Disables all demo behaviour |
| `NEXT_PUBLIC_APP_URL` | Yes | Public base URL |
| `ANTHROPIC_API_KEY` | For live AI | Claude companion |
| `BELONG_CLAUDE_MODEL` | No | Model override |
| `BELONG_AI_PROVIDER` | No | `mock` forces the simulation |
| `CRON_SECRET` | Recommended | Enables the scheduled network run |
| `BELONG_AUTO_MIGRATE` | No | `false` to migrate manually |
| `BELONG_PAYMENTS_PROVIDER`, `STRIPE_*` | For payments | After the Stripe adapter is written |
| `EMAIL_*`, `PUSH_API_KEY`, `EMBEDDINGS_API_KEY`, `MAPS_API_KEY`, `STORAGE_BUCKET` | No | Reserved for the adapters above |
| `DATABASE_FILE` | No | SQLite path for local development |
| `BELONG_INSECURE_COOKIES` | Never in production | Allows session cookies over plain HTTP for local production-mode testing |
