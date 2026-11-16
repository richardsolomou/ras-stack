---
name: database-sqlite
version: 2
summary: SQLite through better-sqlite3 and Drizzle, migrated at startup, with online backup and validated restore.
requires: [start-app]
conflicts: [database-libsql, database-postgres]
dependencies: [better-sqlite3, drizzle-orm]
devDependencies: [drizzle-kit, '@types/better-sqlite3']
wires:
  [
    package.json,
    pnpm-workspace.yaml,
    .gitignore,
    .oxfmtrc.json,
    src/server/app.ts,
    src/server/app.test.ts,
    src/routes/api/health.ts,
    Dockerfile,
  ]
starters: [src/db/schema.ts, drizzle/]
---

# database-sqlite

## Use it when

The application runs as one Node server with a persistent volume, which is every Dokploy application by default. SQLite on the same disk is the fastest and simplest database there is, and a backup is one file.

Use `database-libsql` instead when the image must install without native build scripts (cross-architecture builds) or the database may later move to Turso. Use `database-postgres` when several replicas share the data or the database is managed elsewhere. None of them works on Cloudflare Workers.

## Decisions

- **better-sqlite3, synchronously.** Queries return values, not promises, so `app().database` is ready the moment `createApp` returns and transactions are plain synchronous functions. The cost is that a slow query blocks the event loop; keep queries indexed and small. Drizzle's async transaction callbacks do not work with this driver, so Better Auth's Drizzle adapter must keep its default non-transactional mode.
- **Safety pragmas are set explicitly on the one connection:** WAL so readers never block the writer, `synchronous = FULL` so a committed write survives power loss, a five-second busy timeout so a second process (the backup script, a migration) waits instead of failing with `SQLITE_BUSY`, and foreign keys on. better-sqlite3 compiles in most of these defaults, but stating them makes the conformance tests in `src/server/database.test.ts` the contract rather than a build flag.
- **Migrations run at startup, before anything serves a request.** `openDatabase` applies `drizzle/` inside `createApp`, so the first `app()` call, which the health route makes, fails if a migration fails, and the deploy never turns healthy.
- **Foreign keys are off while migrating, then checked.** Drizzle runs every pending migration in one transaction, and SQLite ignores `PRAGMA foreign_keys` inside a transaction, so the `PRAGMA foreign_keys=OFF` drizzle-kit writes into a table rebuild does nothing. With enforcement on, the rebuild's `DROP TABLE` cascade-deletes every row that references the table; the test `rebuilds a referenced table without deleting the rows that reference it` loses the child row without this. After migrating, `PRAGMA foreign_key_check` runs, and any violation stops startup. The check runs on every start, so the application keeps refusing to start until the data is repaired.
- **A backup before every schema change.** Migrations only go forward; undoing one means restoring, which loses every write since the backup. So write migrations the previous release still runs against (add a column now, drop the old one a release later) and fix a bad one forward. When migrations are pending and the database already has tables, `VACUUM INTO` writes `$DATA_DIR/backups/pre-migration-<time>.sqlite` first. One file accumulates per schema-changing deploy; prune them with the other backups.
- **Migrations are read from `drizzle/` in the working directory.** That is the application root in development, in tests, under `vite preview`, and in the production image, where the deploy recipe copies `drizzle/` beside `.output/`. A `COPY drizzle ./drizzle` in the Dockerfile copies straight from the commit rather than from a copy in the build output, so there is nothing to drift, and a missing copy fails loudly (`Can't find meta/_journal.json file`, health 503) instead of serving an unmigrated schema.
- **`DATA_DIR` is required in production.** Without it the database would be written inside the container and lost on the next deploy. Development defaults to `.data/`, which is git-ignored.
- **One schema, one test that it matches the migrations.** `has a migration for every schema change` diffs `src/db/schema.ts` against the latest drizzle-kit snapshot, so a schema edit without `pnpm db:generate` fails the tests instead of failing in production on a missing column.
- **Online backup and validated restore in `scripts/database.ts`.** Backup opens the source read-write, because a read-only connection to a WAL database cannot remove `-wal` and `-shm` when it closes, and restore would then refuse; it checks the source with `quick_check`, copies it with SQLite's online backup API while the application runs, switches the copy out of WAL so it is one self-contained file, and checks it again. Restore runs only with the application stopped: it refuses while `-wal` or `-shm` exists (a clean shutdown removes both), validates the candidate, copies it beside the database and validates that copy, renames the current file to `app.sqlite.before-restore-<time>`, and renames the copy into place. If the final rename fails it renames the original back and removes the temporary copy, reporting every failure together. The script imports only `better-sqlite3` and Node built-ins, so Node runs the TypeScript file directly, in development and in the production image.
- **The tests assert the startup connection.** `src/server/database.test.ts` reads pragmas and the migration journal from `app().database`, so a change to how `createApp` opens the database cannot pass with a correctly configured connection opened elsewhere.

## Files

| File                          | Job                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `src/db/database.ts`          | `openDatabase()`: pragmas, pre-migration backup, migrations, FK check.               |
| `scripts/databaseFile.ts`     | `databaseFileName` and `databaseFile()`, which the application and the backup share. |
| `src/db/schema.ts`            | The Drizzle schema. A starter `note` table; replace it.                              |
| `src/db/database.test.ts`     | Migration safety, backups, `DATA_DIR`, and schema-to-migration drift.                |
| `src/server/database.test.ts` | Conformance of the real startup connection: pragmas, location, migrations, a query.  |
| `drizzle/`                    | Generated migrations for the starter schema.                                         |
| `drizzle.config.ts`           | drizzle-kit configuration for `pnpm db:generate`.                                    |
| `scripts/database.ts`         | `backup [destination]` and `restore <file>`.                                         |
| `scripts/database.test.ts`    | Round trip, corrupt input, open-database refusal, and every rollback failure path.   |

In a new application, replace the `note` table in `src/db/schema.ts`, delete `drizzle/`, and run `pnpm db:generate` before the first deploy.

In an existing application, keep its database file name and its migrations. Set `databaseFileName` in `scripts/databaseFile.ts` to the file the deployment already has, because the recipe's name would point production at a new, empty database; the application, the backup script, and the tests all read it there. It lives in `scripts/` because the production image runs the backup script alone, and the script must not import application code. Keep the application's own `src/db/schema.ts` and `drizzle/` instead of the recipe's starter ones: Drizzle applies every migration newer than the last one recorded in `__drizzle_migrations`, so a replaced history either runs the starter migration against existing tables or leaves the next schema change unapplied.

An existing database that Drizzle's migrator never ran, such as one migrated by the application's own runner, has no `__drizzle_migrations` table, so `openDatabase` would replay the first migration against existing tables and fail. Before the first start with the recipe, record what is already applied: create the table as Drizzle does (`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)`) and insert a row for the last migration the database has, with `created_at` set to that migration's `when` in `drizzle/meta/_journal.json`. Drizzle compares only the latest `created_at`, so later migrations then apply as usual. Do it once, in a deploy step or a one-off script against a backup first. Where that is not practical, keep the application's own runner, skip the recipe's migration call, and record that as a note.

## Wiring

See `stacks/full-stack/`:

- `src/server/app.ts`: import `databaseFile` and `openDatabase` from `../db/database`, and in `createApp` add `const database = resources.adopt(openDatabase(databaseFile()), (db) => { db.$client.close() })` and return `database`. The braces matter: `close()` returns the client, and `adopt` requires a cleanup returning `void`.
- `src/routes/api/health.ts`: the check becomes `() => { app().database.get(sql\`SELECT 1\`) }`.
- `src/server/app.test.ts`: stub `DATA_DIR` to a temporary directory in `beforeAll` and remove it in `afterAll`, so the composition-root tests do not migrate the development database.
- `package.json`: add `"db:generate": "drizzle-kit generate"`, `"db:backup": "node scripts/database.ts backup"`, and `"db:restore": "node scripts/database.ts restore"`.
- `pnpm-workspace.yaml`: add `better-sqlite3: true` to `allowBuilds`, since it compiles or downloads its native binding at install.
- `.gitignore`: add `.data/`.
- `.oxfmtrc.json`: add `"ignorePatterns": ["drizzle/meta/"]`, so drizzle-kit's generated snapshots do not fail `format:check` after every `db:generate`.

With `deploy-dokploy`, the `Dockerfile`'s runtime stage must:

- keep `WORKDIR /app` and start the server from there (`node .output/server/index.mjs`), since migrations resolve from the working directory;
- `COPY drizzle ./drizzle`;
- `COPY scripts/database.ts scripts/databaseFile.ts .output/server/`, so the script resolves `better-sqlite3` from the `node_modules` Nitro traces into `.output/server`, beside the file name it shares with the application;
- keep `DATA_DIR=/data` and mount the volume there;
- build `better-sqlite3` for the target architecture (`python3 make g++` in the build stage on Alpine, or a matching prebuilt binary).

`deploy-dokploy`'s Dockerfile already does the first, fourth, and fifth; add the two `COPY --from=build` lines after `.output`, as in `stacks/full-stack/Dockerfile`.

The backup then runs as `docker exec <container> node .output/server/database.ts backup`. With `auth`, pass `app().database` to Better Auth's Drizzle adapter with `provider: 'sqlite'` and without `transaction: true`.

## Configuration

| Variable   | Where       | Value                                                                                                    |
| ---------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `DATA_DIR` | Server only | Absolute path of the persistent volume, such as `/data`. Required in production; `.data` in development. |

## Verify

- `pnpm dev`, then `curl localhost:3000/api/health` answers `{"ok":true}` and `.data/app.sqlite` exists.
- Add a column to the schema without generating: `pnpm test` fails `has a migration for every schema change`. Run `pnpm db:generate` and it passes; the next start writes a `pre-migration-*.sqlite` to `.data/backups/`.
- `pnpm db:backup` prints a backup path while the server runs. Stop the server, then `pnpm db:restore <path>` restores it; with the server running it refuses.
- Before relying on backups, restore one from production into a fresh volume with the production image, start it, and check the data, uploads included: a backup that has never been restored is not a recovery plan.
- In the production image, removing `drizzle/` makes `/api/health` answer 503 and logs `Can't find meta/_journal.json file`.
