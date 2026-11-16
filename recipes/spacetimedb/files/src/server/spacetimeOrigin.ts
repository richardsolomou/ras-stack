/** The `connect-src` sources the browser needs: HTTP to exchange its token, and the WebSocket itself. */
export function spacetimeConnectSources(url: string | undefined) {
  if (!url) return []
  const origin = new URL(url).origin.replace(/^ws/, 'http')
  return [origin, origin.replace(/^http/, 'ws')]
}
