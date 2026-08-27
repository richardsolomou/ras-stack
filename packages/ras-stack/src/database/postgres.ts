import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { type Sql } from 'postgres'
import { rateLimitTable, type RateLimitStore } from '../server/rate-limit.js'

export type PostgresClientOptions = NonNullable<Parameters<typeof postgres>[1]>

export type OpenDrizzlePostgresOptions<TSchema extends Record<string, unknown>> = {
  url: string
  schema: TSchema
  client?: PostgresClientOptions
}

export type DrizzlePostgresConnection<TSchema extends Record<string, unknown>> = {
  database: PostgresJsDatabase<TSchema>
  client: Sql
}

export function openDrizzlePostgres<TSchema extends Record<string, unknown>>(
  options: OpenDrizzlePostgresOptions<TSchema>,
): DrizzlePostgresConnection<TSchema> {
  const client = postgres(options.url, {
    max: 10,
    onnotice: () => undefined,
    types: {
      bigint: { to: 20, from: [20], serialize: (value: number) => String(value), parse: Number },
      numeric: { to: 1700, from: [1700], serialize: (value: number) => String(value), parse: Number },
    },
    ...options.client,
  })
  const database = drizzle(client, { schema: options.schema })
  return { database, client }
}

export async function migrateDrizzlePostgres<TSchema extends Record<string, unknown>>(
  connection: DrizzlePostgresConnection<TSchema>,
  migrationsFolder: string,
) {
  await migrate(connection.database, { migrationsFolder })
}

export async function closeDrizzlePostgres(connection: Pick<DrizzlePostgresConnection<Record<string, unknown>>, 'client'>, timeout = 5) {
  await connection.client.end({ timeout })
}

// One statement so concurrent replicas cannot both read a stale count and write the same increment.
export function postgresRateLimitStore(client: Sql, table = 'rate_limit'): RateLimitStore {
  const name = client(rateLimitTable(table))
  return {
    async increment(key, windowSeconds, now) {
      const resetAt = now + windowSeconds
      const [row] = await client<{ count: number | string; reset_at: number | string }[]>`
        insert into ${name} (key, count, reset_at) values (${key}, 1, ${resetAt})
        on conflict (key) do update set
          count = case when ${name}.reset_at <= ${now} then 1 else ${name}.count + 1 end,
          reset_at = case when ${name}.reset_at <= ${now} then ${resetAt} else ${name}.reset_at end
        returning count, reset_at
      `
      if (!row) throw new Error('rate limit increment returned no row')
      // A bigint column arrives as a string unless the client configures a parser, and the store owns its own type.
      return { count: Number(row.count), resetAt: Number(row.reset_at) }
    },
  }
}

export function redactedPostgresUrl(source: string) {
  const url = new URL(source)
  url.username = ''
  url.password = ''
  return url.toString()
}
