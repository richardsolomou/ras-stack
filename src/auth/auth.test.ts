import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acceptedOrigins, forwardedOrigin, requireSameOrigin, trustedOrigins, validSameOriginRequest } from './origins.js'
import { configuredProviders, providerCredentials } from './providers.js'
import { randomId, randomToken } from './random.js'
import { persistedSecret } from './secret.js'
import { standardRateLimitOptions, standardSessionOptions } from './settings.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('auth settings', () => {
  it('uses the shared session lifetime', () => {
    expect(standardSessionOptions()).toEqual({ expiresIn: 7_776_000, updateAge: 86_400 })
  })

  it('allows an application to replace individual rate limits', () => {
    expect(standardRateLimitOptions({ '/sign-up/email': { window: 10, max: 2 } }).customRules['/sign-up/email']).toEqual({
      window: 10,
      max: 2,
    })
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
    expect(validSameOriginRequest(request)).toBe(true)
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
    expect(trustedOrigins({ configured: ['https://admin.example.com'] })(request)).toEqual([
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
