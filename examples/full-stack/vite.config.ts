import path from 'node:path'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, loadEnv } from 'vite'
import { postHogEnvironment } from 'ras-stack/posthog'
import { postHogIngestProxy } from 'ras-stack/posthog/proxy'

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), '')
  const posthog = postHogEnvironment({ projectToken: values.VITE_POSTHOG_PROJECT_TOKEN, host: values.VITE_POSTHOG_HOST })
  const proxy = posthog ? postHogIngestProxy(posthog) : undefined
  const securityHeaders = {
    'Content-Security-Policy':
      "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }
  return {
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    server: { port: 3100, proxy: { '/connection': { target: 'ws://localhost:8100', ws: true }, ...proxy?.vite } },
    build: {
      rollupOptions: {
        output: { codeSplitting: { groups: [{ name: 'posthog', test: /node_modules[\\/]posthog-js/ }] } },
      },
    },
    plugins: [tanstackStart(), nitro({ routeRules: { '/**': { headers: securityHeaders }, ...proxy?.nitro } }), viteReact()],
  }
})
