/** The `connect-src` sources the browser needs for Convex: HTTP for queries and actions, and the WebSocket for subscriptions. */
export function convexConnectSources(url: string | undefined) {
  if (!url) return []
  const origin = new URL(url).origin
  return [origin, origin.replace(/^http/, 'ws')]
}
