import { describe, expect, it, vi } from 'vitest'
import { currentServerFunction } from '../server/server-function.js'
import { canonicalHostMiddleware, serverFunctionIdentityMiddleware, staleServerFunctionMiddleware } from './middleware.js'
import { createTanStackRpc, requireTanStackMutationOrigin, tanStackHealthHandler } from './server.js'

const ambient = vi.hoisted(() => ({ request: new Request('https://example.com/action', { method: 'POST' }) }))
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => ambient.request }))

describe('TanStack RPC integration', () => {
  it('uses the ambient request for mutation policy', async () => {
    const requireMutation = vi.fn()
    const { mutationRpc } = createTanStackRpc({ requireMutation })

    await mutationRpc(() => 'saved')
    expect(requireMutation).toHaveBeenCalledWith(ambient.request)
  })

  it('accepts a same-origin request', () => {
    const request = new Request('https://example.com/action', {
      method: 'POST',
      headers: { origin: 'https://example.com' },
    })

    expect(() => requireTanStackMutationOrigin({}, request)).not.toThrow()
  })

  it('rejects a cross-origin request', () => {
    const request = new Request('https://example.com/action', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    })

    expect(() => requireTanStackMutationOrigin({}, request)).toThrow(expect.objectContaining({ status: 403 }))
  })

  it('builds a health handler around an application-owned check', async () => {
    const handler = tanStackHealthHandler(() => {
      throw new Error('offline')
    })
    expect((await handler()).status).toBe(503)
  })
})

describe('canonical host middleware', () => {
  it('redirects a non-canonical request without calling the application', () => {
    const next = vi.fn(() => new Response('application'))
    const response = canonicalHost({ canonicalUrl: 'https://example.com' })({
      request: new Request('https://old.example/path?q=1'),
      next,
    }) as Response
    expect({ location: response.headers.get('location'), nextCalls: next.mock.calls.length, status: response.status }).toEqual({
      location: 'https://example.com/path?q=1',
      nextCalls: 0,
      status: 301,
    })
  })

  it('continues requests already served on an allowed host', async () => {
    const response = canonicalHost({ canonicalUrl: 'https://example.com', pathsServedOnAnyHost: new Set(['/api/health']) })({
      request: new Request('https://old.example/api/health'),
      next: () => new Response('healthy'),
    }) as Response
    expect(await response.text()).toBe('healthy')
  })
})

describe('server function identity middleware', () => {
  it('names the server function while its handler runs', async () => {
    const serverFnMeta = { id: 'abc', name: 'savedRosters', filename: 'src/server/functions/rosters.ts' }
    const server = serverFunctionIdentityMiddleware().options.server as (context: {
      serverFnMeta: typeof serverFnMeta
      next: () => unknown
    }) => unknown

    await expect(server({ serverFnMeta, next: async () => currentServerFunction() })).resolves.toEqual({
      name: 'savedRosters',
      filename: 'src/server/functions/rosters.ts',
    })
  })
})

const removed = () => {
  throw new Error('Server function info not found for 7ff295b7')
}

describe('stale server function middleware', () => {
  const server = staleServerFunctionMiddleware('Refresh to continue.').options.server as (context: {
    handlerType: 'serverFn' | 'router'
    next: () => unknown
  }) => Promise<unknown>

  it('tells a tab calling a removed server function to refresh', async () => {
    const response = (await server({ handlerType: 'serverFn', next: removed })) as Response
    expect({ status: response.status, contentType: response.headers.get('content-type'), body: await response.text() }).toEqual({
      status: 404,
      contentType: 'text/plain; charset=utf-8',
      body: 'Refresh to continue.',
    })
  })

  it('leaves other server function failures to the framework', async () => {
    await expect(
      server({
        handlerType: 'serverFn',
        next: () => {
          throw new Error('database unavailable')
        },
      }),
    ).rejects.toThrow('database unavailable')
  })

  it('passes page requests through untouched', async () => {
    await expect(server({ handlerType: 'router', next: removed })).rejects.toThrow('Server function info not found')
  })
})

function canonicalHost(options: { canonicalUrl: string; pathsServedOnAnyHost?: ReadonlySet<string> }) {
  return canonicalHostMiddleware(() => options).options.server as (context: { request: Request; next: () => unknown }) => unknown
}
