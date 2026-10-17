import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDrizzlePostgres, type DrizzlePostgresConnection } from './postgres.js'

// Skipped without a server so the default suite stays offline; CI supplies one so the published connection actually runs.
const url = process.env.RAS_STACK_POSTGRES_URL

describe.skipIf(!url)('PostgreSQL against a running server', () => {
  let connection: DrizzlePostgresConnection<Record<string, never>>

  beforeAll(() => {
    connection = openDrizzlePostgres({ url: url!, schema: {}, client: { max: 4 } })
  })

  afterAll(async () => {
    await connection?.client.end({ timeout: 5 })
  })

  it('answers a query through Drizzle and the real driver', async () => {
    const rows = await connection.database.execute<{ one: number }>(sql`select 1 as one`)

    expect(rows[0]?.one).toBe(1)
  })

  it('parses bigint and numeric columns as numbers', async () => {
    const rows = await connection.database.execute<{ count: unknown; amount: unknown }>(
      sql`select 42::bigint as count, 1.5::numeric as amount`,
    )

    expect(rows[0]).toEqual({ count: 42, amount: 1.5 })
  })
})
