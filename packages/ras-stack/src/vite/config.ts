import path from 'node:path'
import { loadEnv, mergeConfig } from 'vite'
import type { ConfigEnv, PluginOption, UserConfig, UserConfigExport } from 'vite'
import type { NitroPluginConfig } from 'nitro/vite'
import type { default as posthogRollup, PostHogRollupPluginOptions } from '@posthog/rollup-plugin'
import type { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { preparedPlan } from '../managed/install.js'

export interface BuildIntegrations {
  stylesheet?: string
  start?: Parameters<typeof tanstackStart>[0]
  nitro?: NitroPluginConfig
  posthog?: Partial<PostHogRollupPluginOptions> & { enabled?: boolean }
}

export type RasViteConfig = UserConfig & { ras?: BuildIntegrations }

export async function postHogSourceMapPlugins(
  env: NodeJS.ProcessEnv,
  options: NonNullable<BuildIntegrations['posthog']> = {},
): Promise<ReturnType<typeof posthogRollup>[]> {
  const { enabled, ...overrides } = options
  const personalApiKey = overrides.personalApiKey ?? env.POSTHOG_CLI_API_KEY ?? env.POSTHOG_API_KEY
  const projectId = overrides.projectId ?? env.POSTHOG_CLI_PROJECT_ID ?? env.POSTHOG_PROJECT_ID
  const active =
    enabled ??
    (env.POSTHOG_UPLOAD_SOURCEMAPS === 'true' ||
      (env.POSTHOG_UPLOAD_SOURCEMAPS !== 'false' &&
        (env.CI === 'true' || env.GITHUB_ACTIONS === 'true' || env.CF_PAGES === '1') &&
        Boolean(personalApiKey && projectId)))
  if (!active) return []
  if (!personalApiKey || !projectId) throw new Error('PostHog source-map uploads require a personal API key and project ID')
  const { default: posthog } = await import('@posthog/rollup-plugin')
  return [
    posthog({
      ...overrides,
      personalApiKey,
      projectId,
      host: overrides.host ?? env.POSTHOG_CLI_HOST ?? env.POSTHOG_HOST ?? 'https://us.posthog.com',
      sourcemaps: { enabled: true, deleteAfterUpload: true, ...overrides.sourcemaps },
    }),
  ]
}

export async function configureVite(config: RasViteConfig, presets: readonly string[], env: NodeJS.ProcessEnv): Promise<UserConfig> {
  const { ras = {}, ...overrides } = config
  const root = path.resolve(overrides.root ?? process.cwd())
  const plugins: PluginOption[] = []
  if (presets.includes('tailwind')) {
    const stylesheet = path.resolve(root, ras.stylesheet ?? 'src/styles.css')
    const imports = [
      "@import 'tailwindcss' source('./');",
      ...(presets.includes('tailwind-animations') ? ["@import 'tw-animate-css';"] : []),
    ]
    plugins.push({
      name: 'ras:tailwind-entry',
      enforce: 'pre',
      transform(code, id) {
        if (path.resolve(id.split('?')[0]!) !== stylesheet) return
        return { code: `${imports.join('\n')}\n${code}`, map: null }
      },
    })
  }
  if (presets.includes('start')) {
    const { tanstackStart } = await import('@tanstack/react-start/plugin/vite')
    plugins.push(tanstackStart(ras.start))
  }
  if (presets.includes('nitro')) {
    const { nitro } = await import('nitro/vite')
    plugins.push(nitro(ras.nitro))
  }
  if (presets.includes('react')) {
    const { default: react } = await import('@vitejs/plugin-react')
    plugins.push(react())
  }
  if (presets.includes('tailwind')) {
    const { default: tailwind } = await import('@tailwindcss/vite')
    plugins.push(tailwind())
  }
  const sourceMaps = presets.includes('posthog') ? await postHogSourceMapPlugins(env, ras.posthog) : []
  plugins.push(
    ...sourceMaps.map((plugin) => ({ ...plugin, applyToEnvironment: (environment: { name: string }) => environment.name === 'client' })),
  )
  return mergeConfig(
    {
      resolve: { alias: { '@': path.join(root, 'src') } },
      plugins,
      ...(sourceMaps.length
        ? {
            build: { sourcemap: 'hidden' },
            worker: { plugins: () => [postHogSourceMapPlugins(env, ras.posthog).then(([plugin]) => plugin)] },
          }
        : {}),
    },
    overrides,
  )
}

export function defineViteConfig(
  config: RasViteConfig | ((env: ConfigEnv) => RasViteConfig | Promise<RasViteConfig>) = {},
): UserConfigExport {
  return async (context) => {
    const plan = await preparedPlan(process.cwd())
    const resolved = typeof config === 'function' ? await config(context) : config
    const env = { ...loadEnv(context.mode, process.cwd(), ''), ...process.env }
    return configureVite(resolved, plan.presets.vite, env)
  }
}
