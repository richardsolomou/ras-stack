import { EventEmitter } from 'node:events'
import type { Centrifuge, ClientInfo, Subscription } from 'centrifuge'
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { useConnectedRealtimeClient, useRealtimePresence, useRealtimeSubscription } from './react.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('React realtime lifecycle', () => {
  it('connects one client and disconnects it on unmount', async () => {
    const { client, connect, disconnect } = eventClient()
    const createClient = () => client
    let rendered: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(() => (useConnectedRealtimeClient(createClient), null)))
    })
    await act(async () => rendered.unmount())
    const warnings = warning.mock.calls.map(([message]) => String(message))
    warning.mockRestore()
    expect({
      connect: connect.mock.calls.length,
      disconnect: disconnect.mock.calls.length,
      warnings,
    }).toEqual({
      connect: 1,
      disconnect: 1,
      warnings: ['react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer'],
    })
  })

  it('opens one subscription and removes it on unmount', async () => {
    const { client } = eventClient()
    const subscription = new EventEmitter() as unknown as Subscription
    const subscribe = vi.fn()
    const remove = vi.fn()
    subscription.subscribe = subscribe
    client.newSubscription = vi.fn(() => subscription)
    client.removeSubscription = remove
    let rendered: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(() => (useRealtimeSubscription({ channel: 'battle:one', client }), null)))
    })
    await act(async () => rendered.unmount())
    const warnings = warning.mock.calls.map(([message]) => String(message))
    warning.mockRestore()
    expect({
      remove: remove.mock.calls.length,
      subscribe: subscribe.mock.calls.length,
      warnings,
    }).toEqual({
      remove: 1,
      subscribe: 1,
      warnings: ['react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer'],
    })
  })

  it('renders subscription presence snapshots', async () => {
    const subscription = new EventEmitter() as unknown as Subscription
    const present = { one: { client: 'one', user: 'player-one' } satisfies ClientInfo }
    subscription.presence = vi.fn().mockResolvedValue({ clients: present })
    let observed: Record<string, ClientInfo> = {}
    let rendered: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(() => ((observed = useRealtimePresence(subscription)), null)))
    })
    await act(async () => {
      subscription.emit('subscribed', subscribedContext())
      await Promise.resolve()
    })
    const warnings = warning.mock.calls.map(([message]) => String(message))
    await act(async () => rendered.unmount())
    warning.mockRestore()
    expect({ observed, warnings }).toEqual({
      observed: present,
      warnings: ['react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer'],
    })
  })
})

function eventClient() {
  const client = new EventEmitter() as unknown as Centrifuge
  const connect = vi.fn()
  const disconnect = vi.fn()
  client.connect = connect
  client.disconnect = disconnect
  return { client, connect, disconnect }
}

function subscribedContext() {
  return {
    channel: 'battle:one',
    recoverable: true,
    positioned: true,
    wasRecovering: false,
    recovered: false,
    hasRecoveredPublications: false,
  }
}
