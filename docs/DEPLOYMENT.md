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
BELONG_DEMO_MODE=false
NEXT_PUBLIC_APP_URL=https://your-domain
ANTHROPIC_API_KEY=…            # for the live companion; otherwise the simulation is used
CRON_SECRET=…                  # long random string
```

## Steps

1. **Database.** Create it and run migrations (`npm run db:migrate` with `DATABASE_URL` and `BELONG_DEMO_MODE=false`).
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

### Vercel

Import the repository, add the environment variables, deploy. Use a pooled `DATABASE_URL`. Add a Vercel Cron job for
`/api/cron/network` (Vercel sends the `CRON_SECRET` bearer header automatically when that variable is set).
SQLite cannot be used there — the filesystem is not persistent.

### Containers / VMs

Run `npm ci && npm run build` in the image and `npm start` as the command. The `db/migrations` directory must be
present at runtime (it is included in the build's file tracing; if you copy files selectively, copy it too, or set
`BELONG_MIGRATIONS_DIR`). No Dockerfile is provided yet.

## Operational notes

- **Logging.** Server-side errors go to stdout/stderr prefixed `[belong:action]`, `[belong:ai]`, `[belong:health]`.
  Ship them to your log platform. No error-monitoring service is integrated.
- **Security headers** are set in `next.config.ts` (`nosniff`, `X-Frame-Options: DENY`, referrer policy, and a
  permissions policy that disables camera, microphone and geolocation). A Content-Security-Policy is **not** yet set —
  add one once third-party services (Stripe, analytics) are known.
- **Rate limiting.** Sign-in attempts are throttled in memory per server instance. Behind multiple instances, add
  shared rate limiting at the edge or with a shared store.
- **Scaling the network.** `runNetwork` compares member pairs in-process. That is fine for a launch-sized community;
  see "Known limitations" in `PROJECT_STATUS.md` for the scaling path.
- **Demo mode.** Double-check `BELONG_DEMO_MODE=false`. In demo mode the sign-in page offers one-click access to a
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
