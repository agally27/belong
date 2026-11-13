# Database

## Local development

Nothing to set up. On first use the app creates `./data/belong.db` (SQLite), applies `db/migrations/*.sql`, seeds
plans, flags and matching weights, and — in demo mode — seeds the fictional demo world.

```bash
npm run db:reset      # delete the local database and start again
```

## Production: PostgreSQL / Supabase

1. Create a database (Supabase project, or any PostgreSQL 14+).
2. Set `DATABASE_URL`. On serverless hosts use Supabase's connection **pooler** string.
3. Set `BELONG_DEMO_MODE=false`.
4. Start the app (migrations apply automatically), or run them yourself first:

   ```bash
   DATABASE_URL=... BELONG_DEMO_MODE=false npm run db:migrate
   ```

   and set `BELONG_AUTO_MIGRATE=false` if you prefer the app never to migrate on start.
5. Register your account in the app, then: `DATABASE_URL=... npm run db:make-admin -- you@example.com`.

The same schema and services are verified on PostgreSQL 16:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/belong_test npm run test:pg
```

(The test **drops the public schema** of the database it is given. Use a disposable one.)

## How portability works

All SQL is written in a subset that runs unchanged on SQLite and PostgreSQL:

| Concern | Convention |
| --- | --- |
| Ids | `TEXT`, UUID v4 generated in the app |
| Timestamps | `TEXT`, ISO-8601 UTC (sortable as strings) |
| Booleans | `INTEGER` 0/1 |
| Structured values | `TEXT` containing JSON |
| Placeholders | `?` in code; the Postgres driver rewrites to `$1…` |
| Upserts | `INSERT … ON CONFLICT (…) DO UPDATE/NOTHING` |
| Time arithmetic | done in JavaScript, never in SQL |

Symmetric pairs (`matches`, `connections`) are stored once with `user_a < user_b`.

### Moving to native PostgreSQL types later (optional)

The portable types work indefinitely. If you want `uuid`, `timestamptz`, `boolean` and `jsonb` columns — for
example to use Supabase tooling more comfortably — add a Postgres-only migration that alters the column types
(`ALTER TABLE … ALTER COLUMN … TYPE timestamptz USING …::timestamptz`), and update the few places that compare
booleans (`= 1`) or pass ISO strings. At that point local development should move to Postgres too.

## Migrations

- Files in `db/migrations`, applied in filename order, recorded in `schema_migrations`.
- Add a new numbered file for every change (`0002_….sql`). Never edit a migration that has been applied anywhere.
- Each file runs in a transaction.

## Row Level Security

The application connects from the server with a single database role and enforces every permission in
`src/lib/services`. Supabase RLS is therefore **not** part of the security model today. If you later let browsers
talk to Supabase directly (client libraries, Realtime), enable RLS and write policies for every table first —
the natural policies mirror the service checks (`user_id = auth.uid()` for memories, companion messages, consents,
signals; membership checks for conversations and messages).

## Tables

| Group | Tables |
| --- | --- |
| Identity | `users`, `sessions`, `profiles`, `consents` |
| Companion (private) | `companions`, `companion_messages`, `memories`, `intentions` |
| Agent network | `signals`, `matches` |
| Connection | `introductions`, `connections`, `conversations`, `messages`, `conversation_reads` |
| Community | `circles`, `circle_members`, `events`, `event_rsvps` |
| Safety | `blocks`, `reports`, `audit_log` |
| Commercial & config | `plans`, `subscriptions`, `feature_flags`, `app_settings` |
| Other | `notifications`, `analytics_events`, `support_tickets` |

Deleting a `users` row cascades through everything that member owns. `eraseUser` additionally removes their sent
messages and redacts their id from the audit log.

## Backups

Not configured. Enable point-in-time recovery or daily backups with your database provider, and decide how long
backups containing deleted members' data are retained.
