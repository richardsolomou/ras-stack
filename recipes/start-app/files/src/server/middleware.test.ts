import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contentSecurityPolicy } from './contentSecurityPolicy'
import {
  canonicalHost,
  canonicalRedirect,
  csrf,
  securityHeadersMiddleware,
  serverFunctionIdentity,
  staleServerFunctions,
} from './middleware'
import { currentServerFunction } from './serverFunction'

beforeEach(() => {
  vi.stubEnv('APP_URL', undefined)
  vi.stubEnv('TRUST_PROXY', undefined)
})
afterEach(() => vi.unstubAllEnvs())

type Server = (context: Record<string, unknown>) => unknown
const server = (middleware: { options: { server?: unknown } }) => middleware.options.server as Server

describe('canonical redirects', () => {
  it('leaves requests on the canonical host alone', () => {
    expect(canonicalRedirect('http://app.example/path', 'https://app.example')).toBeNull()
  })

  it('does nothing without a canonical origin', () => {
    expect(canonicalRedirect('https://old.example/path', undefined)).toBeNull()
  })

  it('keeps the path, query, and fragment', () => {
    expect(canonicalRedirect('http://old.example/path?one=two#three', 'https://app.example')).toBe('https://app.example/path?one=two#three')
  })

  // Centrifugo's connect proxy calls over loopback; Go's client turns a redirected POST into a GET that lands on the page shell.
  it.each(['http://127.0.0.1:3001/api/realtime', 'http://[::1]:3001/api/realtime', 'http://localhost:3001/api/realtime'])(
    'serves the internal caller at %s without redirecting',
    (url) => {
      expect(canonicalRedirect(url, 'https://app.example')).toBeNull()
    },
  )

  it('still redirects a hostname that merely starts with loopback digits', () => {
    expect(canonicalRedirect('http://127.example.com/path', 'https://app.example')).toBe('https://app.example/path')
  })

  it('serves the health check on any host', () => {
    expect(canonicalRedirect('http://container:3000/api/health', 'https://app.example')).toBeNull()
  })

  it('redirects with a permanent status from the middleware without calling the application', () => {
    vi.stubEnv('APP_URL', 'https://app.example')
    const next = vi.fn()
    const response = server(canonicalHost)({ request: new Request('https://old.example/path?q=1'), next }) as Response
    expect({ status: response.status, location: response.headers.get('location'), calls: next.mock.calls.length }).toEqual({
      status: 301,
      location: 'https://app.example/path?q=1',
      calls: 0,
    })
  })
})

describe('security headers', () => {
  const run = (response: Response) =>
    server(securityHeadersMiddleware)({ next: async () => ({ response }) }) as Promise<{ response: Response } | Response>
  const headersOf = (result: { response: Response } | Response) => (result instanceof Response ? result : result.response).headers

  it('adds the policy to a rendered response', async () => {
    const headers = headersOf(await run(new Response('page')))
    expect([headers.get('x-frame-options'), headers.get('content-security-policy')?.includes("frame-ancestors 'none'")]).toEqual([
      'DENY',
      true,
    ])
  })

  it("builds the policy from the application's sources", async () => {
    const headers = headersOf(await run(new Response('page')))
    expect(headers.get('content-security-policy')).toContain(`connect-src ${contentSecurityPolicy['connect-src']?.join(' ')};`)
  })

  it('keeps a header the route set itself', async () => {
    const headers = headersOf(await run(new Response('embed', { headers: { 'x-frame-options': 'SAMEORIGIN' } })))
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })

  it('copies a response whose headers are immutable', async () => {
    const result = await run(Response.redirect('https://app.example/next', 302))
    expect([headersOf(result).get('location'), headersOf(result).get('x-content-type-options')]).toEqual([
      'https://app.example/next',
      'nosniff',
    ])
  })
})

describe('server function CSRF check', () => {
  const check = (headers: Record<string, string>, url = 'https://app.example/_serverFn/abc') =>
    server(csrf)({
      handlerType: 'serverFn',
      request: new Request(url, { method: 'POST', headers }),
      next: () => 'allowed',
    })

  it('allows a same-origin call', async () => {
    expect(await check({ 'sec-fetch-site': 'same-origin', origin: 'https://app.example' })).toBe('allowed')
  })

  it('rejects a cross-site call', async () => {
    expect(((await check({ 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' })) as Response).status).toBe(403)
  })

  it('accepts APP_URL when a browser sends no Sec-Fetch-Site behind a proxy', async () => {
    vi.stubEnv('APP_URL', 'https://app.example')
    expect(await check({ origin: 'https://app.example' }, 'http://container:3000/_serverFn/abc')).toBe('allowed')
  })

  it('rejects a call with no origin information', async () => {
    expect(((await check({})) as Response).status).toBe(403)
  })
})

const removed = () => {
  throw new Error('Server function info not found for 7ff295b7')
}

describe('stale server functions', () => {
  it('tells a tab calling a removed server function to refresh', async () => {
    const response = (await server(staleServerFunctions)({ handlerType: 'serverFn', next: removed })) as Response
    expect({ status: response.status, type: response.headers.get('content-type'), body: await response.text() }).toEqual({
      status: 404,
      type: 'text/plain; charset=utf-8',
      body: 'The app has been updated. Refresh the page to continue.',
    })
  })

  it('leaves other server function failures to the framework', async () => {
    const failing = () => {
      throw new Error('database unavailable')
    }
    await expect(server(staleServerFunctions)({ handlerType: 'serverFn', next: failing })).rejects.toThrow('database unavailable')
  })

  it('passes page requests through untouched', async () => {
    await expect(server(staleServerFunctions)({ handlerType: 'router', next: removed })).rejects.toThrow('Server function info not found')
  })
})

describe('server function identity', () => {
  it('names the server function while its handler runs', async () => {
    const serverFnMeta = { id: 'abc', name: 'saveNote', filename: 'src/server/notes.ts' }
    await expect(server(serverFunctionIdentity)({ serverFnMeta, next: async () => currentServerFunction() })).resolves.toEqual({
      name: 'saveNote',
      filename: 'src/server/notes.ts',
    })
  })
})
