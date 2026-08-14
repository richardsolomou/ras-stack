import { describe, expect, it } from 'vitest'
import { openSqliteClient, sqliteRateLimitStore } from '../database/sqlite.js'
import { InfrastructureError } from './errors.js'
import { createRateLimit, forwardedClientAddress, memoryRateLimitStore, rateLimitTable, type RateLimitStore } from './rate-limit.js'

describe('request rate limiting', () => {
  it('allows a client up to the configured maximum', async () => {
    const limit = createRateLimit({ store: memoryRateLimitStore(), rule: { window: 60, max: 3 }, identify, now: frozen })

    const remaining = []
    for (let attempt = 0; attempt < 3; attempt++) {
      // Each request has to observe the previous increment, so these cannot run in parallel.
      // oxlint-disable-next-line no-await-in-loop
      remaining.push((await limit(request('person-1')))?.remaining)
    }

    expect(remaining).toEqual([2, 1, 0])
  })

  it('rejects the request past the maximum with the seconds left in the window', async () => {
    const limit = createRateLimit({ store: memoryRateLimitStore(), rule: { window: 60, max: 1 }, identify, now: frozen })
    await limit(request('person-1'))

    const rejected = await limit(request('person-1')).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(Response)
    expect((rejected as Response).status).toBe(429)
    expect((rejected as Response).headers.get('retry-after')).toBe('60')
  })

  it('budgets each client separately', async () => {
    const limit = createRateLimit({ store: memoryRateLimitStore(), rule: { window: 60, max: 1 }, identify, now: frozen })
    await limit(request('person-1'))

    await expect(limit(request('person-2'))).resolves.toMatchObject({ remaining: 0 })
  })

  it('budgets each scope separately', async () => {
    const store = memoryRateLimitStore()
    const rule = { window: 60, max: 1 }
    await createRateLimit({ store, rule, identify, scope: 'mutations', now: frozen })(request('person-1'))

    await expect(createRateLimit({ store, rule, identify, scope: 'realtime', now: frozen })(request('person-1'))).resolves.toBeDefined()
  })

  it('starts a new window once the previous one expires', async () => {
    const store = memoryRateLimitStore()
    const rule = { window: 60, max: 1 }
    await createRateLimit({ store, rule, identify, now: () => 1_000_000 })(request('person-1'))

    await expect(createRateLimit({ store, rule, identify, now: () => 1_000_000 + 61_000 })(request('person-1'))).resolves.toBeDefined()
  })

  it('rejects a client it cannot identify', async () => {
    const limit = createRateLimit({ store: memoryRateLimitStore(), rule: { window: 60, max: 1 }, identify: () => undefined, now: frozen })

    const rejected = await limit(request('person-1')).catch((error: unknown) => error)

    expect((rejected as Response).status).toBe(403)
  })

  it('admits an unidentified client when the application opts in', async () => {
    const limit = createRateLimit({
      store: memoryRateLimitStore(),
      rule: { window: 60, max: 1 },
      identify: () => undefined,
      onUnidentified: 'allow',
      now: frozen,
    })

    await expect(limit(request('person-1'))).resolves.toBeUndefined()
  })

  it('classifies a store outage as retryable infrastructure rather than a client fault', async () => {
    const limit = createRateLimit({ store: brokenStore, rule: { window: 60, max: 1 }, identify, now: frozen })

    const rejected = await limit(request('person-1')).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(InfrastructureError)
    expect(rejected).toMatchObject({ code: 'rate_limit_unavailable', retryable: true })
  })

  it('admits a request during a store outage when the application opts in', async () => {
    const limit = createRateLimit({ store: brokenStore, rule: { window: 60, max: 1 }, identify, onUnavailable: 'allow', now: frozen })

    await expect(limit(request('person-1'))).resolves.toBeUndefined()
  })

  it.each([
    { rule: { window: 0, max: 1 }, message: 'rate limit window must be a positive integer' },
    { rule: { window: 60, max: 0 }, message: 'rate limit max must be a positive integer' },
  ])('rejects the $message rule before serving a request', ({ rule, message }) => {
    expect(() => createRateLimit({ store: memoryRateLimitStore(), rule, identify })).toThrow(message)
  })
})

describe('forwarded client address', () => {
  it('ignores a forwarded address the application has not chosen to trust', () => {
    expect(forwardedClientAddress(request('person-1'))).toBeUndefined()
  })

  it('reads the first forwarded address when the proxy is trusted', () => {
    expect(forwardedClientAddress(request('person-1'), { trustForwardedHeaders: true })).toBe('203.0.113.7')
  })
})

describe('SQLite rate limit store', () => {
  it('counts one window across the connections that share the database', () => {
    const client = sqliteFixture()
    const store = sqliteRateLimitStore(client)

    const counts = [store.increment('a', 60, 1000), store.increment('a', 60, 1000), store.increment('b', 60, 1000)]

    expect(counts).toEqual([
      { count: 1, resetAt: 1060 },
      { count: 2, resetAt: 1060 },
      { count: 1, resetAt: 1060 },
    ])
    client.close()
  })

  it('restarts the count once the window has passed', () => {
    const client = sqliteFixture()
    const store = sqliteRateLimitStore(client)
    void store.increment('a', 60, 1000)

    expect(store.increment('a', 60, 1100)).toEqual({ count: 1, resetAt: 1160 })
    client.close()
  })

  it('refuses a table name it cannot safely interpolate', () => {
    expect(() => rateLimitTable('rate_limit; drop table users')).toThrow('rate limit table must be an unquoted SQL identifier')
  })
})

const brokenStore: RateLimitStore = {
  increment() {
    throw new Error('connection terminated')
  },
}

function frozen() {
  return 1_000_000
}

function identify(incoming: Request) {
  return incoming.headers.get('x-person') ?? undefined
}

function request(person: string) {
  return new Request('https://app.example/action', {
    method: 'POST',
    headers: { 'x-person': person, 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
  })
}

function sqliteFixture() {
  const client = openSqliteClient(':memory:')
  client.exec('create table rate_limit (key text primary key, count integer not null, reset_at integer not null)')
  return client
}
