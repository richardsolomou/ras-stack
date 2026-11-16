import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as schema from './schema'

export type AppDatabase = Awaited<ReturnType<typeof openDatabase>>

/** The database's file name in `DATA_DIR`. An existing application sets the name its deployments already have. */
export const databaseFileName = 'app.sqlite'

/** `$DATA_DIR/<databaseFileName>`; `DATA_DIR` is required in production so data never lands in the container's own filesystem. */
export function databaseFile(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATA_DIR && env.NODE_ENV === 'production') throw new Error('DATA_DIR is required in production')
  return path.join(path.resolve(env.DATA_DIR ?? '.data'), databaseFileName)
}

/**
 * Opens the database with the standard safety settings and applies pending migrations. Migrations resolve from the
 * working directory, which is the application root in development, tests, and the production image.
 */
export async function openDatabase(file: string, migrationsFolder = path.resolve('drizzle')) {
  mkdirSync(path.dirname(file), { recursive: true })
  // The client pools connections, so a per-connection pragma sent through `execute` reaches only one of them. Every
  // connection gets `timeout` as its busy timeout and opens with synchronous FULL and foreign keys on; WAL persists in the file.
  const client = createClient({ url: pathToFileURL(file).href, timeout: 5000 })
  try {
    await client.execute('PRAGMA journal_mode = WAL')
    const database = drizzle({ client, schema })
    await backUpBeforeMigrating(client, file, migrationsFolder)
    // libsql runs the migration batch with foreign keys off, so a table rebuild cannot cascade; check what it left behind.
    await migrate(database, { migrationsFolder })
    const violations = await client.execute('PRAGMA foreign_key_check')
    if (violations.rows.length > 0) throw new Error(`migrations left ${violations.rows.length} foreign key violations`)
    return database
  } catch (error) {
    client.close()
    throw error
  }
}

/** Copies a database that has data and pending migrations to `backups/` beside it, since migrations only go forward. */
async function backUpBeforeMigrating(client: Client, file: string, migrationsFolder: string) {
  const latest = readMigrationFiles({ migrationsFolder }).at(-1)?.folderMillis ?? 0
  const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map(
    (row) => row.name,
  )
  if (tables.length === 0) return
  const applied = tables.includes('__drizzle_migrations')
    ? Number((await client.execute('SELECT max(created_at) FROM __drizzle_migrations')).rows[0]?.[0] ?? 0)
    : 0
  if (applied >= latest) return
  const directory = path.join(path.dirname(file), 'backups')
  mkdirSync(directory, { recursive: true })
  await client.execute({
    sql: 'VACUUM INTO ?',
    args: [path.join(directory, `pre-migration-${new Date().toISOString().replaceAll(':', '-')}.sqlite`)],
  })
}
