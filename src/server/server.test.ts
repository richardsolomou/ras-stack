import { describe, expect, it, vi } from 'vitest'
import { canonicalRedirect } from './canonical-host.js'
import { healthResponse } from './health.js'
import { createRpc } from './rpc.js'

describe('canonical redirects', () => {
  it('preserves the request path, query, and fragment', () => {
    expect(canonicalRedirect('http://internal/path?one=two#three', { canonicalUrl: 'https://example.com' })).toBe(
      'https://example.com/path?one=two#three',
    )
  })

  it('serves explicitly excluded endpoints on any host', () => {
    expect(
      canonicalRedirect('http://internal/api/health', {
        canonicalUrl: 'https://example.com',
        pathsServedOnAnyHost: new Set(['/api/health']),
      }),
    ).toBeNull()
  })
})

describe('RPC wrappers', () => {
  it('turns a thrown response into a rejected error', async () => {
    const { rpc } = createRpc()
    await expect(rpc(() => Promise.reject(new Response('not found', { status: 404 })))).rejects.toThrow('not found')
  })

  it('checks mutation policy before running work', async () => {
    const work = vi.fn()
    const requireMutation = vi.fn(() => {
      throw new Response('rejected', { status: 403 })
    })
    const request = new Request('https://example.com/action', { method: 'POST' })
    const { mutationRpc } = createRpc({ requireMutation })
    await expect(mutationRpc(work, request)).rejects.toThrow('rejected')
    expect(work).not.toHaveBeenCalled()
  })

  it('reports unexpected failures with request context', async () => {
    const logError = vi.fn()
    const failure = new Error('broken')
    const { rpc } = createRpc({ getRequest: () => new Request('https://example.com/action', { method: 'POST' }), logError })
    await expect(rpc(() => Promise.reject(failure))).rejects.toBe(failure)
    expect(logError).toHaveBeenCalledWith(failure, { method: 'POST', path: '/action' })
  })
})

describe('health responses', () => {
  it('reports a successful dependency check', async () => {
    const response = await healthResponse(() => undefined)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('reports a failed dependency check without throwing', async () => {
    const response = await healthResponse(() => Promise.reject(new Error('database unavailable')))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'health check failed' })
  })

  it('allows an application to expose a safe failure classification', async () => {
    const response = await healthResponse(() => Promise.reject(new Error('database unavailable')), {
      errorMessage: () => 'database unavailable',
    })
    expect(await response.json()).toEqual({ ok: false, error: 'database unavailable' })
  })
})
