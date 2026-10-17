import { Centrifuge, UnauthorizedError, type Options, type ServerPublicationContext, type ServerSubscribedContext } from 'centrifuge'

type BrowserLocation = Pick<Location, 'host' | 'protocol'>

function sameOriginWebSocketUrl(location: BrowserLocation, path = '/connection/websocket') {
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
