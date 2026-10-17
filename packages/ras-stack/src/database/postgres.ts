import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'

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
