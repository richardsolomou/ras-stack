import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('fails when the build has no SpacetimeDB settings, since no page can render', async () => {
  vi.stubEnv('VITE_SPACETIME_URL', '')
  vi.resetModules()
  const { Route } = await import('./health')
  const handlers = Route.options.server?.handlers as { GET: () => Promise<Response> }
  expect((await handlers.GET()).status).toBe(503)
})
