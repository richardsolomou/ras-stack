---
name: database-libsql
version: 1
summary: SQLite through the libsql client and Drizzle, migrated at startup, with no native build step.
requires: [start-app]
conflicts: [database-sqlite, database-postgres]
dependencies: ['@libsql/client', drizzle-orm]
devDependencies: [drizzle-kit]
wires:
  [
    package.json,
    .gitignore,
    .oxfmtrc.json,
    src/server/app.ts,
    src/server/app.test.ts,
    src/routes/api/health.ts,
    Dockerfile,
    src/server/session.ts,
    src/routes/api/auth.$.ts,
  ]
starters: [src/db/schema.ts, drizzle/]
---

# database-libsql

## Use it when

The application wants a local SQLite file but `database-sqlite` does not fit: the image is built for another architecture with `pnpm install --ignore-scripts` (libsql ships prebuilt platform packages and runs no install script), or the database may later move to a remote libsql server such as Turso by changing the URL. Praetorium uses it for these reasons.

Otherwise prefer `database-sqlite`: its synchronous driver is simpler and it has the backup and restore script. Use `database-postgres` for several replicas or a managed database.

## Decisions

- **The client is a pool, so settings go where every connection gets them.** `@libsql/client` opens up to 20 connections to a local file, each with libsql's defaults, so a pragma sent through `execute` reaches only one. The busy timeout goes through the client's `timeout` option, which every connection receives; WAL is set once and persists in the file; synchronous FULL and foreign keys on are libsql's defaults. `src/server/database.test.ts` reads all four from the startup client so a libsql default changing fails a test.
- **`app().database` is a promise.** Setting WAL and migrating are asynchronous and `createApp` stays synchronous, so server code awaits it: `const database = await app().database`. A failed migration rejects that promise, the health route reports it, and the deploy never turns healthy. `createApp` attaches a handler so the rejection does not crash the process before anything awaits it, and closes the client only if it opened.
- **Migrations run at startup with foreign keys off, then are checked.** libsql's `migrate` turns foreign keys off for the migration batch, so a drizzle-kit table rebuild cannot cascade-delete referencing rows (the test proves this stays true). Violations the migration leaves behind are found by `PRAGMA foreign_key_check` after it, and stop startup on every start until repaired.
- **A backup before every schema change.** When migrations are pending and the database has tables, `VACUUM INTO` writes `$DATA_DIR/backups/pre-migration-<time>.sqlite` first, because migrations only go forward.
- **Migrations are read from `drizzle/` in the working directory**, for the same reasons as `database-sqlite`: the Dockerfile copies `drizzle/` from the commit, so no build output can drift, and a missing copy fails the health check.
- **`DATA_DIR` is required in production**, so data never lands inside the container. Development defaults to `.data/`.
- **The default pool size stays.** Praetorium sets `concurrency: 1`; with one connection an open interactive transaction makes every other query fail with `TRANSACTION_ACTIVE` instead of waiting, so the recipe keeps libsql's 20 and an application that needs strict serialization sets it itself.
- **No backup script.** The online backup API belongs to better-sqlite3; with libsql, `VACUUM INTO` through the client gives a consistent copy, and an application that needs restore tooling copies `scripts/database.ts` from `database-sqlite` and adds `better-sqlite3` for it.

## Files

| File                          | Job                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/db/database.ts`          | `databaseFile()`, `openDatabase()`: client settings, pre-migration backup, migrations, FK check. |
| `src/db/schema.ts`            | The Drizzle schema. A starter `note` table; replace it.                                          |
| `src/db/database.test.ts`     | Migration safety, backups, `DATA_DIR`, and schema-to-migration drift.                            |
| `src/server/database.test.ts` | Conformance of the real startup client: pragmas, location, migrations, a query.                  |
| `drizzle/`                    | Generated migrations for the starter schema.                                                     |
| `drizzle.config.ts`           | drizzle-kit configuration for `pnpm db:generate`.                                                |

In a new application, replace the `note` table, delete `drizzle/`, and run `pnpm db:generate` before the first deploy.

In an existing application, keep its database file name and its migrations. Change `app.sqlite` in `databaseFile()` to the file the deployment already has, because the recipe's name would point production at a new, empty database. Keep the application's own `src/db/schema.ts` and `drizzle/` instead of the recipe's starter ones: Drizzle applies every migration newer than the last one recorded in `__drizzle_migrations`, so a replaced history either runs the starter migration against existing tables or leaves the next schema change unapplied.

## Wiring

See `stacks/spacetime/`:

- `src/server/app.ts`: in `createApp`, `const database = openDatabase(databaseFile())`, then `const opened = database.catch(() => undefined)` and `resources.defer(async () => (await opened)?.$client.close())`, and return `database`.
- `src/routes/api/health.ts`: the check becomes `async () => { await (await app().database).get(sql\`SELECT 1\`) }`.
- `src/server/app.test.ts`: stub `DATA_DIR` to a temporary directory, as in `database-sqlite`.
- `package.json`: add `"db:generate": "drizzle-kit generate"`.
- `.gitignore`: add `.data/`. `.oxfmtrc.json`: add `"ignorePatterns": ["drizzle/meta/"]`.

With `deploy-dokploy`, the `Dockerfile`'s runtime stage keeps `WORKDIR /app` and `DATA_DIR=/data` on the volume, and adds `COPY --from=build --chown=node:node /app/drizzle ./drizzle` after `.output`. Nitro traces the build platform's `@libsql/<platform>` package into `.output/server/node_modules`; an image built for another architecture must replace it with the target's (Praetorium's `Dockerfile.node` installs production dependencies with `--os`, `--libc`, and `--cpu` and copies `@libsql/linux-*` over it). With `auth`, Better Auth is built once the database resolves, so `app().auth` is a promise (see `stacks/spacetime/`):

- `src/server/app.ts`: `const auth = database.then((db) => createAuth(drizzleAdapter(db, { provider: 'sqlite', schema: authSchema })))`, then `auth.catch(() => undefined)` so a failed migration is not also an unhandled rejection, and return `auth`.
- `src/server/session.ts`: in `currentSession`, look the session up with `app().auth.then((auth) => auth.api.getSession({ headers: request.headers }))`.
- `src/routes/api/auth.$.ts`: `const handle = async ({ request }: { request: Request }) => (await app().auth).handler(request)`.

## Configuration

| Variable   | Where       | Value                                                                                                    |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `DATA_DIR` | Server only | Absolute path of the persistent volume, such as `/data`. Required in production; `.data` in development. |

## Verify

- `pnpm dev`, then `curl localhost:3000/api/health` answers `{"ok":true}` and `.data/app.sqlite` exists.
- A schema edit without `pnpm db:generate` fails `has a migration for every schema change`; after generating, the next start writes a `pre-migration-*.sqlite` to `.data/backups/`.
