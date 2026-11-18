import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, loadEnv } from 'vite'
import { postHogSourceMaps } from './scripts/posthogSourceMaps.ts'

export default defineConfig(({ mode }) => {
  const sourceMaps = postHogSourceMaps({ ...loadEnv(mode, process.cwd(), ''), ...process.env })
  return {
    resolve: {
      alias: [
        { find: /^posthog-js$/, replacement: 'posthog-js/dist/module.slim.js' },
        { find: /^@posthog\/react$/, replacement: '@posthog/react/slim' },
      ],
    },
    server: { port: 3000, proxy: { '/connection': { target: 'ws://127.0.0.1:8000', ws: true } } },
    plugins: [
      tanstackStart(),
      nitro({
        preset: 'node-server',
        plugins: ['./src/server/shutdown.ts'],
        // The server bundle inlines React Query, whose `'use client'` directives mean nothing on the server.
        rolldownConfig: { checks: { moduleLevelDirective: false } },
      }),
      viteReact(),
      tailwindcss(),
      sourceMaps?.client,
    ],
    ...(sourceMaps ? { worker: { plugins: () => [sourceMaps.worker()] } } : {}),
  }
})
