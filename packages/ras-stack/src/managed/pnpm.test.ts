import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installationPlan } from './plan.js'
import { createHooks, hooks } from './pnpm.js'

const plan = installationPlan({
  integrations: [{ name: 'runtime', packages: { react: '19.3.0' } }],
  tooling: [{ name: 'compiler', devPackages: { typescript: '7.0.2' } }],
})

describe('native dependency injection', () => {
  it('adds runtime dependencies to the application', () => {
    expect(createHooks(plan, 'app', '5.0.0').readPackage({ name: 'app' }).dependencies).toEqual({ react: '19.3.0', 'ras-stack': '5.0.0' })
  })

  it('keeps tooling in development dependencies', () => {
    expect(createHooks(plan, 'app', '5.0.0').readPackage({ name: 'app' }).devDependencies).toEqual({ typescript: '7.0.2' })
  })

  it('leaves the RAS runtime dependency graph alone', () => {
    const manifest = { name: 'ras-stack', version: '5.0.0', dependencies: { yaml: '^2.8.2' } }
    expect(createHooks(plan, 'app', '5.0.0').readPackage(structuredClone(manifest))).toEqual(manifest)
  })

  it('leaves other workspace packages alone', () => {
    const manifest = { name: 'mobile', dependencies: { react: '18.0.0' } }
    expect(createHooks(plan, 'app', '5.0.0').readPackage(structuredClone(manifest))).toEqual(manifest)
  })

  it('preserves unrelated application dependencies', () => {
    expect(createHooks(plan, 'app', '5.0.0').readPackage({ name: 'app', dependencies: { zod: '^4' } }).dependencies?.zod).toBe('^4')
  })

  it('rejects a conflicting override', () => {
    expect(() => createHooks(plan, 'app', '5.0.0').updateConfig({ overrides: { react: '18.0.0' } })).toThrow('conflicts with managed react')
  })

  it('rejects overriding the RAS runtime to another release', () => {
    expect(() => createHooks(plan, 'app', '5.0.0').updateConfig({ overrides: { 'ras-stack': '4.4.2' } })).toThrow(
      'conflicts with managed ras-stack',
    )
  })

  it.each(['react@19.3.0', 'react@^19', 'app>react', 'app@^1>react@>=19'])('rejects a conflicting scoped override %s', (selector) => {
    expect(() => createHooks(plan, 'app', '5.0.0', '1.2.0').updateConfig({ overrides: { [selector]: '18.0.0' } })).toThrow(
      'conflicts with managed react',
    )
  })

  it('matches wildcard overrides against a prerelease target', () => {
    expect(() => createHooks(plan, 'app', '5.0.0-next.4').updateConfig({ overrides: { 'ras-stack@*': '4.4.2' } })).toThrow(
      'conflicts with managed ras-stack',
    )
  })

  it.each(['react@^18', 'mobile>react', 'app@^2>react', 'app@*>react', 'react@', '@scope/mobile@^1>react'])(
    'preserves an unrelated or convergent selector %s',
    (selector) => {
      const overrides = { [selector]: '18.0.0' }
      expect(createHooks(plan, 'app', '5.0.0', '1.0.0-next.1').updateConfig({ overrides }).overrides).toEqual(overrides)
    },
  )

  it('preserves a matching override that selects the managed pin', () => {
    expect(createHooks(plan, 'app', '5.0.0').updateConfig({ overrides: { 'react@^19': '19.3.0' } }).overrides).toEqual({
      'react@^19': '19.3.0',
    })
  })

  it('does not match a versioned parent against an unversioned application', () => {
    expect(createHooks(plan, 'app', '5.0.0').updateConfig({ overrides: { 'app@^1>react': '18.0.0' } }).overrides).toEqual({
      'app@^1>react': '18.0.0',
    })
  })

  it('preserves caller settings and approvals', () => {
    const config = {
      minimumReleaseAge: 10080,
      registry: 'https://example.com',
      allowBuilds: { sharp: true },
      publicHoistPattern: ['existing'],
    }
    expect(createHooks(plan, 'app', '5.0.0').updateConfig(config)).toEqual({ ...config, optimisticRepeatInstall: false })
  })

  it('applies explicitly selected build approvals', () => {
    expect(createHooks({ ...plan, allowBuilds: ['react'] }, 'app', '5.0.0').updateConfig({}).allowBuilds).toEqual({ react: true })
  })

  it('rejects an explicitly denied build', () => {
    expect(() => createHooks({ ...plan, allowBuilds: ['react'] }, 'app', '5.0.0').updateConfig({ allowBuilds: { react: false } })).toThrow(
      'denies react',
    )
  })
})

describe('shipped pnpm hook', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ras-pnpm-hook-'))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'application', packageManager: 'pnpm@12.13.0' }))
    await writeFile(join(root, 'pnpm-workspace.yaml'), '{}\n')
    await writeFile(
      join(root, 'ras.config.ts'),
      "export default {tooling:[{name:'compiler',devPackages:{typescript:'7.0.2'},presets:{typescript:'browser'}}]}\n",
    )
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  it('generates ignored local configuration during updateConfig', async () => {
    await hooks.updateConfig({ lockfileDir: root })
    expect(await readFile(join(root, '.ras/.gitignore'), 'utf8')).toBe('# Generated by RAS.\n*\n')
  })

  it('injects selected tooling through readPackage', async () => {
    await hooks.updateConfig({ dir: root })
    expect((await hooks.readPackage({ name: 'application' })).devDependencies).toEqual({ typescript: '7.0.2' })
  })

  it('finds the root when pnpm runs from a workspace package', async () => {
    const nested = join(root, 'mobile')
    await mkdir(nested)
    vi.spyOn(process, 'cwd').mockReturnValue(nested)
    await hooks.updateConfig({ dir: nested })
    expect((await hooks.readPackage({ name: 'application' })).devDependencies).toEqual({ typescript: '7.0.2' })
  })

  it('rejects calls outside a configured workspace', async () => {
    await rm(join(root, 'pnpm-workspace.yaml'))
    await expect(hooks.updateConfig({})).rejects.toThrow('workspace with a RAS config dependency')
  })
})
