import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import * as schema from './schema'

export { databaseFile } from '../../scripts/databaseFile'

export type AppDatabase = ReturnType<typeof openDatabase>

/**
 * Opens the database with the standard safety settings and applies pending migrations. Migrations resolve from the
 * working directory, which is the application root in development, tests, and the production image.
 */
export function openDatabase(file: string, migrationsFolder = path.resolve('drizzle')) {
  mkdirSync(path.dirname(file), { recursive: true })
  const client = new Database(file)
  try {
    client.pragma('journal_mode = WAL')
    client.pragma('synchronous = FULL')
    client.pragma('busy_timeout = 5000')
    const database = drizzle({ client, schema })
    backUpBeforeMigrating(client, file, migrationsFolder)
    // Drizzle runs migrations in one transaction, where `PRAGMA foreign_keys` is a no-op, so a generated table rebuild
    // would drop the old table with enforcement on and cascade-delete every row that references it.
    client.pragma('foreign_keys = OFF')
    migrate(database, { migrationsFolder })
    const violations = client.pragma('foreign_key_check') as unknown[]
    if (violations.length > 0) throw new Error(`migrations left ${violations.length} foreign key violations`)
    client.pragma('foreign_keys = ON')
    return database
  } catch (error) {
    client.close()
    throw error
  }
}

/** Copies a database that has data and pending migrations to `backups/` beside it, since migrations only go forward. */
function backUpBeforeMigrating(client: Database.Database, file: string, migrationsFolder: string) {
  const latest = readMigrationFiles({ migrationsFolder }).at(-1)?.folderMillis ?? 0
  const tables = client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .pluck()
    .all() as string[]
  if (tables.length === 0) return
  const applied = tables.includes('__drizzle_migrations')
    ? Number(client.prepare('SELECT max(created_at) FROM __drizzle_migrations').pluck().get() ?? 0)
    : 0
  if (applied >= latest) return
  const directory = path.join(path.dirname(file), 'backups')
  mkdirSync(directory, { recursive: true })
  client.prepare('VACUUM INTO ?').run(path.join(directory, `pre-migration-${new Date().toISOString().replaceAll(':', '-')}.sqlite`))
}
