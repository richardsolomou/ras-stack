import path from 'node:path'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 3100, proxy: { '/connection': { target: 'ws://localhost:8100', ws: true } } },
  plugins: [tanstackStart(), nitro(), viteReact()],
})
