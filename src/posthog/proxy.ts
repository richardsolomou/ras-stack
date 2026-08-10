import { postHogHttpUrl } from './config.js'
import type { PostHogEnvironment } from './config.js'

type ViteProxyTarget = {
  target: string
  changeOrigin: true
  rewrite: (path: string) => string
}

function viteTarget(host: string): ViteProxyTarget {
  return {
    target: host,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/ingest/, ''),
  }
}

export function postHogIngestProxy(input: Pick<PostHogEnvironment, 'host' | 'assetsHost'>) {
  const ingestionHost = postHogHttpUrl(input.host, 'host')
  const assetsHost = postHogHttpUrl(input.assetsHost, 'assetsHost')
  return {
    vite: {
      '/ingest/static': viteTarget(assetsHost),
      '/ingest/array': viteTarget(assetsHost),
      '/ingest': viteTarget(ingestionHost),
    },
    nitro: {
      '/ingest/static/**': { proxy: `${assetsHost}/static/**` },
      '/ingest/array/**': { proxy: `${assetsHost}/array/**` },
      '/ingest/**': { proxy: `${ingestionHost}/**` },
    },
  }
}
