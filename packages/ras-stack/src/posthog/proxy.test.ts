import { describe, expect, it } from 'vitest'
import { postHogIngestProxy } from './proxy.js'

const environment = { host: 'https://us.i.posthog.com', assetsHost: 'https://us-assets.i.posthog.com' }

describe('PostHog ingest proxy', () => {
  it('defaults to a short path that ad-blocker lists targeting /ingest miss', () => {
    const proxy = postHogIngestProxy(environment)
    expect(proxy.path).toBe('/t')
    expect(proxy.vite['^/t(?:/|$)']).toMatchObject({ target: 'https://us.i.posthog.com', changeOrigin: true })
    expect(proxy.vite['^/t/static']).toMatchObject({ target: 'https://us-assets.i.posthog.com', changeOrigin: true })
    expect(proxy.nitro['/t/**']?.proxy.to).toBe('https://us.i.posthog.com/**')
    expect(proxy.nitro['/t/array/**']?.proxy.to).toBe('https://us-assets.i.posthog.com/array/**')
  })

  it('binds the Vite routes to the whole path segment so application routes sharing the prefix stay local', () => {
    const key = Object.keys(postHogIngestProxy(environment).vite).find((candidate) => candidate.endsWith('(?:/|$)'))
    const matches = (url: string) => new RegExp(key!).test(url)
    expect(['/t', '/t/e/', '/t/decide/?v=3'].map(matches)).toEqual([true, true, true])
    expect(['/teams', '/tanstack/route', '/'].map(matches)).toEqual([false, false, false])
  })

  it('rewrites through a custom path', () => {
    const proxy = postHogIngestProxy(environment, { path: '/relay' })
    expect(proxy.path).toBe('/relay')
    expect(proxy.vite['^/relay(?:/|$)']).toMatchObject({ target: 'https://us.i.posthog.com', changeOrigin: true })
    expect(proxy.vite['^/relay(?:/|$)']?.rewrite('/relay/e')).toBe('/e')
    expect(proxy.vite['^/relay/static']).toMatchObject({ target: 'https://us-assets.i.posthog.com', changeOrigin: true })
    expect(proxy.nitro['/relay/**']?.proxy.to).toBe('https://us.i.posthog.com/**')
    expect(proxy.nitro['/relay/array/**']?.proxy.to).toBe('https://us-assets.i.posthog.com/array/**')
  })

  it('keeps the session cookie and bearer token out of every Nitro proxy route', () => {
    const routes = Object.values(postHogIngestProxy(environment).nitro)
    expect(routes.map((route) => route.proxy.filterHeaders)).toEqual(routes.map(() => ['cookie', 'authorization']))
  })

  it('removes the session cookie and bearer token from every Vite proxy request', () => {
    const removed = Object.values(postHogIngestProxy(environment).vite).map((target) => {
      const names: string[] = []
      target.configure({ on: (_event, listener) => listener({ removeHeader: (name) => names.push(name) }) })
      return names
    })
    expect(removed).toEqual(removed.map(() => ['cookie', 'authorization']))
  })

  it('rejects a path missing a leading slash, a trailing slash, or carrying a query or fragment', () => {
    for (const path of ['relay', '/relay/', '/relay?x=1']) {
      expect(() => postHogIngestProxy(environment, { path })).toThrow(
        'PostHog ingest path must start with "/", have no trailing slash, and carry no query or fragment',
      )
    }
  })
})
