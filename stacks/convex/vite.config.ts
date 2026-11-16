import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { postHogSourceMaps } from './scripts/posthogSourceMaps.ts'
import { staticHeaders } from './scripts/staticHeaders.ts'

export default defineConfig(({ mode }) => {
  const sourceMaps = postHogSourceMaps({ ...loadEnv(mode, process.cwd(), ''), ...process.env })
  return {
    server: { port: 3000 },
    plugins: [
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      // Pages that read Convex render live from the Worker; prerendering would bake a build-time snapshot into their HTML.
      tanstackStart({ prerender: { enabled: true, filter: (page) => page.path !== '/notes' } }),
      viteReact(),
      tailwindcss(),
      sourceMaps?.client,
      staticHeaders,
    ],
    ...(sourceMaps ? { worker: { plugins: () => [sourceMaps.worker()] } } : {}),
    environments: {
      ssr: {
        build: {
          // The Worker keeps source maps for readable stack traces, and Vite's stub for `styles.css?url` produces none.
          rolldownOptions: { checks: { sourcemapBroken: false } },
        },
      },
    },
  }
})
