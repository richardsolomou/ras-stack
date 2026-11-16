import type { RealtimeViewer } from './realtime'

// Application policy: replace these rules with the application's own channels, and keep `centrifugo.json`'s namespaces in step.

/** Channels the connection token subscribes the viewer to on the server, so the browser can neither leave nor forge them. */
export function serverChannels(viewer: RealtimeViewer) {
  return viewer.id ? [`user:${viewer.id}`] : []
}

/** Whether the viewer may subscribe to `channel` from the browser; anyone may follow a public `updates:` channel. */
export function canSubscribe(_viewer: RealtimeViewer, channel: string) {
  return /^updates:[\w-]{1,64}$/.test(channel)
}
