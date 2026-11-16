import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('lets the browser reach the Convex deployment over HTTPS and secure WebSockets', async () => {
  vi.stubEnv('VITE_CONVEX_URL', 'https://example-deployment.convex.cloud')
  vi.resetModules()
  const { securityHeaders } = await import('./middleware')
  expect(securityHeaders['content-security-policy']).toContain(
    "connect-src 'self' https://example-deployment.convex.cloud wss://example-deployment.convex.cloud;",
  )
})
