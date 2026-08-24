import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acceptedOrigins, forwardedOrigin, requireSameOrigin, trustedOrigins, validSameOriginRequest } from './origins.js'
import { configuredProviderOptions, configuredProviders, providerCredentials } from './providers.js'
import { randomId, randomToken } from './random.js'
import { persistedSecret } from './secret.js'
import { standardAccountOptions, standardRateLimitOptions, standardSessionOptions } from './settings.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('auth settings', () => {
  it('uses the shared session lifetime', () => {
    expect(standardSessionOptions()).toEqual({ expiresIn: 7_776_000, updateAge: 86_400 })
  })

  it('allows an application to replace one session setting', () => {
    expect(standardSessionOptions({ expiresIn: 2_592_000 })).toEqual({ expiresIn: 2_592_000, updateAge: 86_400 })
  })

  it('allows an application to replace individual rate limits', () => {
    expect(standardRateLimitOptions({ '/sign-up/email': { window: 10, max: 2 } }).customRules['/sign-up/email']).toEqual({
      window: 10,
      max: 2,
    })
  })

  it('protects administrator password changes', () => {
    expect(standardRateLimitOptions().customRules['/admin/set-user-password']).toEqual({ window: 60, max: 10 })
  })

  it('encrypts OAuth tokens by default', () => {
    expect(standardAccountOptions()).toEqual({ encryptOAuthTokens: true })
  })

  it('preserves an application account-linking policy', () => {
    expect(
      standardAccountOptions({
        accountLinking: { allowDifferentEmails: true, disableImplicitLinking: true, updateUserInfoOnLink: true },
      }),
    ).toEqual({
      encryptOAuthTokens: true,
      accountLinking: {
        allowDifferentEmails: true,
        disableImplicitLinking: true,
        updateUserInfoOnLink: true,
      },
    })
  })

  it('allows an application to override an account default explicitly', () => {
    expect(standardAccountOptions({ encryptOAuthTokens: false })).toEqual({ encryptOAuthTokens: false })
  })
})

describe('provider credentials', () => {
  const environment = { GOOGLE_CLIENT_ID: ' id ', GOOGLE_CLIENT_SECRET: ' secret ', GITHUB_CLIENT_ID: 'incomplete' }

  it('returns only fully configured providers', () => {
    expect(configuredProviders(['google', 'github'] as const, environment)).toEqual(['google'])
  })

  it('returns trimmed credentials', () => {
    expect(providerCredentials('google', environment)).toEqual({ clientId: 'id', clientSecret: 'secret' })
  })

  it('maps only configured providers to their credentials', () => {
    expect(configuredProviderOptions(['google', 'github'] as const, environment)).toEqual({
      google: { clientId: 'id', clientSecret: 'secret' },
    })
  })

  it('reads a strict credential pair from custom-prefixed variables', () => {
    expect(
      providerCredentials(
        'google',
        { AUTH_GOOGLE_CLIENT_ID: ' id ', AUTH_GOOGLE_CLIENT_SECRET: ' secret ' },
        {
          prefix: 'AUTH_',
          requireComplete: true,
        },
      ),
    ).toEqual({ clientId: 'id', clientSecret: 'secret' })
  })

  it('rejects an incomplete credential pair when requested', () => {
    expect(() => providerCredentials('google', { AUTH_GOOGLE_CLIENT_ID: 'id' }, { prefix: 'AUTH_', requireComplete: true })).toThrow(
      'AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET must be configured together',
    )
  })
})

describe('random credentials', () => {
  it('creates URL-safe tokens at the requested entropy', () => {
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('uses a shorter default for non-secret ids', () => {
    expect(randomId()).toMatch(/^[A-Za-z0-9_-]{11}$/)
  })

  it('rejects invalid entropy', () => {
    expect(() => randomToken(0)).toThrow('Token bytes must be a positive integer')
  })
})

describe('persisted secrets', () => {
  it('prefers an explicitly configured secret', () => {
    const directory = temporaryDirectory()
    expect(persistedSecret({ directory, environment: { AUTH_SECRET: ' managed ' } })).toBe('managed')
    expect(fs.existsSync(path.join(directory, 'auth.secret'))).toBe(false)
  })

  it('creates and reuses a private secret file', () => {
    const directory = temporaryDirectory()
    const first = persistedSecret({ directory, environment: {} })
    const second = persistedSecret({ directory, environment: {} })
    expect(second).toBe(first)
    expect(fs.statSync(path.join(directory, 'auth.secret')).mode & 0o777).toBe(0o600)
  })

  it('reuses an existing secret', () => {
    const directory = temporaryDirectory()
    fs.writeFileSync(path.join(directory, 'auth.secret'), 'existing', { mode: 0o600 })
    expect(persistedSecret({ directory, environment: {} })).toBe('existing')
  })

  it('rejects an empty existing secret', () => {
    const directory = temporaryDirectory()
    fs.writeFileSync(path.join(directory, 'auth.secret'), '')
    expect(() => persistedSecret({ directory, environment: {} })).toThrow('Secret file is empty')
  })
})

describe('request origins', () => {
  it('recognizes the public origin forwarded by a trusted proxy', () => {
    const request = new Request('http://app:3000/action', {
      headers: { host: 'app:3000', origin: 'https://example.com', 'x-forwarded-host': 'example.com', 'x-forwarded-proto': 'https' },
    })
    expect(forwardedOrigin(request)).toBe('https://example.com')
    expect(validSameOriginRequest(request, { trustForwardedHeaders: true })).toBe(true)
  })

  it('does not trust forwarded headers by default', () => {
    const request = new Request('http://app:3000/action', {
      headers: { origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    })
    expect(validSameOriginRequest(request)).toBe(false)
  })

  it('rejects requests without an origin', () => {
    expect(validSameOriginRequest(new Request('https://example.com/action'))).toBe(false)
  })

  it('rejects an origin that does not match the request', () => {
    const request = new Request('https://example.com/action', { headers: { origin: 'https://other.example' } })
    expect(validSameOriginRequest(request)).toBe(false)
  })

  it('ignores malformed and partial forwarded headers', () => {
    const malformed = new Request('http://app:3000/action', {
      headers: { origin: 'https://example.com', 'x-forwarded-host': 'example.com', 'x-forwarded-proto': 'file' },
    })
    const partial = new Request('http://app:3000/action', {
      headers: { origin: 'https://example.com', 'x-forwarded-host': 'example.com' },
    })
    expect(validSameOriginRequest(malformed, { trustForwardedHeaders: true })).toBe(false)
    expect(validSameOriginRequest(partial, { trustForwardedHeaders: true })).toBe(false)
  })

  it('uses the Referer only when explicitly enabled', () => {
    const request = new Request('https://example.com/action', { headers: { referer: 'https://example.com/page' } })
    expect(validSameOriginRequest(request)).toBe(false)
    expect(validSameOriginRequest(request, { allowReferer: true })).toBe(true)
  })

  it('rejects cross-site requests even when their origin is configured', () => {
    const request = new Request('https://example.com/action', {
      headers: { origin: 'https://example.com', 'sec-fetch-site': 'cross-site' },
    })
    expect(() => requireSameOrigin(request)).toThrow(Response)
  })

  it('normalizes configured origins and ignores invalid values', () => {
    const request = new Request('http://app:3000/action')
    expect(acceptedOrigins(request, { configured: ['https://example.com/path', 'not a URL'] })).toEqual([
      'http://app:3000',
      'https://example.com',
    ])
  })

  it('builds a Better Auth-compatible trusted origins callback', () => {
    const request = new Request('http://app:3000/action', {
      headers: { 'x-forwarded-host': 'example.com', 'x-forwarded-proto': 'https' },
    })
    expect(trustedOrigins({ configured: ['https://admin.example.com'], trustForwardedHeaders: true })(request)).toEqual([
      'https://example.com',
      'https://admin.example.com',
    ])
  })
})

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ras-stack-'))
  temporaryDirectories.push(directory)
  return directory
}
