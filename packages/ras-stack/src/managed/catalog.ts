import { defineIntegration } from './model.js'
import type { Integration } from './model.js'

export const react = defineIntegration({
  name: 'react',
  packages: { react: '19.3.0', 'react-dom': '19.3.0', '@types/react': '19.3.0', '@types/react-dom': '19.3.0' },
})
export const tanstackQuery = defineIntegration({
  name: 'tanstack-query',
  includes: [react],
  packages: { '@tanstack/react-query': '5.104.1' },
})
export const spacetimeDB = defineIntegration({ name: 'spacetimedb', packages: { spacetimedb: '2.12.0' } })
export const betterAuth = defineIntegration({ name: 'better-auth', packages: { 'better-auth': '1.7.10' } })
export const tanstackStart = defineIntegration({
  name: 'tanstack-start',
  includes: [tanstackQuery],
  packages: { '@tanstack/react-start': '1.168.61', '@tanstack/react-router': '1.170.42', '@tanstack/react-router-ssr-query': '1.167.3' },
  presets: { vite: ['start'] },
})
export const sqlite = defineIntegration({
  name: 'sqlite',
  packages: { 'better-sqlite3': '13.0.3', '@types/better-sqlite3': '9.6.0', 'drizzle-orm': '0.45.4' },
})
export const postgres = defineIntegration({ name: 'postgres', packages: { postgres: '3.4.9', 'drizzle-orm': '0.45.4' } })
export const libsql = defineIntegration({ name: 'libsql', packages: { '@libsql/client': '0.18.0', 'drizzle-orm': '0.45.4' } })
export const email = defineIntegration({ name: 'email', packages: { nodemailer: '10.1.0', '@types/nodemailer': '8.0.2' } })
export const uploads = defineIntegration({ name: 'uploads', packages: { 'tus-js-client': '4.3.1' } })
export const realtime = defineIntegration({ name: 'realtime', packages: { centrifuge: '5.7.4' } })
const posthogBrowser = defineIntegration({ name: 'posthog-browser', packages: { 'posthog-js': '1.438.12' } })
export const posthog = {
  browser: posthogBrowser,
  react: defineIntegration({ name: 'posthog-react', includes: [react, posthogBrowser], packages: { '@posthog/react': '1.11.3' } }),
  server: defineIntegration({
    name: 'posthog-server',
    packages: {
      'posthog-node': '5.56.2',
      '@opentelemetry/api-logs': '0.223.0',
      '@opentelemetry/exporter-logs-otlp-http': '0.223.0',
      '@opentelemetry/resources': '2.12.0',
      '@opentelemetry/sdk-logs': '0.223.0',
    },
  }),
  build: defineIntegration({
    name: 'posthog-build',
    packages: { '@posthog/rollup-plugin': '1.6.1' },
    presets: { vite: ['posthog'] },
  }),
} as const

const tailwindCore = defineIntegration({
  name: 'tailwind',
  packages: { tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.3' },
  presets: { vite: ['tailwind'] },
})
export const tailwind = {
  ...tailwindCore,
  animations: defineIntegration({
    name: 'tailwind-animations',
    includes: [tailwindCore],
    packages: { 'tw-animate-css': '1.4.0' },
    presets: { vite: ['tailwind-animations'] },
  }),
} as const
export const nitro = defineIntegration({
  name: 'nitro',
  packages: { nitro: '3.0.260903-beta' },
  presets: { vite: ['nitro'] },
})

export const typescript = Object.fromEntries(
  ['base', 'bundler', 'browser', 'library', 'tanstack'].map((preset) => [
    preset,
    defineIntegration({
      name: `typescript-${preset}`,
      packages: { typescript: '7.0.2', '@types/node': '26.2.0' },
      presets: { typescript: preset },
      commands: { typecheck: { package: 'typescript', bin: 'tsc', args: ['--noEmit'] } },
    }),
  ]),
) as Record<'base' | 'bundler' | 'browser' | 'library' | 'tanstack', Integration>
export const oxlint = Object.fromEntries(
  ['base', 'application', 'tanstack', 'domain', 'layers'].map((preset) => [
    preset,
    defineIntegration({
      name: `oxlint-${preset}`,
      packages: { oxlint: '1.87.0', 'oxlint-tsgolint': '7.0.2004' },
      presets: { oxlint: [preset] },
      commands: { lint: { package: 'oxlint', bin: 'oxlint', args: ['--type-aware', '--deny-warnings'] } },
    }),
  ]),
) as Record<'base' | 'application' | 'tanstack' | 'domain' | 'layers', Integration>
export const oxfmt = defineIntegration({
  name: 'oxfmt',
  packages: { oxfmt: '0.72.0' },
  commands: { format: { package: 'oxfmt', bin: 'oxfmt', args: ['--write'] } },
})
export const vite = defineIntegration({
  name: 'vite',
  packages: { vite: '8.3.4', '@vitejs/plugin-react': '6.1.2' },
  presets: { vite: ['react'] },
  commands: { dev: { package: 'vite', bin: 'vite' }, build: { package: 'vite', bin: 'vite', args: ['build'] } },
})
export const vitest = defineIntegration({
  name: 'vitest',
  packages: { vitest: '5.0.3', '@vitest/coverage-v8': '5.0.3' },
  commands: { test: { package: 'vitest', bin: 'vitest', args: ['run'] } },
})
export const playwright = defineIntegration({
  name: 'playwright',
  packages: { '@playwright/test': '1.64.0' },
  commands: { e2e: { package: '@playwright/test', bin: 'playwright', args: ['test'] } },
})
