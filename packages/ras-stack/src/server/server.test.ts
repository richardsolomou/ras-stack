import { describe, expect, it, vi } from 'vitest'
import { canonicalRedirect } from './canonical-host.js'
import { healthResponse } from './health.js'
import { errorHasCode, InfrastructureError, infrastructureDiagnostic, infrastructureFailure, safeInfrastructureError } from './errors.js'
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

  // Centrifugo's connect proxy calls the application over the loopback interface. A redirect there sends an
  // internal request out to the public name, and Go's client turns the POST into a GET, which lands on the
  // page shell and hands Centrifugo HTML to parse as JSON.
  it.each([
    'http://127.0.0.1:3001/api/centrifugo/connect',
    'http://[::1]:3001/api/centrifugo/connect',
    'http://localhost:3001/api/centrifugo/connect',
  ])('serves %s without redirecting an internal caller', (url) => {
    expect(canonicalRedirect(url, { canonicalUrl: 'https://example.com' })).toBeNull()
  })

  it('still redirects a hostname that merely starts with the loopback digits', () => {
    expect(canonicalRedirect('http://127.example.com/path', { canonicalUrl: 'https://example.com' })).toBe('https://example.com/path')
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
    expect(logError).toHaveBeenCalledWith(
      failure,
      { method: 'POST', path: '/action' },
      expect.objectContaining({ method: 'POST', url: 'https://example.com/action' }),
    )
  })

  it('awaits asynchronous failure reporting before rejecting', async () => {
    let reported = false
    const { rpc } = createRpc({
      logError: async () => {
        await Promise.resolve()
        reported = true
      },
    })
    await expect(rpc(() => Promise.reject(new Error('broken')))).rejects.toThrow('broken')
    expect(reported).toBe(true)
  })

  it('preserves the application failure when reporting fails', async () => {
    const failure = new Error('application failed')
    const { rpc } = createRpc({ logError: () => Promise.reject(new Error('logger failed')) })
    await expect(rpc(() => Promise.reject(failure))).rejects.toBe(failure)
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

  it('returns a stable infrastructure code without exposing the cause', async () => {
    const response = await healthResponse(() => Promise.reject(new Error('password=secret')), {
      failure: (error) => infrastructureFailure(error, { code: 'database_unavailable', message: 'database unavailable', retryable: true }),
    })
    expect(await response.json()).toEqual({ ok: false, error: 'database unavailable', code: 'database_unavailable' })
  })
})

describe('infrastructure errors', () => {
  it('preserves an explicitly public failure through wrapped causes', () => {
    const error = new Error('request failed', {
      cause: new InfrastructureError('smtp_unavailable', 'email is temporarily unavailable', { retryable: true }),
    })
    expect(infrastructureFailure(error, { code: 'internal_error', message: 'try again', retryable: false })).toEqual({
      code: 'smtp_unavailable',
      message: 'email is temporarily unavailable',
      retryable: true,
    })
  })

  it('collapses unknown failures to the approved fallback', () => {
    expect(infrastructureFailure(new Error('password=secret'), { code: 'internal_error', message: 'try again', retryable: false })).toEqual(
      {
        code: 'internal_error',
        message: 'try again',
        retryable: false,
      },
    )
  })

  it('wraps unknown failures without replacing their diagnostic cause', () => {
    const cause = new Error('connection refused')
    const error = safeInfrastructureError(cause, { code: 'service_unavailable', message: 'service unavailable', retryable: true })
    expect({ cause: error.cause, code: error.code, message: error.message, retryable: error.retryable }).toEqual({
      cause,
      code: 'service_unavailable',
      message: 'service unavailable',
      retryable: true,
    })
  })

  it('extracts bounded diagnostics and nested driver codes', () => {
    const cause = Object.assign(new Error('duplicate'), { code: '23505', status: 409 })
    const error = new Error('write failed', { cause })
    expect({ diagnostic: infrastructureDiagnostic(error), matching: errorHasCode(error, '23505') }).toEqual({
      diagnostic: { name: 'Error', message: 'write failed', code: '23505', status: 409 },
      matching: true,
    })
  })

  it('stops traversing cyclic causes', () => {
    const error = new Error('cycle')
    error.cause = error
    expect(errorHasCode(error, 'missing')).toBe(false)
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
