import { describe, expect, it, vi } from 'vitest'
import { canonicalRedirect } from './canonical-host.js'
import { healthResponse } from './health.js'
import { createRpc } from './rpc.js'
import { clearGlobalSingleton, globalAsyncSingleton, globalSingleton, peekGlobalSingleton } from './singleton.js'

describe('canonical redirects', () => {
  it('does not redirect requests already on the canonical host', () => {
    expect(canonicalRedirect('http://example.com/path', { canonicalUrl: 'https://example.com' })).toBeNull()
  })

  it('does not guess when either URL is invalid', () => {
    expect(canonicalRedirect('not a URL', { canonicalUrl: 'https://example.com' })).toBeNull()
    expect(canonicalRedirect('https://example.com', { canonicalUrl: 'not a URL' })).toBeNull()
  })

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

  it('runs allowed mutations and returns their result', async () => {
    const requireMutation = vi.fn()
    const request = new Request('https://example.com/action', { method: 'POST' })
    const { mutationRpc } = createRpc({ requireMutation })
    await expect(mutationRpc(() => 'saved', request)).resolves.toBe('saved')
    expect(requireMutation).toHaveBeenCalledWith(request)
  })

  it('rejects a mutation when no request is available', async () => {
    const { mutationRpc } = createRpc()
    await expect(mutationRpc(() => 'saved')).rejects.toThrow('mutation request is unavailable')
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

describe('development singleton lifecycle', () => {
  it('constructs one synchronous value per key', async () => {
    const key = 'test.sync'
    await clearGlobalSingleton(key)
    const create = vi.fn(() => ({ id: 1 }))
    expect(globalSingleton(key, create)).toBe(globalSingleton(key, create))
    expect(create).toHaveBeenCalledTimes(1)
    await clearGlobalSingleton(key)
  })

  it('shares concurrent asynchronous initialization', async () => {
    const key = 'test.async'
    await clearGlobalSingleton(key)
    const create = vi.fn(async () => ({ id: 1 }))
    const first = globalAsyncSingleton(key, create)
    const second = globalAsyncSingleton(key, create)
    expect(first).toBe(second)
    await expect(first).resolves.toEqual({ id: 1 })
    expect(create).toHaveBeenCalledTimes(1)
    await clearGlobalSingleton(key)
  })

  it('removes rejected initialization so a later call can retry', async () => {
    const key = 'test.retry'
    await clearGlobalSingleton(key)
    await expect(globalAsyncSingleton(key, () => Promise.reject(new Error('failed')))).rejects.toThrow('failed')
    await expect(globalAsyncSingleton(key, () => Promise.resolve('ready'))).resolves.toBe('ready')
    await clearGlobalSingleton(key)
  })

  it('rejects synchronous and asynchronous reuse of the same key', async () => {
    const key = 'test.kind'
    await clearGlobalSingleton(key)
    globalSingleton(key, () => 'sync')
    expect(() => globalAsyncSingleton(key, () => Promise.resolve('async'))).toThrow('singleton test.kind is synchronous')
    await clearGlobalSingleton(key)
  })

  it('deletes the key before disposing the previous value', async () => {
    const key = 'test.dispose'
    await clearGlobalSingleton(key)
    globalSingleton(key, () => 'old')
    await clearGlobalSingleton(key, async (value) => {
      expect(value).toBe('old')
      expect(peekGlobalSingleton(key)).toBeUndefined()
      expect(globalSingleton(key, () => 'new')).toBe('new')
    })
    expect(peekGlobalSingleton(key)).toBe('new')
    await clearGlobalSingleton(key)
  })
})
