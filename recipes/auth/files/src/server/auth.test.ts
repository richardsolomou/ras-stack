import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuth, socialProviders } from './auth'

const origin = 'http://localhost:3000'
const password = 'correct horse battery staple'

beforeEach(() => {
  vi.stubEnv('APP_URL', origin)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function testAuth() {
  return createAuth(memoryAdapter({ user: [], session: [], account: [], verification: [], rateLimit: [] }))
}

function post(auth: ReturnType<typeof createAuth>, path: string, body: object, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${process.env.APP_URL!}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: process.env.APP_URL!, ...headers },
      body: JSON.stringify(body),
    }),
  )
}

function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

describe('createAuth', () => {
  it('signs up into a session', async () => {
    const auth = testAuth()
    const response = await post(auth, '/sign-up/email', { name: 'Ada', email: 'ada@example.test', password })
    const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie(response) }) })
    expect(session?.user.email).toBe('ada@example.test')
  })

  it('ends the session on sign-out', async () => {
    const auth = testAuth()
    const cookie = sessionCookie(await post(auth, '/sign-up/email', { name: 'Ada', email: 'ada@example.test', password }))
    await post(auth, '/sign-out', {}, { cookie })
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it('rejects a sign-up from another origin', async () => {
    const auth = testAuth()
    const response = await post(
      auth,
      '/sign-up/email',
      { name: 'Mallory', email: 'mallory@example.test', password },
      { origin: 'https://evil.example' },
    )
    expect(response.status).toBe(403)
  })

  it('accepts the APP_URL origin on a proxied request', async () => {
    vi.stubEnv('APP_URL', 'https://example.test')
    const auth = testAuth()
    const response = await auth.handler(
      new Request('http://app:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://example.test' },
        body: JSON.stringify({ name: 'Ada', email: 'ada@example.test', password }),
      }),
    )
    expect(response.status).toBe(200)
  })

  it('marks session cookies Secure when APP_URL is HTTPS', async () => {
    vi.stubEnv('APP_URL', 'https://example.test')
    const response = await post(testAuth(), '/sign-up/email', { name: 'Ada', email: 'ada@example.test', password })
    expect(response.headers.get('set-cookie')).toContain('; Secure')
  })

  it('limits email sign-in attempts to twenty a minute', async () => {
    const auth = testAuth()
    const attempts = []
    for (let attempt = 0; attempt < 21; attempt++)
      attempts.push((await post(auth, '/sign-in/email', { email: 'ada@example.test', password })).status)
    expect(attempts.at(-1)).toBe(429)
  })

  it.each(['/request-password-reset', '/send-verification-email'])('limits %s to five a minute', async (path) => {
    const auth = testAuth()
    const limited = []
    for (let attempt = 0; attempt < 6; attempt++) limited.push((await post(auth, path, { email: 'ada@example.test' })).status === 429)
    expect(limited).toEqual([false, false, false, false, false, true])
  })

  it('encrypts OAuth tokens at rest', () => {
    expect(testAuth().options.account?.encryptOAuthTokens).toBe(true)
  })

  it('refuses to start a production build without a secret', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    expect(() => testAuth()).toThrow('BETTER_AUTH_SECRET is required in production')
  })

  it('starts a production build with a secret', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('BETTER_AUTH_SECRET', 'a-production-secret-of-at-least-32-characters')
    expect(() => testAuth()).not.toThrow()
  })
})

describe('socialProviders', () => {
  it('returns trimmed credentials for each configured provider', () => {
    expect(socialProviders({ GOOGLE_CLIENT_ID: ' id ', GOOGLE_CLIENT_SECRET: ' secret ' })).toEqual({
      google: { clientId: 'id', clientSecret: 'secret' },
    })
  })

  it('leaves out providers with no credentials', () => {
    expect(socialProviders({})).toEqual({})
  })

  it.each([{ DISCORD_CLIENT_ID: 'id' }, { DISCORD_CLIENT_SECRET: 'secret' }])('throws on half a credential pair', (environment) => {
    expect(() => socialProviders(environment)).toThrow('DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be set together')
  })
})
