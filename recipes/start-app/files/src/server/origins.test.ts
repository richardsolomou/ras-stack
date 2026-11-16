import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptedOrigins, isSameOriginRequest, publicOrigin, requireSameOrigin, trustedOrigins } from './origins'

beforeEach(() => {
  vi.stubEnv('APP_URL', undefined)
  vi.stubEnv('TRUST_PROXY', undefined)
})
afterEach(() => vi.unstubAllEnvs())

const post = (headers: Record<string, string>, url = 'https://app.example/action') => new Request(url, { method: 'POST', headers })

describe('mutation origin guard', () => {
  it('accepts a same-origin request', () => {
    expect(() => requireSameOrigin(post({ origin: 'https://app.example', 'sec-fetch-site': 'same-origin' }))).not.toThrow()
  })

  it('rejects a cross-origin request', () => {
    expect(() => requireSameOrigin(post({ origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }))).toThrow(
      expect.objectContaining({ status: 403 }),
    )
  })

  it('rejects a request without an origin', () => {
    expect(() => requireSameOrigin(post({}))).toThrow(expect.objectContaining({ status: 403 }))
  })

  it('rejects a spoofed forwarded origin when the proxy is not trusted', () => {
    const request = post({ origin: 'https://attacker.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' })
    expect(() => requireSameOrigin(request)).toThrow(expect.objectContaining({ status: 403 }))
  })

  it('rejects a same-site sibling', () => {
    expect(isSameOriginRequest(post({ origin: 'https://sibling.example', 'sec-fetch-site': 'same-site' }))).toBe(false)
  })

  it('rejects a cross-site request even from the configured origin', () => {
    vi.stubEnv('APP_URL', 'https://app.example')
    expect(isSameOriginRequest(post({ origin: 'https://app.example', 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })

  it('accepts the configured public origin behind a proxy', () => {
    vi.stubEnv('APP_URL', 'https://app.example')
    expect(
      isSameOriginRequest(post({ origin: 'https://app.example', 'sec-fetch-site': 'same-origin' }, 'http://container:3000/action')),
    ).toBe(true)
  })

  it('accepts the origin a trusted proxy forwards', () => {
    vi.stubEnv('TRUST_PROXY', 'true')
    const request = post(
      { origin: 'https://app.example', 'x-forwarded-host': 'app.example', 'x-forwarded-proto': 'https' },
      'http://container:3000/action',
    )
    expect(isSameOriginRequest(request)).toBe(true)
  })

  it('ignores a forwarded host without a valid protocol', () => {
    vi.stubEnv('TRUST_PROXY', 'true')
    const malformed = post(
      { origin: 'https://app.example', 'x-forwarded-host': 'app.example', 'x-forwarded-proto': 'file' },
      'http://c:3000/',
    )
    const partial = post({ origin: 'https://app.example', 'x-forwarded-host': 'app.example' }, 'http://c:3000/')
    expect([isSameOriginRequest(malformed), isSameOriginRequest(partial)]).toEqual([false, false])
  })
})

describe('accepted origins', () => {
  it('normalizes APP_URL and ignores an invalid one', () => {
    vi.stubEnv('APP_URL', 'https://app.example/path')
    expect(acceptedOrigins(new Request('http://container:3000/'))).toEqual(['http://container:3000', 'https://app.example'])
    vi.stubEnv('APP_URL', 'not a URL')
    expect(acceptedOrigins(new Request('http://container:3000/'))).toEqual(['http://container:3000'])
  })

  it('gives Better Auth only the origins beyond the request itself', () => {
    vi.stubEnv('APP_URL', 'https://admin.example')
    vi.stubEnv('TRUST_PROXY', 'true')
    const request = new Request('http://container:3000/', { headers: { 'x-forwarded-host': 'app.example', 'x-forwarded-proto': 'https' } })
    expect(trustedOrigins(request)).toEqual(['https://app.example', 'https://admin.example'])
  })
})

describe('public origin', () => {
  const proxied = new Request('http://container:3000/page', {
    headers: { 'x-forwarded-host': 'app.example', 'x-forwarded-proto': 'https' },
  })

  it('prefers APP_URL', () => {
    vi.stubEnv('APP_URL', 'https://canonical.example/path')
    vi.stubEnv('TRUST_PROXY', 'true')
    expect(publicOrigin(proxied)).toBe('https://canonical.example')
  })

  it('uses the forwarded origin from a trusted proxy without APP_URL', () => {
    vi.stubEnv('TRUST_PROXY', 'true')
    expect(publicOrigin(proxied)).toBe('https://app.example')
  })

  it('falls back to the request origin without trusting forwarded headers', () => {
    expect(publicOrigin(proxied)).toBe('http://container:3000')
  })
})
