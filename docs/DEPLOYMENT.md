# Deployment

BELONG has **not been deployed anywhere**. This is how to do it when you are ready.

## What it needs

- Node.js 22.5+ and the output of `npm run build`
- A PostgreSQL database (`DATABASE_URL`) — see `docs/DATABASE.md`
- The environment variables in `INTEGRATION_CHECKLIST.md`

It is a standard Next.js 16 server application (`npm start`), so it runs on any Node host: Vercel, Railway, Render,
Fly.io, a container platform or a VM.

## Minimum production configuration

```
DATABASE_URL=postgres://…
# BELONG_DEMO_MODE stays unset: demo mode is off whenever DATABASE_URL is set
NEXT_PUBLIC_APP_URL=https://your-domain
ANTHROPIC_API_KEY=…            # for the live companion; otherwise the simulation is used
CRON_SECRET=…                  # long random string
```

## Steps

1. **Database.** Create it and run migrations (`npm run db:migrate` with `DATABASE_URL` set).
2. **Build and start.**
   ```bash
   npm ci
   npm run build
   npm start            # listens on $PORT (default 3000)
   ```
3. **HTTPS.** Serve only over HTTPS. Session cookies are `Secure` in production and will not be set over plain HTTP.
4. **First administrator.** Register in the app, then `npm run db:make-admin -- you@example.com`.
5. **Health check.** Point your platform at `GET /api/health` (returns `{"status":"ok", …}`; 503 if the database is unreachable).
6. **Scheduler.** Call `POST /api/cron/network` with `Authorization: Bearer $CRON_SECRET` every 10–15 minutes.
7. **Smoke test.** Sign in, chat with the companion, open Admin → Overview and confirm the service status panel shows
   PostgreSQL and (if configured) Claude.

### Vercel + Supabase (recommended)

`vercel.json` already sets the London region (`lhr1`) and a daily run of the matching network.

1. **Supabase**: create a project in the **London** region. In Project settings → Database, copy the connection
   string for the **connection pooler** (Vercel opens many short-lived connections; the pooler handles that).
2. **Vercel**: Add New → Project → import the GitHub repository. Framework is detected as Next.js; no build
   settings need changing.
3. **Environment variables** (Production): `DATABASE_URL` (the pooler string), `APP_URL` (your public URL, e.g.
   `https://belong.example`), `CRON_SECRET` (a long random string), and when ready `ANTHROPIC_API_KEY` and the email
   settings. **Don't set `BELONG_DEMO_MODE`** — on Vercel production it is off by default.
4. **Deploy.** Migrations apply on first start (safely, even if several instances start together). Or run them
   beforehand: `DATABASE_URL=… npm run db:migrate`.
5. **First administrator**: register on the live site, then `DATABASE_URL=… npm run db:make-admin -- you@example.com`.
6. **Domain**: Vercel → Settings → Domains. Then update `APP_URL` to match.
7. **Check**: `https://<your-domain>/api/health` should report `"database":"postgres"` and `"demoMode":false`.

Notes:
- **Cron frequency.** The Hobby (free) plan only allows a cron once a day, and Vercel rejects a deployment with
  anything more frequent — so `vercel.json` runs at 04:17 UTC daily. On Pro, change the schedule to
  `"*/15 * * * *"` for fresher matching. Matching also runs whenever a member changes what they share, so daily is
  workable at launch.
- **Previews.** Preview deployments with a database are also non-demo unless you set `BELONG_DEMO_MODE=true` on the
  Preview environment (useful for a shareable demo, but use a separate database).
- **No database set?** The app fails with a clear "DATABASE_URL is not set" message: SQLite can't work on Vercel.

### Containers / VMs

Run `npm ci && npm run build` in the image and `npm start` as the command. The `db/migrations` directory must be
present at runtime (it is included in the build's file tracing; if you copy files selectively, copy it too, or set
`BELONG_MIGRATIONS_DIR`). No Dockerfile is provided yet.

## Operational notes

- **Logging.** Server-side errors go to stdout/stderr prefixed `[belong:action]`, `[belong:ai]`, `[belong:health]`.
  Ship them to your log platform. No error-monitoring service is integrated.
- **Security headers** are set in `next.config.ts` (`nosniff`, `X-Frame-Options: DENY`, referrer policy, and a
  permissions policy that disables camera, microphone and geolocation). A strict, nonce-based Content-Security-Policy is
  set in `src/proxy.ts`. When you connect a third-party service (Stripe Checkout, analytics, error monitoring),
  add its hosts to that policy or the browser will block it.
- **Rate limiting.** Sign-in attempts are throttled in memory per server instance. Behind multiple instances, add
  shared rate limiting at the edge or with a shared store.
- **Scaling the network.** `runNetwork` compares member pairs in-process. That is fine for a launch-sized community;
  see "Known limitations" in `PROJECT_STATUS.md` for the scaling path.
- **Demo mode.** Check `/api/health` reports `"demoMode":false` (the default with a real database). In demo mode the sign-in page offers one-click access to a
  demo administrator.

## Pre-launch checklist

- [ ] `npm run check` passes on the commit being deployed
- [ ] Demo mode off; no `@belong.example` accounts in the production database
- [ ] HTTPS only; `NEXT_PUBLIC_APP_URL` correct
- [ ] Database backups enabled
- [ ] Email verification and password reset implemented (requires an email provider)
- [ ] Legal pages reviewed; ICO registration and DPIA complete
- [ ] Independent security review
- [ ] Moderation cover arranged
