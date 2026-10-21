import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { Plugin, UserConfig, UserConfigFnPromise } from 'vite'
import * as installation from '../managed/install.js'
import { installationPlan } from '../managed/plan.js'
import { configureVite, defineViteConfig, postHogSourceMapPlugins } from './config.js'

afterEach(() => vi.restoreAllMocks())

function plugins(config: UserConfig): Plugin[] {
  return (config.plugins as unknown[]).flat(Infinity).filter(Boolean) as Plugin[]
}

it('keeps application settings when applying the build defaults', async () => {
  const config = await configureVite({ server: { port: 4567 } }, [], {})
  expect(config).toMatchObject({ server: { port: 4567 }, resolve: { alias: { '@': path.resolve('src') } } })
})

it('configures the selected framework and build plugins', async () => {
  const config = await configureVite({ ras: { start: {}, nitro: {} } }, ['start', 'nitro', 'react', 'tailwind'], {})
  const names = plugins(config).map((plugin) => plugin.name)
  expect({
    start: names.some((name) => name.includes('tanstack-start')),
    nitro: names.includes('nitro:init'),
    react: names.includes('vite:react-babel'),
    tailwind: names.some((name) => name.startsWith('@tailwindcss/vite')),
  }).toEqual({ start: true, nitro: true, react: true, tailwind: true })
})

it('adds Tailwind imports only to the configured global stylesheet', async () => {
  const config = await configureVite({ root: '/app', ras: { stylesheet: 'src/app.css' } }, ['tailwind', 'tailwind-animations'], {})
  const plugin = config.plugins?.find((candidate) => (candidate as Plugin)?.name === 'ras:tailwind-entry') as Plugin
  const transform = plugin.transform
  if (typeof transform !== 'function') throw new Error('Missing stylesheet transform')
  expect(Reflect.apply(transform, undefined, ['.app {}', '/app/src/app.css?direct'])).toEqual({
    code: "@import 'tailwindcss' source('./');\n@import 'tw-animate-css';\n.app {}",
    map: null,
  })
})

it('leaves other stylesheets unchanged', async () => {
  const config = await configureVite({}, ['tailwind'], {})
  const plugin = config.plugins?.find((candidate) => (candidate as Plugin)?.name === 'ras:tailwind-entry') as Plugin
  if (typeof plugin.transform !== 'function') throw new Error('Missing stylesheet transform')
  expect(Reflect.apply(plugin.transform, undefined, ['.app {}', '/app/other.css'])).toBeUndefined()
})

it.each(['url', 'raw', 'worker', 'sharedworker'])('leaves the %s stylesheet wrapper unchanged', async (query) => {
  const config = await configureVite({}, ['tailwind'], {})
  const plugin = config.plugins?.find((candidate) => (candidate as Plugin)?.name === 'ras:tailwind-entry') as Plugin
  if (typeof plugin.transform !== 'function') throw new Error('Missing stylesheet transform')
  expect(
    Reflect.apply(plugin.transform, undefined, ['export default "/styles.css"', `${path.resolve('src/styles.css')}?${query}`]),
  ).toBeUndefined()
})

it('does not enable uploads for a local build with credentials', async () => {
  expect(await postHogSourceMapPlugins({ POSTHOG_API_KEY: 'test', POSTHOG_PROJECT_ID: '1' })).toEqual([])
})

it('requires credentials when uploads are explicitly enabled', async () => {
  await expect(postHogSourceMapPlugins({}, { enabled: true })).rejects.toThrow('personal API key and project ID')
})

it('honors explicitly disabled uploads in CI', async () => {
  expect(await postHogSourceMapPlugins({ CI: 'true', POSTHOG_API_KEY: 'test', POSTHOG_PROJECT_ID: '1' }, { enabled: false })).toEqual([])
})

it('configures hidden source maps and worker instrumentation for uploads', async () => {
  const config = await configureVite({}, ['posthog'], { CI: 'true', POSTHOG_API_KEY: 'test', POSTHOG_PROJECT_ID: '1' })
  expect(config.build?.sourcemap).toBe('hidden')
  const workerPlugins = config.worker!.plugins!()
  expect(workerPlugins).toHaveLength(1)
  expect(await workerPlugins[0]).toHaveProperty('name')
  const plugin = plugins(config).find((candidate) => candidate.applyToEnvironment)!
  if (typeof plugin.applyToEnvironment !== 'function') throw new Error('Missing client environment scope')
  expect(Reflect.apply(plugin.applyToEnvironment, undefined, [{ name: 'client' }])).toBe(true)
  expect(Reflect.apply(plugin.applyToEnvironment, undefined, [{ name: 'ssr' }])).toBe(false)
})

it('accepts explicit upload settings and a generic CI provider', async () => {
  expect(
    await postHogSourceMapPlugins({ CF_PAGES: '1' }, { personalApiKey: 'test', projectId: '1', host: 'https://eu.posthog.com' }),
  ).toHaveLength(1)
})

it('accepts the CLI upload environment', async () => {
  expect(
    await postHogSourceMapPlugins({ POSTHOG_UPLOAD_SOURCEMAPS: 'true', POSTHOG_CLI_API_KEY: 'test', POSTHOG_CLI_PROJECT_ID: '1' }),
  ).toHaveLength(1)
})

it('loads the selected presets for a default Vite configuration', async () => {
  vi.spyOn(installation, 'preparedPlan').mockResolvedValue(installationPlan({}))
  const config = defineViteConfig() as UserConfigFnPromise
  expect(await config({ command: 'build', mode: 'test' })).toMatchObject({ resolve: { alias: { '@': path.resolve('src') } } })
})

it('supports async application configuration callbacks', async () => {
  vi.spyOn(installation, 'preparedPlan').mockResolvedValue(installationPlan({}))
  const config = defineViteConfig(async ({ mode }): Promise<UserConfig> => ({
    define: { MODE: JSON.stringify(mode) },
  })) as UserConfigFnPromise
  expect((await config({ command: 'build', mode: 'test' })).define).toEqual({ MODE: '"test"' })
})
