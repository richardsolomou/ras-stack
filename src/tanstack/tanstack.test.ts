import { describe, expect, it, vi } from 'vitest'
import { createStackQueryClient, queryErrorMessage } from './query.js'
import { canonicalHostRequest } from './middleware.js'
import { betterAuthHandlers, createTanStackRpc, requireTanStackMutationOrigin, tanStackHealthHandler } from './server.js'

describe('TanStack RPC integration', () => {
  it('uses the ambient request for mutation policy', async () => {
    const request = new Request('https://example.com/action', { method: 'POST' })
    const requireMutation = vi.fn()
    const { mutationRpc } = createTanStackRpc({ getRequest: () => request, requireMutation })

    await expect(mutationRpc(() => 'saved')).resolves.toBe('saved')
    expect(requireMutation).toHaveBeenCalledWith(request)
  })

  it('applies same-origin policy to an explicit request', () => {
    const request = new Request('https://example.com/action', {
      method: 'POST',
      headers: { origin: 'https://example.com' },
    })

    expect(() => requireTanStackMutationOrigin({}, request)).not.toThrow()
  })

  it('delegates both Better Auth methods to the resolved application', async () => {
    const handler = vi.fn(() => Response.json({ ok: true }))
    const handlers = betterAuthHandlers(() => ({ handler }))
    const request = new Request('https://example.com/api/auth/session')
    await handlers.GET({ request })
    await handlers.POST({ request })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('builds a health handler around an application-owned check', async () => {
    const handler = tanStackHealthHandler(() => {
      throw new Error('offline')
    })
    expect((await handler()).status).toBe(503)
  })

  it('redirects a non-canonical request without calling the application', () => {
    const next = vi.fn(() => new Response('application'))
    const response = canonicalHostRequest(new Request('https://old.example/path?q=1'), next, {
      canonicalUrl: 'https://example.com',
    })
    expect({ location: response.headers.get('location'), nextCalls: next.mock.calls.length, status: response.status }).toEqual({
      location: 'https://example.com/path?q=1',
      nextCalls: 0,
      status: 301,
    })
  })

  it('continues requests already served on an allowed host', async () => {
    const response = canonicalHostRequest(new Request('https://old.example/api/health'), () => new Response('healthy'), {
      canonicalUrl: 'https://example.com',
      pathsServedOnAnyHost: new Set(['/api/health']),
    })
    expect(await response.text()).toBe('healthy')
  })
})

describe('TanStack Query integration', () => {
  it('uses the shared stale time by default', () => {
    expect(createStackQueryClient().getDefaultOptions().queries?.staleTime).toBe(1000)
  })

  it('allows applications to replace query defaults', () => {
    expect(createStackQueryClient({ defaultOptions: { queries: { staleTime: 5000 } } }).getDefaultOptions().queries?.staleTime).toBe(5000)
  })

  it('normalizes unknown errors for user-facing messages', () => {
    expect(queryErrorMessage('failed')).toBe('Something went wrong. Try again.')
  })

  it('preserves application error messages', () => {
    expect(queryErrorMessage(new Error('Try another name.'))).toBe('Try another name.')
  })
})
