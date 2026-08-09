import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { CentrifugoPublisher } from './publisher.js'
import { signRealtimeToken } from './tokens.js'

describe('realtime tokens', () => {
  it('signs application-owned claims with a bounded lifetime', () => {
    const token = signRealtimeToken(
      'user-1',
      { sub: 'attacker', exp: 9_999, channel: 'battle:one', info: { name: 'Ada' } },
      { secret: 'secret', now: 100 },
    )
    const [header, payload, signature] = token.split('.')
    expect(signature).toBe(createHmac('sha256', 'secret').update(`${header}.${payload}`).digest('base64url'))
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({
      sub: 'user-1',
      exp: 400,
      channel: 'battle:one',
      info: { name: 'Ada' },
    })
  })
})

describe('Centrifugo publisher', () => {
  it('rejects invalid queue limits', () => {
    expect(
      () => new CentrifugoPublisher({ apiUrl: 'http://realtime/api', apiKey: 'key', maxConcurrentChannels: 0, onError: vi.fn() }),
    ).toThrow('maxConcurrentChannels must be a positive integer')
  })

  it('reports non-retryable responses without retrying', async () => {
    const onError = vi.fn()
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 400 }))
    const publisher = new CentrifugoPublisher({ apiUrl: 'http://realtime/api', apiKey: 'key', fetch: request, onError })
    publisher.publish('one', { type: 'change' })
    await publisher.idle()
    expect(request).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Realtime publish failed with status 400' }), 'one')
  })

  it('publishes application-owned channels and payloads', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    const publisher = new CentrifugoPublisher({ apiUrl: 'http://realtime/api/', apiKey: 'key', fetch: request, onError: vi.fn() })
    publisher.publish('battle:one', { type: 'change' })
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    expect(request).toHaveBeenCalledWith('http://realtime/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'key' },
      body: JSON.stringify({ channel: 'battle:one', data: { type: 'change' } }),
      signal: expect.any(AbortSignal),
    })
  })

  it('coalesces pending publications independently by channel', async () => {
    let release!: () => void
    const pending = new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}'))
    })
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => pending)
      .mockResolvedValue(new Response('{}'))
    const publisher = new CentrifugoPublisher({ apiUrl: 'http://realtime/api', apiKey: 'key', fetch: request, onError: vi.fn() })
    publisher.publish('one', { version: 1 })
    publisher.publish('one', { version: 2 })
    publisher.publish('two', { version: 1 })
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    release()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3))
    expect(request.mock.calls.map(([, options]) => options?.body)).toEqual([
      JSON.stringify({ channel: 'one', data: { version: 1 } }),
      JSON.stringify({ channel: 'two', data: { version: 1 } }),
      JSON.stringify({ channel: 'one', data: { version: 2 } }),
    ])
  })

  it('retries transient failures and exposes the retry', async () => {
    const onRetry = vi.fn()
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValue(new Response('{}'))
    const publisher = new CentrifugoPublisher({
      apiUrl: 'http://realtime/api',
      apiKey: 'key',
      fetch: request,
      retryMs: 1,
      onError: vi.fn(),
      onRetry,
    })
    publisher.publish('one', { type: 'change' })
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 'one')
  })

  it('reports a transient failure after exhausting bounded retries', async () => {
    const onError = vi.fn()
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }))
    const publisher = new CentrifugoPublisher({
      apiUrl: 'http://realtime/api',
      apiKey: 'key',
      fetch: request,
      retryMs: 1,
      maxRetries: 1,
      onError,
    })
    publisher.publish('one', { type: 'change' })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), 'one'))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not lose a publication queued by the error handler', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValue(new Response('{}'))
    let publisher!: CentrifugoPublisher
    publisher = new CentrifugoPublisher({
      apiUrl: 'http://realtime/api',
      apiKey: 'key',
      fetch: request,
      onError: () => publisher.publish('one', { version: 2 }),
    })
    publisher.publish('one', { version: 1 })
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(request.mock.calls.map(([, options]) => options?.body)).toEqual([
      JSON.stringify({ channel: 'one', data: { version: 1 } }),
      JSON.stringify({ channel: 'one', data: { version: 2 } }),
    ])
  })

  it('delivers the latest publication queued while an earlier one fails', async () => {
    let failFirst!: () => void
    const first = new Promise<Response>((resolve) => {
      failFirst = () => resolve(new Response('{}', { status: 400 }))
    })
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(new Response('{}'))
    const publisher = new CentrifugoPublisher({
      apiUrl: 'http://realtime/api',
      apiKey: 'key',
      fetch: request,
      onError: vi.fn(),
    })
    publisher.publish('one', { version: 1 })
    publisher.publish('one', { version: 2 })
    failFirst()
    await publisher.idle()
    expect(request.mock.calls.map(([, options]) => options?.body)).toEqual([
      JSON.stringify({ channel: 'one', data: { version: 1 } }),
      JSON.stringify({ channel: 'one', data: { version: 2 } }),
    ])
  })

  it('bounds concurrent channels', async () => {
    let releaseFirst!: () => void
    const first = new Promise<Response>((resolve) => {
      releaseFirst = () => resolve(new Response('{}'))
    })
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(new Response('{}'))
    const publisher = new CentrifugoPublisher({
      apiUrl: 'http://realtime/api',
      apiKey: 'key',
      fetch: request,
      maxConcurrentChannels: 1,
      onError: vi.fn(),
    })
    publisher.publish('one', { type: 'change' })
    publisher.publish('two', { type: 'change' })
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
    releaseFirst()
    await publisher.idle()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('rejects new channels when the pending bound is full', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => undefined))
    const onError = vi.fn()
    const publisher = new CentrifugoPublisher({
      apiUrl: 'http://realtime/api',
      apiKey: 'key',
      fetch: request,
      maxPendingChannels: 1,
      onError,
    })
    expect(publisher.publish('one', { type: 'change' })).toBe(true)
    expect(publisher.publish('two', { type: 'change' })).toBe(false)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Realtime publisher queue is full' }), 'two')
  })

  it('drains pending work before closing', async () => {
    let release!: () => void
    const response = new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}'))
    })
    const request = vi.fn<typeof fetch>().mockImplementation(() => response)
    const onError = vi.fn()
    const publisher = new CentrifugoPublisher({ apiUrl: 'http://realtime/api', apiKey: 'key', fetch: request, onError })
    publisher.publish('one', { type: 'change' })
    const closed = publisher.close()
    expect(publisher.publish('two', { type: 'change' })).toBe(false)
    release()
    await closed
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Realtime publisher is closed' }), 'two')
  })
})
