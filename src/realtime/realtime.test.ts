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
})
