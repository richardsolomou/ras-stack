import type { RealtimePolicy } from './realtime'

// Application policy: replace these rules with the application's own channels, and keep `centrifugo.json`'s namespaces in step.
// A rule that reads the database turns this into a function of the services it needs, called in `createApp`.
export const channelPolicy: RealtimePolicy = {
  /** Channels the connection token subscribes the viewer to on the server, so the browser can neither leave nor forge them. */
  serverChannels: (viewer) => (viewer.id ? [`user:${viewer.id}`] : []),
  /** Whether the viewer may subscribe to `channel` from the browser; anyone may follow a public `updates:` channel. */
  canSubscribe: (_viewer, channel) => /^updates:[\w-]{1,64}$/.test(channel),
}
