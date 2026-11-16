import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { realtimeSecret, realtimeTicket, signRealtimeToken, type RealtimePolicy, type RealtimeViewer } from './realtime'

beforeEach(() => {
  vi.stubEnv('APP_URL', undefined)
  vi.stubEnv('TRUST_PROXY', undefined)
})
afterEach(() => vi.unstubAllEnvs())

const secret = 'secret'
const now = 100_000
const ada: RealtimeViewer = { id: 'user-1', info: { name: 'Ada' } }

function decode(token: string) {
  const [header, payload, signature] = token.split('.')
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return {
    header: JSON.parse(Buffer.from(header!, 'base64url').toString()) as unknown,
    payload: JSON.parse(Buffer.from(payload!, 'base64url').toString()) as unknown,
    signed: signature === expected,
  }
}

function ticketRequest(
  body: unknown,
  headers: Record<string, string> = { origin: 'https://app.example', 'sec-fetch-site': 'same-origin' },
) {
  return new Request('https://app.example/api/realtime/token', { method: 'POST', headers, body: JSON.stringify(body) })
}

async function tokenIn(response: Response) {
  return decode(((await response.json()) as { token: string }).token)
}

describe('realtime tokens', () => {
  it('signs an HS256 token Centrifugo can verify with the shared secret', () => {
    expect(decode(signRealtimeToken(ada, { channel: 'updates:one' }, secret, now))).toEqual({
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { channel: 'updates:one', info: { name: 'Ada' }, sub: 'user-1', exp: 400 },
      signed: true,
    })
  })

  it('keeps the subject and expiry when claims try to override them', () => {
    expect(decode(signRealtimeToken(ada, { sub: 'attacker', exp: 9_999 }, secret, now)).payload).toMatchObject({ sub: 'user-1', exp: 400 })
  })
})

describe('realtime ticket', () => {
  // The tests' own policy, so the application's rules in realtimeChannels.ts can change without breaking these tests.
  const policy: RealtimePolicy = {
    serverChannels: async (viewer) => [`own:${viewer.id}`],
    canSubscribe: async (_viewer, channel) => channel === 'open:one',
  }
  const options = { viewer: () => ada, policy, secret }

  it('grants a connection token with the viewer’s server-side channels', async () => {
    const response = await realtimeTicket(ticketRequest({}), options, now)
    expect((await tokenIn(response)).payload).toEqual({ channels: ['own:user-1'], info: { name: 'Ada' }, sub: 'user-1', exp: 400 })
  })

  it('grants a subscription token for a channel the policy allows', async () => {
    const response = await realtimeTicket(ticketRequest({ channel: 'open:one' }), options, now)
    expect((await tokenIn(response)).payload).toMatchObject({ channel: 'open:one', sub: 'user-1' })
  })

  it('keeps tokens out of caches', async () => {
    const response = await realtimeTicket(ticketRequest({}), options, now)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('refuses a channel the policy does not allow', async () => {
    const response = await realtimeTicket(ticketRequest({ channel: 'open:two' }), options, now)
    expect(response.status).toBe(403)
  })

  it('refuses a viewer the lookup rejects', async () => {
    const response = await realtimeTicket(ticketRequest({}), { ...options, viewer: () => undefined }, now)
    expect(response.status).toBe(401)
  })

  it('refuses a request from another site', async () => {
    const response = await realtimeTicket(
      ticketRequest({}, { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }),
      options,
      now,
    )
    expect(response.status).toBe(403)
  })

  it('rejects a channel that is not a string', async () => {
    const response = await realtimeTicket(ticketRequest({ channel: ['open:one'] }), options, now)
    expect(response.status).toBe(400)
  })
})

describe('realtime secret', () => {
  it('reads the configured secret', () => {
    expect(realtimeSecret({ REALTIME_SECRET: ' configured ' })).toBe('configured')
  })

  it('falls back to the development secret outside production', () => {
    expect(realtimeSecret({ NODE_ENV: 'development' })).toBe('development-realtime-secret')
  })

  it('requires a secret in production', () => {
    expect(() => realtimeSecret({ NODE_ENV: 'production' })).toThrow('REALTIME_SECRET is required in production')
  })
})
