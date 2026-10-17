import { EventEmitter } from 'node:events'
import { Centrifuge } from 'centrifuge'
import { describe, expect, it, vi } from 'vitest'
import { createSameOriginRealtimeClient, requestRealtimeTicket, watchServerChannel } from './client.js'

vi.mock('centrifuge', async (importOriginal) => ({ ...(await importOriginal<typeof import('centrifuge')>()), Centrifuge: vi.fn() }))

describe('realtime client transport', () => {
  it('connects to a secure same-origin WebSocket URL', () => {
    createSameOriginRealtimeClient({ token: 'signed' }, { location: { protocol: 'https:', host: 'example.com' } })
    expect(Centrifuge).toHaveBeenLastCalledWith('wss://example.com/connection/websocket', { token: 'signed' })
  })

  it('rejects a cross-origin WebSocket path', () => {
    expect(() =>
      createSameOriginRealtimeClient({}, { location: { protocol: 'https:', host: 'example.com' }, path: '//attacker.example/websocket' }),
    ).toThrow('WebSocket path must be same-origin')
  })

  it('keeps a development origin on an insecure WebSocket scheme', () => {
    createSameOriginRealtimeClient({}, { location: { protocol: 'http:', host: 'localhost:3100' } })
    expect(Centrifuge).toHaveBeenLastCalledWith('ws://localhost:3100/connection/websocket', {})
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
})
