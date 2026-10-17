import { createClient, type Client, type Config } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveSqlitePragmas, type SqlitePragmas } from './pragmas.js'

// The client pools connections and opens each with libsql's defaults, so a per-connection pragma run through `execute`
// reaches only one of them. Those defaults are already synchronous FULL and foreign keys on; the busy timeout goes
// through `timeout`, which every connection receives, and WAL persists in the file once set.
export type LibsqlPragmas = Pick<SqlitePragmas, 'journalMode' | 'busyTimeout'>

export type OpenDrizzleLibsqlOptions<TSchema extends Record<string, unknown>> = {
  file: string
  schema: TSchema
  migrationsFolder?: string
  client?: Omit<Config, 'url'>
  pragmas?: LibsqlPragmas | false
}

export async function openDrizzleLibsql<TSchema extends Record<string, unknown>>(
  options: OpenDrizzleLibsqlOptions<TSchema>,
): Promise<LibSQLDatabase<TSchema> & { $client: Client }> {
  const memory = options.file === ':memory:'
  const pragmas = options.pragmas === false ? undefined : resolveSqlitePragmas(options.pragmas)
  if (!memory) mkdirSync(path.dirname(path.resolve(options.file)), { recursive: true })
  const client = createClient({
    url: memory ? ':memory:' : pathToFileURL(path.resolve(options.file)).href,
    ...(pragmas ? { timeout: pragmas.busyTimeout } : {}),
    ...options.client,
  })
  try {
    if (pragmas) await client.execute(`pragma journal_mode = ${pragmas.journalMode}`)
    const database = drizzle({ client, schema: options.schema })
    if (options.migrationsFolder) await migrate(database, { migrationsFolder: options.migrationsFolder })
    return database
  } catch (error) {
    client.close()
    throw error
  }
}
