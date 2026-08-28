import { postHogHttpUrl } from './config.js'
import type { PostHogEnvironment } from './config.js'

type ViteProxyTarget = {
  target: string
  changeOrigin: true
  rewrite: (path: string) => string
}

function viteTarget(host: string, ingestPath: string): ViteProxyTarget {
  const prefix = new RegExp(`^${ingestPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  return {
    target: host,
    changeOrigin: true,
    rewrite: (path) => path.replace(prefix, ''),
  }
}

export const POSTHOG_DEFAULT_INGEST_PATH = '/ingest'

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
  return {
    path,
    vite: {
      [`${path}/static`]: viteTarget(assetsHost, path),
      [`${path}/array`]: viteTarget(assetsHost, path),
      [path]: viteTarget(ingestionHost, path),
    },
    nitro: {
      [`${path}/static/**`]: { proxy: `${assetsHost}/static/**` },
      [`${path}/array/**`]: { proxy: `${assetsHost}/array/**` },
      [`${path}/**`]: { proxy: `${ingestionHost}/**` },
    },
  }
}
