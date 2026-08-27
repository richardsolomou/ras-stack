import { EventEmitter } from 'node:events'
import type { Centrifuge, ClientInfo, Subscription } from 'centrifuge'
import { describe, expect, it, vi } from 'vitest'
import {
  connectRealtimeClient,
  openRealtimeSubscription,
  requestRealtimeTicket,
  sameOriginWebSocketUrl,
  watchServerChannel,
  watchSubscriptionPresence,
} from './client.js'

describe('realtime client transport', () => {
  it('builds a secure same-origin WebSocket URL', () => {
    expect(sameOriginWebSocketUrl({ protocol: 'https:', host: 'example.com' })).toBe('wss://example.com/connection/websocket')
  })

  it('rejects a cross-origin WebSocket path', () => {
    expect(() => sameOriginWebSocketUrl({ protocol: 'https:', host: 'example.com' }, '//attacker.example/websocket')).toThrow(
      'WebSocket path must be same-origin',
    )
  })

  it('keeps a development origin on an insecure WebSocket scheme', () => {
    expect(sameOriginWebSocketUrl({ protocol: 'http:', host: 'localhost:3100' })).toBe('ws://localhost:3100/connection/websocket')
  })

  it('reports a ticket endpoint failure that is not an authorization refusal', async () => {
    await expect(
      requestRealtimeTicket('/token', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 })),
        parse: String,
      }),
    ).rejects.toThrow('Realtime authentication failed with status 500')
  })

  it('lets the application word its own ticket failure', async () => {
    await expect(
      requestRealtimeTicket('/token', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
        parse: String,
        errorMessage: (status) => `realtime is unavailable (${status})`,
      }),
    ).rejects.toThrow('realtime is unavailable (503)')
  })

  it('treats an application-declared status as an authorization refusal', async () => {
    await expect(
      requestRealtimeTicket('/token', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 418 })),
        parse: String,
        unauthorizedStatuses: [418],
      }),
    ).rejects.toMatchObject({ name: 'UnauthorizedError' })
  })

  it('maps authorization responses to Centrifuge unauthorized errors', async () => {
    await expect(
      requestRealtimeTicket('/token', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 })),
        parse: String,
      }),
    ).rejects.toMatchObject({ name: 'UnauthorizedError' })
  })

  it('parses successful application-owned tickets', async () => {
    await expect(
      requestRealtimeTicket('/token', {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ token: 'signed', channel: 'one' })),
        parse: (value) => value as { token: string; channel: string },
      }),
    ).resolves.toEqual({ token: 'signed', channel: 'one' })
  })
})

describe('realtime client lifecycle', () => {
  it('connects and returns a disconnect cleanup', () => {
    const connect = vi.fn()
    const disconnect = vi.fn()
    const client = { connect, disconnect } as unknown as Centrifuge
    const cleanup = connectRealtimeClient(client)
    cleanup()
    expect(connect).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('removes a configured subscription once', () => {
    const subscribe = vi.fn()
    const subscription = { subscribe } as unknown as Subscription
    const cleanup = vi.fn()
    const removeSubscription = vi.fn()
    const client = {
      newSubscription: vi.fn(() => subscription),
      removeSubscription,
    } as unknown as Centrifuge
    const opened = openRealtimeSubscription(client, 'battle:one', {}, () => cleanup)
    opened.close()
    opened.close()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(removeSubscription).toHaveBeenCalledOnce()
  })

  it('removes a subscription when configuration fails', () => {
    const subscription = { subscribe: vi.fn() } as unknown as Subscription
    const removeSubscription = vi.fn()
    const client = {
      newSubscription: vi.fn(() => subscription),
      removeSubscription,
    } as unknown as Centrifuge
    expect(() =>
      openRealtimeSubscription(client, 'battle:one', {}, () => {
        throw new Error('invalid setup')
      }),
    ).toThrow('invalid setup')
    expect(removeSubscription).toHaveBeenCalledWith(subscription)
  })
})

describe('realtime refresh lifecycle', () => {
  it('reports matching publications and unrecovered reconnects', () => {
    const client = new EventEmitter() as unknown as Centrifuge
    const publication = vi.fn()
    const unrecovered = vi.fn()
    const cleanup = watchServerChannel(client, 'workspace:one', { publication, unrecovered })
    client.emit('publication', { channel: 'workspace:one', data: {} })
    client.emit('subscribed', {
      channel: 'workspace:one',
      recoverable: true,
      positioned: true,
      wasRecovering: true,
      recovered: false,
      hasRecoveredPublications: false,
    })
    client.emit('publication', { channel: 'workspace:two', data: {} })
    cleanup()
    client.emit('publication', { channel: 'workspace:one', data: {} })
    expect(publication).toHaveBeenCalledOnce()
    expect(unrecovered).toHaveBeenCalledOnce()
  })

  // A reconnect that recovered every missed publication is not a gap, so the application must not be told it lost state.
  it('stays quiet when a reconnect recovered what it missed', () => {
    const client = new EventEmitter() as unknown as Centrifuge
    const unrecovered = vi.fn()
    watchServerChannel(client, 'workspace:one', { unrecovered })

    client.emit('subscribed', {
      channel: 'workspace:one',
      recoverable: true,
      positioned: true,
      wasRecovering: true,
      recovered: true,
      hasRecoveredPublications: true,
    })

    expect(unrecovered).not.toHaveBeenCalled()
  })

  it('refreshes presence again when a join races the snapshot', async () => {
    let resolveFirst!: (value: { clients: Record<string, ClientInfo> }) => void
    const first = new Promise<{ clients: Record<string, ClientInfo> }>((resolve) => {
      resolveFirst = resolve
    })
    const joined = clientInfo('joined')
    const subscription = new EventEmitter() as unknown as Subscription
    const presence = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({ clients: { joined } })
    subscription.presence = presence
    const update = vi.fn()
    watchSubscriptionPresence(subscription, update)
    subscription.emit('subscribed', subscribedContext('battle:one'))
    subscription.emit('join', { channel: 'battle:one', info: joined })
    resolveFirst({ clients: {} })
    await vi.waitFor(() => expect(presence).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith({ joined }))
  })

  it('refreshes presence again when resubscription races the snapshot', async () => {
    let resolveFirst!: (value: { clients: Record<string, ClientInfo> }) => void
    const first = new Promise<{ clients: Record<string, ClientInfo> }>((resolve) => {
      resolveFirst = resolve
    })
    const current = clientInfo('current')
    const subscription = new EventEmitter() as unknown as Subscription
    const presence = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({ clients: { current } })
    subscription.presence = presence
    const update = vi.fn()
    watchSubscriptionPresence(subscription, update)
    subscription.emit('subscribed', subscribedContext('battle:one'))
    subscription.emit('subscribed', subscribedContext('battle:one'))
    resolveFirst({ clients: { stale: clientInfo('stale') } })
    await vi.waitFor(() => expect(presence).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith({ current }))
  })

  it('ignores a presence snapshot after cleanup', async () => {
    let resolve!: (value: { clients: Record<string, ClientInfo> }) => void
    const pending = new Promise<{ clients: Record<string, ClientInfo> }>((done) => {
      resolve = done
    })
    const subscription = new EventEmitter() as unknown as Subscription
    subscription.presence = vi.fn(() => pending)
    const update = vi.fn()
    const cleanup = watchSubscriptionPresence(subscription, update)
    subscription.emit('subscribed', subscribedContext('battle:one'))
    cleanup()
    resolve({ clients: { late: clientInfo('late') } })
    await pending
    expect(update).toHaveBeenLastCalledWith({})
  })

  // Presence failing must not leave the last known members on screen as though they were still connected.
  it('clears the roster and reports a presence failure', async () => {
    const subscription = new EventEmitter() as unknown as Subscription
    const failure = new Error('presence unavailable')
    subscription.presence = vi
      .fn()
      .mockResolvedValueOnce({ clients: { current: clientInfo('current') } })
      .mockRejectedValueOnce(failure)
    const update = vi.fn()
    const onError = vi.fn()
    watchSubscriptionPresence(subscription, update, { onError })

    subscription.emit('subscribed', subscribedContext('battle:one'))
    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith({ current: clientInfo('current') }))
    subscription.emit('subscribed', subscribedContext('battle:one'))

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
    expect(update).toHaveBeenLastCalledWith({})
  })

  it('ignores a presence failure that arrives after cleanup', async () => {
    let reject!: (error: unknown) => void
    const pending = new Promise<never>((_resolve, fail) => {
      reject = fail
    })
    const subscription = new EventEmitter() as unknown as Subscription
    subscription.presence = vi.fn(() => pending)
    const onError = vi.fn()
    const cleanup = watchSubscriptionPresence(subscription, vi.fn(), { onError })
    subscription.emit('subscribed', subscribedContext('battle:one'))

    cleanup()
    reject(new Error('too late'))
    await pending.catch(() => undefined)

    expect(onError).not.toHaveBeenCalled()
  })

  it('removes a client that left the channel', async () => {
    const staying = clientInfo('staying')
    const leaving = clientInfo('leaving')
    const subscription = new EventEmitter() as unknown as Subscription
    subscription.presence = vi.fn().mockResolvedValue({ clients: { staying, leaving } })
    const update = vi.fn()
    watchSubscriptionPresence(subscription, update)
    subscription.emit('subscribed', subscribedContext('battle:one'))
    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith({ staying, leaving }))

    subscription.emit('leave', { channel: 'battle:one', info: leaving })

    expect(update).toHaveBeenLastCalledWith({ staying })
  })

  // React unmounts and error paths can both run the disposer, and the second run must not re-render an empty roster.
  it('runs its cleanup only once', () => {
    const subscription = new EventEmitter() as unknown as Subscription
    subscription.presence = vi.fn().mockResolvedValue({ clients: {} })
    const update = vi.fn()
    const cleanup = watchSubscriptionPresence(subscription, update)

    cleanup()
    cleanup()

    expect(update).toHaveBeenCalledOnce()
  })
})

function clientInfo(client: string): ClientInfo {
  return { client, user: client }
}

function subscribedContext(channel: string) {
  return {
    channel,
    recoverable: true,
    positioned: true,
    wasRecovering: false,
    recovered: false,
    hasRecoveredPublications: false,
  }
}
