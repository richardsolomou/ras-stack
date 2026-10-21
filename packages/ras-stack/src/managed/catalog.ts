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
const auth = defineIntegration({ name: 'better-auth', packages: { 'better-auth': '1.7.10' } })
export const betterAuth = {
  ...auth,
  stripe: defineIntegration({ name: 'better-auth-stripe', includes: [auth], packages: { '@better-auth/stripe': '1.7.10' } }),
  oauth: defineIntegration({
    name: 'better-auth-oauth',
    includes: [auth],
    packages: { '@better-auth/oauth-provider': '1.7.10', '@better-auth/cimd': '1.7.10' },
  }),
  mcp: defineIntegration({ name: 'better-auth-mcp', includes: [auth], packages: { '@better-auth/mcp': '1.7.10' } }),
} as const
export const tanstackStart = defineIntegration({
  name: 'tanstack-start',
  includes: [tanstackQuery],
  packages: { '@tanstack/react-start': '1.168.61', '@tanstack/react-router': '1.170.42', '@tanstack/react-router-ssr-query': '1.167.3' },
})
export const tanstackForm = defineIntegration({ name: 'tanstack-form', includes: [react], packages: { '@tanstack/react-form': '1.33.5' } })
export const tanstackTable = defineIntegration({
  name: 'tanstack-table',
  includes: [react],
  packages: { '@tanstack/react-table': '9.2.8' },
})
export const tanstackVirtual = defineIntegration({
  name: 'tanstack-virtual',
  includes: [react],
  packages: { '@tanstack/react-virtual': '3.14.15' },
})
export const ui = {
  primitives: defineIntegration({ name: 'ui-primitives', includes: [react], packages: { '@base-ui/react': '1.9.0' } }),
  variants: defineIntegration({ name: 'ui-variants', packages: { 'class-variance-authority': '0.7.1' } }),
  classes: defineIntegration({ name: 'ui-classes', packages: { clsx: '2.1.1', 'tailwind-merge': '3.7.0' } }),
  cn: defineIntegration({ name: 'ui-cn', packages: { cn: '0.4.0' } }),
  icons: defineIntegration({ name: 'ui-icons', includes: [react], packages: { 'lucide-react': '1.55.0' } }),
  scaffold: defineIntegration({ name: 'ui-scaffold', packages: { shadcn: '4.21.4' } }),
} as const
export const zod = defineIntegration({ name: 'zod', packages: { zod: '4.6.6' } })
export const fflate = defineIntegration({ name: 'fflate', packages: { fflate: '0.8.3' } })
export const pRetry = defineIntegration({ name: 'p-retry', packages: { 'p-retry': '8.0.1' } })
export const qrcode = defineIntegration({ name: 'qrcode', packages: { qrcode: '1.5.4', '@types/qrcode': '1.5.6' } })
export const confetti = defineIntegration({ name: 'confetti', packages: { 'canvas-confetti': '1.9.4', '@types/canvas-confetti': '1.9.0' } })
const threeCore = defineIntegration({ name: 'three', packages: { three: '0.186.1', '@types/three': '0.186.0' } })
export const three = {
  ...threeCore,
  stdlib: defineIntegration({ name: 'three-stdlib', includes: [threeCore], packages: { 'three-stdlib': '2.36.1' } }),
} as const
export const mcp = defineIntegration({ name: 'mcp', packages: { '@modelcontextprotocol/sdk': '1.32.1' } })
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
  build: defineIntegration({ name: 'posthog-build', packages: { '@posthog/rollup-plugin': '1.6.1' } }),
  cli: defineIntegration({ name: 'posthog-cli', packages: { '@posthog/cli': '0.18.10' } }),
  mcp: defineIntegration({ name: 'posthog-mcp', includes: [mcp], packages: { '@posthog/mcp': '0.22.3' } }),
} as const

const tailwindCore = defineIntegration({ name: 'tailwind', packages: { tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.3' } })
export const tailwind = {
  ...tailwindCore,
  animations: defineIntegration({ name: 'tailwind-animations', includes: [tailwindCore], packages: { 'tw-animate-css': '1.4.0' } }),
} as const
export const changesets = defineIntegration({ name: 'changesets', packages: { '@changesets/cli': '3.0.3' } })
export const drizzleKit = defineIntegration({ name: 'drizzle-kit', packages: { 'drizzle-kit': '0.31.11' } })
export const tsx = defineIntegration({ name: 'tsx', packages: { tsx: '4.23.15' } })
export const esbuild = defineIntegration({ name: 'esbuild', packages: { esbuild: '0.28.2' } })
export const nitro = defineIntegration({ name: 'nitro', packages: { nitro: '3.0.260903-beta' } })
export const markdownlint = defineIntegration({ name: 'markdownlint', packages: { 'markdownlint-cli2': '0.23.3' } })

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
