import {
  Centrifuge,
  UnauthorizedError,
  type ClientInfo,
  type Options,
  type ServerPublicationContext,
  type ServerSubscribedContext,
  type Subscription,
  type SubscriptionOptions,
} from 'centrifuge'

type BrowserLocation = Pick<Location, 'host' | 'protocol'>

export function sameOriginWebSocketUrl(location: BrowserLocation, path = '/connection/websocket') {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('WebSocket path must be same-origin')
  const url = new URL(path, `${location.protocol}//${location.host}`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export type RealtimeTicketOptions<T> = {
  fetch?: typeof fetch
  init?: RequestInit
  parse: (value: unknown) => T
  unauthorizedStatuses?: readonly number[]
  errorMessage?: (status: number) => string
}

export async function requestRealtimeTicket<T>(input: RequestInfo | URL, options: RealtimeTicketOptions<T>) {
  const response = await (options.fetch ?? fetch)(input, options.init)
  if ((options.unauthorizedStatuses ?? [401, 403]).includes(response.status)) throw new UnauthorizedError('unauthorized')
  if (!response.ok)
    throw new Error(options.errorMessage?.(response.status) ?? `Realtime authentication failed with status ${response.status}`)
  return options.parse(await response.json())
}

export function createSameOriginRealtimeClient(options: Partial<Options>, config: { location?: BrowserLocation; path?: string } = {}) {
  const location = config.location ?? window.location
  return new Centrifuge(sameOriginWebSocketUrl(location, config.path), options)
}

export function connectRealtimeClient(client: Centrifuge) {
  client.connect()
  return () => client.disconnect()
}

export type RealtimeSubscription = {
  subscription: Subscription
  close: () => void
}

export function openRealtimeSubscription(
  client: Centrifuge,
  channel: string,
  options: SubscriptionOptions = {},
  configure?: (subscription: Subscription) => void | (() => void),
): RealtimeSubscription {
  const subscription = client.newSubscription(channel, options)
  let cleanup: void | (() => void)
  try {
    cleanup = configure?.(subscription)
    subscription.subscribe()
  } catch (error) {
    client.removeSubscription(subscription)
    throw error
  }
  let closed = false
  return {
    subscription,
    close: () => {
      if (closed) return
      closed = true
      try {
        cleanup?.()
      } finally {
        client.removeSubscription(subscription)
      }
    },
  }
}

export function watchServerChannel(
  client: Centrifuge,
  channel: string,
  handlers: { publication?: (context: ServerPublicationContext) => void; unrecovered?: (context: ServerSubscribedContext) => void },
) {
  const publication = (context: ServerPublicationContext) => {
    if (context.channel === channel) handlers.publication?.(context)
  }
  const subscribed = (context: ServerSubscribedContext) => {
    if (context.channel === channel && context.wasRecovering && !context.recovered) handlers.unrecovered?.(context)
  }
  client.on('publication', publication)
  client.on('subscribed', subscribed)
  return () => {
    client.off('publication', publication)
    client.off('subscribed', subscribed)
  }
}

export function watchSubscriptionPresence(
  subscription: Subscription,
  update: (clients: Record<string, ClientInfo>) => void,
  options: { onError?: (error: unknown) => void } = {},
) {
  const clients = new Map<string, ClientInfo>()
  let active = true
  let revision = 0
  let refreshing: Promise<void> | undefined
  const render = () => update(Object.fromEntries(clients))
  const sync = async (): Promise<void> => {
    const requestedAt = revision
    try {
      const snapshot = await subscription.presence()
      if (!active) return
      if (revision !== requestedAt) return sync()
      clients.clear()
      for (const [id, info] of Object.entries(snapshot.clients)) clients.set(id, info)
      render()
    } catch (error) {
      if (!active) return
      if (revision !== requestedAt) return sync()
      clients.clear()
      render()
      options.onError?.(error)
    }
  }
  const refresh = () => {
    if (refreshing) return refreshing
    refreshing = sync().finally(() => {
      refreshing = undefined
    })
    return refreshing
  }
  const subscribed = () => {
    revision++
    void refresh()
  }
  const join = ({ info }: { info: ClientInfo }) => {
    revision++
    clients.set(info.client, info)
    render()
  }
  const leave = ({ info }: { info: ClientInfo }) => {
    revision++
    clients.delete(info.client)
    render()
  }
  subscription.on('subscribed', subscribed)
  subscription.on('join', join)
  subscription.on('leave', leave)
  return () => {
    if (!active) return
    active = false
    subscription.off('subscribed', subscribed)
    subscription.off('join', join)
    subscription.off('leave', leave)
    clients.clear()
    render()
  }
}
