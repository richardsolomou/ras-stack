---
name: database-postgres
version: 1
summary: PostgreSQL through Postgres.js and Drizzle, migrated at startup.
requires: [start-app]
conflicts: [database-sqlite, database-libsql]
dependencies: [drizzle-orm, postgres]
devDependencies: [drizzle-kit]
wires:
  [
    package.json,
    .oxfmtrc.json,
    .github/workflows/ci.yml,
    src/server/app.ts,
    src/server/app.test.ts,
    src/routes/api/health.ts,
    Dockerfile,
    src/db/authSchema.ts,
    src/server/session.ts,
    src/routes/api/auth.$.ts,
  ]
starters: [src/db/schema.ts, drizzle/]
---

# database-postgres

## Use it when

Several replicas share the data, the database is managed outside the application's volume, or the product needs PostgreSQL features. Otherwise `database-sqlite` is simpler and faster for one server.

Supporting both SQLite and PostgreSQL from one codebase, as stl.quest does for self-hosters, is not a recipe feature. Choosing the target from `DATABASE_URL` is eight lines; the cost is everything after: two schemas (`sqliteTable` and `pgTable`), two migration folders, and a compatibility layer over drivers whose transactions differ (stl.quest wraps the synchronous SQLite driver in a serialized async proxy). That layer is specific to each application's queries, so an application that needs it builds it from this recipe and `database-sqlite`'s files.

## Decisions

- **Postgres.js with ten connections, connecting lazily.** `connect` never touches the network, so `createApp` cannot fail on an unreachable server; the first query does. Ten connections suits a small server and a managed database's connection limit.
- **`int8` and `numeric` arrive as numbers.** Postgres.js returns both as strings, and a string compared with or added to a number gives the wrong answer silently; a rate-limit store once returned `resetAt` as a string that way. Values beyond 2^53 lose precision, so store money as integer minor units and very large counters as text.
- **Server notices are dropped.** Migrations raise notices such as `schema "drizzle" already exists, skipping` on every start, which Postgres.js would print with `console.log`.
- **`app().database` is a promise.** Migrating is asynchronous and `createApp` stays synchronous, so server code awaits it: `const database = await app().database`. A failed migration, or a missing `DATABASE_URL`, rejects that promise, the health route reports it, and the deploy never turns healthy; server code that never touches the database, such as `rpc` and the shutdown hook, keeps working, so their tests run without a server. `createApp` attaches a handler so the rejection does not crash the process before anything awaits it. A server that is down at startup keeps the health check failing until the process restarts, which Swarm does for an unhealthy task.
- **The health check is liveness, not readiness.** `/api/health` awaits `app().database`, which proves the process connected and migrated at startup, and runs no query. The image's `HEALTHCHECK` restarts a container after three failures ten seconds apart, so a `SELECT 1` there turned a 30-second database outage into every container restarting at once, which brings nothing back and takes down pages that never touch the database. Postgres.js reconnects by itself once the server returns, and requests that need it fail with a 5xx meanwhile.
- **Migrations take an advisory lock.** Two instances migrating one database at the same time collide even on `CREATE SCHEMA IF NOT EXISTS` (`duplicate key value violates unique constraint "pg_namespace_nspname_index"`), so `migrateDatabase` holds `pg_advisory_lock(hashtext('drizzle-migrations'))` on a reserved connection while Drizzle migrates. The lock is per session, so it is released if the instance dies.
- **Migrations are read from `drizzle/` in the working directory**, which the Dockerfile copies from the commit; this replaces `ras assets sync` and its drift check, and a missing copy fails the health check.
- **`DATABASE_URL` is validated without echoing it**, since the URL carries the password and the error lands in logs.
- **Tests that need no server, plus an integration suite that needs one.** `src/db/database.test.ts` checks the pool, parsers, notices, URL validation, and schema-to-migration drift offline. `src/server/database.integration.test.ts` skips unless `DATABASE_URL` is set and then runs against the real startup connection: a query, numeric parsing, the migration journal, a write, and two instances migrating a fresh database at once. Connecting and closing alone proves nothing, because Postgres.js connects lazily. CI must provide a PostgreSQL service and set `DATABASE_URL` for the suite to run; the database user needs `CREATEDB` for the concurrency test.

## Files

| File                                      | Job                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/db/database.ts`                      | `databaseUrl()`, `connect()`, `openDatabase()`, and `migrateDatabase()` with its lock. |
| `src/db/schema.ts`                        | The Drizzle schema. A starter `note` table; replace it.                                |
| `src/db/database.test.ts`                 | Offline: pool, parsers, notices, URL validation, schema-to-migration drift.            |
| `src/server/database.integration.test.ts` | Against `DATABASE_URL`: the startup connection, migrations, and concurrent migration.  |
| `drizzle/`                                | Generated migrations for the starter schema.                                           |
| `drizzle.config.ts`                       | drizzle-kit configuration for `pnpm db:generate`.                                      |

In a new application, replace the `note` table, delete `drizzle/`, and run `pnpm db:generate` before the first deploy.

## Wiring

See `stacks/postgres/`:

- `src/server/app.ts`: in `createApp`, `const database = Promise.resolve().then(() => openDatabase(databaseUrl()))`, then `const opened = database.catch(() => undefined)` and `resources.defer(async () => (await opened)?.$client.end({ timeout: 5 }))`, and return `database`.
- `src/routes/api/health.ts`: the check becomes `async () => { await app().database }`, with no query; see `stacks/postgres/src/routes/api/health.ts`.
- `src/server/app.test.ts`: stub `DATABASE_URL` to `process.env.DATABASE_URL` or an address nothing listens on (`postgres://app@127.0.0.1:9/app`), so the composition-root tests run offline; the background migration failure is handled.
- `package.json`: add `"db:generate": "drizzle-kit generate"`.
- `.oxfmtrc.json`: add `"ignorePatterns": ["drizzle/meta/"]`.

With `deploy-dokploy`, the `Dockerfile`'s runtime stage keeps `WORKDIR /app` and adds `COPY --from=build --chown=node:node /app/drizzle ./drizzle` after `.output`; `DATABASE_URL` is a Dokploy secret.

With `ci`, `.github/workflows/ci.yml` gets a `database` job beside `check`, because the shared check workflow cannot run services: a `postgres:17-alpine` service with a health check, then `setup-js`, `pnpm build`, and `pnpm test` with `DATABASE_URL` pointing at the service. `check` stays the required status; require `database` too once it is green.

With `auth`, Better Auth is built once the database resolves, so `app().auth` is a promise (see `stacks/postgres/`):

- `src/db/authSchema.ts`: replace it with the `pg-core` equivalent of Better Auth's generator output: `pgTable`, `boolean` for `email_verified`, `timestamp` with `defaultNow()` for dates, and `bigint('last_request', { mode: 'number' })`, then generate the auth migration as `auth` describes.
- `src/server/app.ts`: `const auth = database.then((db) => createAuth(drizzleAdapter(db, { provider: 'pg', schema: authSchema })))`, then `auth.catch(() => undefined)` so a failed migration is not also an unhandled rejection, and return `auth`.
- `src/server/session.ts`: in `currentSession`, look the session up with `app().auth.then((auth) => auth.api.getSession({ headers: request.headers }))`.
- `src/routes/api/auth.$.ts`: `const handle = async ({ request }: { request: Request }) => (await app().auth).handler(request)`.

## Configuration

| Variable       | Where       | Value                                                                                                            |
| -------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Server only | `postgres://user:password@host:5432/database`; add `?sslmode=require` for a managed server. Required everywhere. |

For development: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:17-alpine` and `DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres` in `.env`.

`deploy-dokploy`'s pull request previews get no database: the built-in deploy passes only the `environment` template, which cannot hold a secret, so a preview without `DATABASE_URL` fails its health check and is reported as failed. To give each preview its own database, set the preview workflows' `deploy-script` to a repository script built on `ras-stack/preview/dokploy`, as praetorium.gg does for SpacetimeDB: it reads an admin URL for a preview-only server from the `PREVIEW_APP_SECRETS` secret with `loadPreviewAppSecrets(['DATABASE_ADMIN_URL'])`, creates `<app>_pr_<number>` and a role limited to it, deploys with that `DATABASE_URL`, and drops both on `delete` and `prune`. Never point previews at production's server: a preview runs the pull request's code. Otherwise leave out the preview workflows.

## Verify

- `pnpm dev`, then `curl localhost:3000/api/health` answers `{"ok":true}`, and keeps answering it after the database server stops. Starting the app with the server stopped answers 503.
- `DATABASE_URL=… pnpm test` runs the integration suite instead of skipping it.
