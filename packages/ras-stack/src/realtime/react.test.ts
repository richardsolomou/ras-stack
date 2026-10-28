import { EventEmitter } from 'node:events'
import type { Centrifuge, Subscription } from 'centrifuge'
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { useConnectedRealtimeClient, useRealtimeSubscription } from './react.js'

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
    warning.mockRestore()
    expect({ connect: connect.mock.calls.length, disconnect: disconnect.mock.calls.length }).toEqual({ connect: 1, disconnect: 1 })
  })

  it('configures the client before connecting and cleans up before disconnecting', async () => {
    const calls: string[] = []
    const { client, connect, disconnect } = eventClient()
    connect.mockImplementation(() => {
      calls.push('connect')
    })
    disconnect.mockImplementation(() => {
      calls.push('disconnect')
    })
    const createClient = () => client
    const configure = () => {
      calls.push('configure')
      return () => calls.push('cleanup')
    }
    let rendered: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(() => (useConnectedRealtimeClient(createClient, true, { configure }), null)))
    })
    await act(async () => rendered.unmount())
    warning.mockRestore()

    expect(calls).toEqual(['configure', 'connect', 'cleanup', 'disconnect'])
  })

  it('connects an asynchronously created client', async () => {
    const { client, connect, disconnect } = eventClient()
    const createClient = async () => client
    let observed: Centrifuge | undefined
    let rendered: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(() => ((observed = useConnectedRealtimeClient(createClient)), null)))
      await Promise.resolve()
    })
    await act(async () => rendered.unmount())
    warning.mockRestore()

    expect({ observed, connect: connect.mock.calls.length, disconnect: disconnect.mock.calls.length }).toEqual({
      observed: client,
      connect: 1,
      disconnect: 1,
    })
  })

  it('does not connect a client resolved after unmount', async () => {
    const { client, connect, disconnect } = eventClient()
    let resolveClient!: (client: Centrifuge) => void
    const pending = new Promise<Centrifuge>((resolve) => {
      resolveClient = resolve
    })
    let rendered: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(() => (useConnectedRealtimeClient(() => pending), null)))
    })
    await act(async () => rendered.unmount())
    await act(async () => resolveClient(client))
    warning.mockRestore()

    expect({ connect: connect.mock.calls.length, disconnect: disconnect.mock.calls.length }).toEqual({ connect: 0, disconnect: 1 })
  })

  it('reports asynchronous client creation failures', async () => {
    const failure = new Error('ticket failed')
    const onError = vi.fn()
    let rendered: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(() => (useConnectedRealtimeClient(() => Promise.reject(failure), true, { onError }), null)))
      await Promise.resolve()
    })
    await act(async () => rendered.unmount())
    warning.mockRestore()

    expect(onError).toHaveBeenCalledWith(failure)
  })

  it('stops returning the client once it is disabled', async () => {
    const { client } = eventClient()
    const createClient = () => client
    const Probe = ({ enabled }: { enabled: boolean }) => (observed.push(useConnectedRealtimeClient(createClient, enabled)), null)
    const observed: (Centrifuge | undefined)[] = []
    let rendered!: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(Probe, { enabled: true }))
    })
    await act(async () => rendered.update(createElement(Probe, { enabled: false })))
    await act(async () => rendered.unmount())
    warning.mockRestore()
    expect(observed.at(-1)).toBeUndefined()
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
    warning.mockRestore()
    expect({ remove: remove.mock.calls.length, subscribe: subscribe.mock.calls.length }).toEqual({ remove: 1, subscribe: 1 })
  })

  it('stops returning the subscription once it is disabled', async () => {
    const { client } = eventClient()
    const subscription = new EventEmitter() as unknown as Subscription
    subscription.subscribe = vi.fn()
    client.newSubscription = vi.fn(() => subscription)
    client.removeSubscription = vi.fn()
    const observed: (Subscription | undefined)[] = []
    const Probe = ({ enabled }: { enabled: boolean }) => (
      observed.push(useRealtimeSubscription({ channel: 'battle:one', client, enabled })),
      null
    )
    let rendered!: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(Probe, { enabled: true }))
    })
    await act(async () => rendered.update(createElement(Probe, { enabled: false })))
    await act(async () => rendered.unmount())
    warning.mockRestore()
    expect(observed.at(-1)).toBeUndefined()
  })

  it('runs the subscription cleanup before removing it', async () => {
    const { client } = eventClient()
    const subscription = new EventEmitter() as unknown as Subscription
    const order: string[] = []
    subscription.subscribe = vi.fn()
    client.newSubscription = vi.fn(() => subscription)
    client.removeSubscription = vi.fn(() => order.push('remove'))
    const configure = () => () => order.push('cleanup')
    let rendered: ReturnType<typeof create>
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      rendered = create(createElement(() => (useRealtimeSubscription({ channel: 'battle:one', client, configure }), null)))
    })
    await act(async () => rendered.unmount())
    warning.mockRestore()
    expect(order).toEqual(['cleanup', 'remove'])
  })

  it('removes a subscription when configuration fails', async () => {
    const { client } = eventClient()
    const subscription = new EventEmitter() as unknown as Subscription
    const remove = vi.fn()
    client.newSubscription = vi.fn(() => subscription)
    client.removeSubscription = remove
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(
      act(async () => {
        create(createElement(() => (useRealtimeSubscription({ channel: 'battle:one', client, configure: failingConfigure }), null)))
      }),
    ).rejects.toThrow('invalid setup')
    warning.mockRestore()
    expect(remove).toHaveBeenCalledWith(subscription)
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

function failingConfigure(): never {
  throw new Error('invalid setup')
}
