import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { rateLimitTable, type RateLimitStore } from '../server/rate-limit.js'

export type SqlitePragmas = {
  journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF'
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA'
  busyTimeout?: number
  foreignKeys?: boolean
}

export type OpenSqliteOptions = {
  database?: Database.Options
  pragmas?: SqlitePragmas | false
}

export function openSqliteClient(file: string, options: OpenSqliteOptions = {}): Database.Database {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  const client = new Database(file, options.database)
  try {
    if (options.pragmas !== false) configureSqlite(client, options.pragmas)
    return client
  } catch (error) {
    client.close()
    throw error
  }
}

export function configureSqlite(client: Database.Database, pragmas: SqlitePragmas = {}): Database.Database {
  const journalMode = pragmas.journalMode ?? 'WAL'
  const synchronous = pragmas.synchronous ?? 'FULL'
  const busyTimeout = pragmas.busyTimeout ?? 5000
  const foreignKeys = pragmas.foreignKeys ?? true
  if (!Number.isInteger(busyTimeout) || busyTimeout < 0) throw new Error('busyTimeout must be a non-negative integer')
  client.pragma(`journal_mode = ${journalMode}`)
  client.pragma(`synchronous = ${synchronous}`)
  client.pragma(`busy_timeout = ${busyTimeout}`)
  client.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`)
  return client
}

export type OpenDrizzleSqliteOptions<TSchema extends Record<string, unknown>> = OpenSqliteOptions & {
  file: string
  schema: TSchema
  migrationsFolder?: string
}

export function openDrizzleSqlite<TSchema extends Record<string, unknown>>(
  options: OpenDrizzleSqliteOptions<TSchema>,
): BetterSQLite3Database<TSchema> & { $client: Database.Database } {
  const client = openSqliteClient(options.file, options)
  try {
    const database = drizzle({ client, schema: options.schema })
    if (options.migrationsFolder) migrate(database, { migrationsFolder: options.migrationsFolder })
    return database
  } catch (error) {
    client.close()
    throw error
  }
}

export function closeDrizzleSqlite(database: { $client: Database.Database }) {
  database.$client.close()
}

// One statement so concurrent requests cannot both read a stale count and write the same increment.
export function sqliteRateLimitStore(client: Database.Database, table = 'rate_limit'): RateLimitStore {
  const name = rateLimitTable(table)
  const statement = client.prepare<[string, number, number, number, number], { count: number; reset_at: number }>(`
    insert into ${name} (key, count, reset_at) values (?, 1, ?)
    on conflict(key) do update set
      count = case when ${name}.reset_at <= ? then 1 else ${name}.count + 1 end,
      reset_at = case when ${name}.reset_at <= ? then ? else ${name}.reset_at end
    returning count, reset_at
  `)
  return {
    increment(key, windowSeconds, now) {
      const resetAt = now + windowSeconds
      const row = statement.get(key, resetAt, now, now, resetAt)
      if (!row) throw new Error('rate limit increment returned no row')
      return { count: row.count, resetAt: row.reset_at }
    },
  }
}
