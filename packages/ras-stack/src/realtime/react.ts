import type { Centrifuge, Subscription, SubscriptionOptions } from 'centrifuge'
import { useEffect, useState } from 'react'

export function useConnectedRealtimeClient(
  create: () => Centrifuge | Promise<Centrifuge>,
  enabled = true,
  options: { configure?: (client: Centrifuge) => void | (() => void); onError?: (error: unknown) => void } = {},
) {
  const [client, setClient] = useState<Centrifuge>()
  const configure = options.configure
  const onError = options.onError
  useEffect(() => {
    if (!enabled) {
      setClient(undefined)
      return undefined
    }
    let active = true
    let cleanup: (() => void) | undefined
    let connected: Centrifuge | undefined
    const connect = (next: Centrifuge) => {
      if (!active) {
        next.disconnect()
        return
      }
      try {
        cleanup = configure?.(next) ?? undefined
      } catch (error) {
        next.disconnect()
        onError?.(error)
        return
      }
      setClient(next)
      next.connect()
      connected = next
    }
    try {
      const created = create()
      if (created instanceof Promise) void created.then(connect, (error: unknown) => active && onError?.(error))
      else connect(created)
    } catch (error) {
      onError?.(error)
    }
    return () => {
      active = false
      cleanup?.()
      connected?.disconnect()
    }
  }, [configure, create, enabled, onError])
  return client
}

export type RealtimeSubscriptionHookOptions = {
  client?: Centrifuge
  channel?: string
  enabled?: boolean
  options?: SubscriptionOptions
  configure?: (subscription: Subscription) => void | (() => void)
}

export function useRealtimeSubscription(options: RealtimeSubscriptionHookOptions) {
  const [subscription, setSubscription] = useState<Subscription>()
  const { channel, client, configure, enabled = true, options: subscriptionOptions } = options
  useEffect(() => {
    if (!enabled || !client || !channel) {
      setSubscription(undefined)
      return undefined
    }
    const next = client.newSubscription(channel, subscriptionOptions)
    let cleanup: void | (() => void)
    try {
      cleanup = configure?.(next)
      next.subscribe()
    } catch (error) {
      client.removeSubscription(next)
      throw error
    }
    setSubscription(next)
    return () => {
      try {
        cleanup?.()
      } finally {
        client.removeSubscription(next)
      }
    }
  }, [channel, client, configure, enabled, subscriptionOptions])
  return subscription
}
