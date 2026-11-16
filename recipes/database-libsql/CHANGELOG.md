# database-libsql

## 2

The file name is one constant, `databaseFileName` in `src/db/database.ts`, which `databaseFile()` and the tests read, so keeping an existing name is one edit. The README describes adopting a database Drizzle's migrator never ran.

Upgrade: an application that changed `app.sqlite` in `databaseFile()` sets `databaseFileName` instead.

## 1

SQLite through the libsql client and Drizzle: WAL and busy timeout on every pooled connection, migrations at startup with a foreign key check and a pre-migration backup, and a schema drift test.
