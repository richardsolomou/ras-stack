import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import path from 'node:path'
import postgres from 'postgres'
import * as schema from './schema'

export type AppDatabase = ReturnType<typeof connect>

/** `DATABASE_URL`, checked without echoing it, since it carries the password. */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const url = env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is required')
  if (!URL.canParse(url) || !['postgres:', 'postgresql:'].includes(new URL(url).protocol)) {
    throw new Error('DATABASE_URL must be a postgres:// or postgresql:// URL')
  }
  return url
}

/** A pool of up to ten connections. It connects on the first query, so creating it never fails on an unreachable server. */
export function connect(url: string) {
  const client = postgres(url, {
    max: 10,
    // Migrations raise notices such as "schema already exists, skipping" on every start.
    onnotice: () => undefined,
    // Postgres.js returns int8 and numeric as strings, which compare and add wrongly as numbers; values past 2^53 lose precision.
    types: {
      bigint: { to: 20, from: [20], serialize: (value: number) => String(value), parse: Number },
      numeric: { to: 1700, from: [1700], serialize: (value: number) => String(value), parse: Number },
    },
  })
  return drizzle({ client, schema })
}

/**
 * Connects and applies pending migrations. Migrations resolve from the working directory, which is the application
 * root in development, tests, and the production image.
 */
export async function openDatabase(url: string, migrationsFolder = path.resolve('drizzle')) {
  const database = connect(url)
  try {
    await migrateDatabase(database, migrationsFolder)
    return database
  } catch (error) {
    await database.$client.end({ timeout: 5 })
    throw error
  }
}

/** Instances starting together take turns, since two concurrent migration transactions would both apply the same migration. */
export async function migrateDatabase(database: AppDatabase, migrationsFolder: string) {
  const session = await database.$client.reserve()
  try {
    await session`SELECT pg_advisory_lock(hashtext('drizzle-migrations'))`
    try {
      await migrate(database, { migrationsFolder })
    } finally {
      await session`SELECT pg_advisory_unlock(hashtext('drizzle-migrations'))`
    }
  } finally {
    session.release()
  }
}
