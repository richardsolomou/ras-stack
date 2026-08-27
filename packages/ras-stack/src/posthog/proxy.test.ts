import { describe, expect, it } from 'vitest'
import { postHogIngestProxy } from './proxy.js'

describe('PostHog ingest proxy', () => {
  it('keeps ingestion and static assets on their correct upstreams', () => {
    const proxy = postHogIngestProxy({
      host: 'https://us.i.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
    })
    expect(proxy.path).toBe('/ingest')
    expect(proxy.vite['/ingest']).toMatchObject({ target: 'https://us.i.posthog.com', changeOrigin: true })
    expect(proxy.vite['/ingest/static']).toMatchObject({ target: 'https://us-assets.i.posthog.com', changeOrigin: true })
    expect(proxy.nitro['/ingest/**']).toEqual({ proxy: 'https://us.i.posthog.com/**' })
    expect(proxy.nitro['/ingest/array/**']).toEqual({ proxy: 'https://us-assets.i.posthog.com/array/**' })
  })

  it('rewrites through a custom path so ad-blocker lists targeting the well-known /ingest path miss it', () => {
    const proxy = postHogIngestProxy(
      { host: 'https://us.i.posthog.com', assetsHost: 'https://us-assets.i.posthog.com' },
      { path: '/relay' },
    )
    expect(proxy.path).toBe('/relay')
    expect(proxy.vite['/relay']).toMatchObject({ target: 'https://us.i.posthog.com', changeOrigin: true })
    expect(proxy.vite['/relay']?.rewrite('/relay/e')).toBe('/e')
    expect(proxy.vite['/relay/static']).toMatchObject({ target: 'https://us-assets.i.posthog.com', changeOrigin: true })
    expect(proxy.nitro['/relay/**']).toEqual({ proxy: 'https://us.i.posthog.com/**' })
    expect(proxy.nitro['/relay/array/**']).toEqual({ proxy: 'https://us-assets.i.posthog.com/array/**' })
  })

  it('rejects a path missing a leading slash, a trailing slash, or carrying a query or fragment', () => {
    const environment = { host: 'https://us.i.posthog.com', assetsHost: 'https://us-assets.i.posthog.com' }
    expect(() => postHogIngestProxy(environment, { path: 'relay' })).toThrow(
      'PostHog ingest path must start with "/", have no trailing slash, and carry no query or fragment',
    )
    expect(() => postHogIngestProxy(environment, { path: '/relay/' })).toThrow(
      'PostHog ingest path must start with "/", have no trailing slash, and carry no query or fragment',
    )
    expect(() => postHogIngestProxy(environment, { path: '/relay?x=1' })).toThrow(
      'PostHog ingest path must start with "/", have no trailing slash, and carry no query or fragment',
    )
  })
})
