import { postHogHttpUrl } from './config.js'
import type { PostHogEnvironment } from './config.js'

/**
 * A same-origin proxy receives the application's session cookie and any bearer token with every
 * request. PostHog reads neither, and forwarding them would hand a credential to a third party.
 */
const PRIVATE_HEADERS = ['cookie', 'authorization'] as const

type ProxyRequest = { removeHeader(name: string): void }
type ViteProxyServer = { on(event: 'proxyReq', listener: (request: ProxyRequest) => void): unknown }

type ViteProxyTarget = {
  target: string
  changeOrigin: true
  rewrite: (path: string) => string
  configure: (proxy: ViteProxyServer) => void
}

function viteTarget(host: string, ingestPath: string): ViteProxyTarget {
  const prefix = new RegExp(`^${escapeRegExp(ingestPath)}`)
  return {
    target: host,
    changeOrigin: true,
    rewrite: (path) => path.replace(prefix, ''),
    configure: (proxy) =>
      proxy.on('proxyReq', (request) => {
        for (const name of PRIVATE_HEADERS) request.removeHeader(name)
      }),
  }
}

function nitroTarget(to: string) {
  return { proxy: { to, filterHeaders: [...PRIVATE_HEADERS] } }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Ad-blocker lists match the literal `/ingest` segment on any host, so the default avoids it.
export const POSTHOG_DEFAULT_INGEST_PATH = '/t'

function normalizedIngestPath(path: string): string {
  if (!path.startsWith('/') || path.endsWith('/') || path.includes('?') || path.includes('#')) {
    throw new Error('PostHog ingest path must start with "/", have no trailing slash, and carry no query or fragment')
  }
  return path
}

export function postHogIngestProxy(input: Pick<PostHogEnvironment, 'host' | 'assetsHost'>, options: { path?: string } = {}) {
  const ingestionHost = postHogHttpUrl(input.host, 'host')
  const assetsHost = postHogHttpUrl(input.assetsHost, 'assetsHost')
  const path = normalizedIngestPath(options.path ?? POSTHOG_DEFAULT_INGEST_PATH)
  // Vite matches string keys as bare prefixes, so a short path needs a regular expression bound to its segment.
  const segment = `^${escapeRegExp(path)}`
  return {
    path,
    vite: {
      [`${segment}/static`]: viteTarget(assetsHost, path),
      [`${segment}/array`]: viteTarget(assetsHost, path),
      [`${segment}(?:/|$)`]: viteTarget(ingestionHost, path),
    },
    nitro: {
      [`${path}/static/**`]: nitroTarget(`${assetsHost}/static/**`),
      [`${path}/array/**`]: nitroTarget(`${assetsHost}/array/**`),
      [`${path}/**`]: nitroTarget(`${ingestionHost}/**`),
    },
  }
}
