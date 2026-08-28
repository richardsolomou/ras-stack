import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertRateLimitStoreConformance } from '../conformance/index.js'
import { postgresRateLimitStore } from './postgres.js'

// Skipped without a server so the default suite stays offline; CI supplies one so the published SQL actually runs.
const url = process.env.RAS_STACK_POSTGRES_URL

describe.skipIf(!url)('PostgreSQL against a running server', () => {
  let client: postgres.Sql

  beforeAll(async () => {
    client = postgres(url!, { max: 4, onnotice: () => undefined })
    await client`create table if not exists rate_limit (key text primary key, count integer not null, reset_at bigint not null)`
    await client`truncate rate_limit`
  })

  afterAll(async () => {
    await client?.end({ timeout: 5 })
  })

  it('answers a query through the real driver', async () => {
    const [row] = await client<{ one: number }[]>`select 1 as one`

    expect(row?.one).toBe(1)
  })

  it('satisfies the rate limit store contract', async () => {
    await expect(assertRateLimitStoreConformance(postgresRateLimitStore(client))).resolves.toBeUndefined()
  })

  // The reason the store exists: replicas increment the same key at once and none of them may read a stale count.
  it('gives every concurrent increment its own count', async () => {
    const store = postgresRateLimitStore(client)
    const key = `concurrent-${Date.now()}`

    const increments = Array.from({ length: 25 }, () => Promise.resolve(store.increment(key, 60, 1_000)))

    const counts = (await Promise.all(increments)).map((counter) => counter.count)

    expect(counts.toSorted((first, second) => first - second)).toEqual(Array.from({ length: 25 }, (_value, index) => index + 1))
  })

  it('rolls the window over once it has elapsed', async () => {
    const store = postgresRateLimitStore(client)
    const key = `window-${Date.now()}`
    const first = await store.increment(key, 60, 1_000)

    expect(await store.increment(key, 60, first.resetAt)).toEqual({ count: 1, resetAt: first.resetAt + 60 })
  })
})
