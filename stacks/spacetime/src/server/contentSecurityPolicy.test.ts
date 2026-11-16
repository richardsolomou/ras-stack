import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('lets the browser reach the SpacetimeDB server over HTTPS and secure WebSockets', async () => {
  vi.stubEnv('VITE_SPACETIME_URL', 'wss://spacetime.example')
  vi.resetModules()
  const { securityHeaders } = await import('./middleware')
  expect(securityHeaders['content-security-policy']).toContain("connect-src 'self' https://spacetime.example wss://spacetime.example;")
})
