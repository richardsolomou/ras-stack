import { describe, expect, it } from 'vitest'
import { postHogIngestProxy } from './proxy.js'

describe('PostHog ingest proxy', () => {
  it('keeps ingestion and static assets on their correct upstreams', () => {
    const proxy = postHogIngestProxy({
      host: 'https://us.i.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
    })
    expect(proxy.vite['/ingest']).toMatchObject({ target: 'https://us.i.posthog.com', changeOrigin: true })
    expect(proxy.vite['/ingest/static']).toMatchObject({ target: 'https://us-assets.i.posthog.com', changeOrigin: true })
    expect(proxy.nitro['/ingest/**']).toEqual({ proxy: 'https://us.i.posthog.com/**' })
    expect(proxy.nitro['/ingest/array/**']).toEqual({ proxy: 'https://us-assets.i.posthog.com/array/**' })
  })
})
