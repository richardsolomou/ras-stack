import type { Centrifuge, ClientInfo, Subscription, SubscriptionOptions } from 'centrifuge'
import { useEffect, useState } from 'react'
import { connectRealtimeClient, openRealtimeSubscription, watchSubscriptionPresence } from './client.js'

export function useConnectedRealtimeClient(create: () => Centrifuge, enabled = true) {
  const [client, setClient] = useState<Centrifuge>()
  useEffect(() => {
    if (!enabled) {
      setClient(undefined)
      return undefined
    }
    const next = create()
    setClient(next)
    return connectRealtimeClient(next)
  }, [create, enabled])
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
    const opened = openRealtimeSubscription(client, channel, subscriptionOptions, configure)
    setSubscription(opened.subscription)
    return opened.close
  }, [channel, client, configure, enabled, subscriptionOptions])
  return subscription
}

export function useRealtimePresence(subscription: Subscription | undefined, options: { onError?: (error: unknown) => void } = {}) {
  const [clients, setClients] = useState<Record<string, ClientInfo>>({})
  const onError = options.onError
  useEffect(() => {
    if (!subscription) {
      setClients({})
      return undefined
    }
    let active = true
    const stop = watchSubscriptionPresence(
      subscription,
      (next) => {
        if (active) setClients(next)
      },
      onError ? { onError } : {},
    )
    return () => {
      active = false
      stop()
    }
  }, [onError, subscription])
  return clients
}
