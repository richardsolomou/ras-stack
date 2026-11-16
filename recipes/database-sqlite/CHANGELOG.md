# database-sqlite

## 2

The file name is one constant, `databaseFileName` in the new `scripts/databaseFile.ts`, which `src/db/database.ts`, `scripts/database.ts`, and the tests read, so keeping an existing name is one edit. The README describes adopting a database Drizzle's migrator never ran.

Upgrade: an application that changed `app.sqlite` sets `databaseFileName` instead and drops its edits to `databaseFile()` and `databasePath()`. In the Dockerfile, copy `scripts/databaseFile.ts` beside `scripts/database.ts` into `.output/server/`.

## 1

SQLite through better-sqlite3 and Drizzle: safety pragmas, migrations at startup with foreign-key-safe table rebuilds and a pre-migration backup, a schema drift test, and an online backup and validated restore script.
