import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineConfig, defineIntegration } from '../config.js'
import { installationPlan } from './plan.js'
import { pnpmHook } from './pnpm.js'

interface Manifest {
  name: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, unknown>
}
interface Settings {
  registry?: string
  minimumReleaseAge?: number
  publicHoistPattern?: string[]
  overrides?: Record<string, string>
  allowBuilds?: Record<string, boolean>
}
type Hooks = { updateConfig(config: Settings): Settings; readPackage(pkg: Manifest): Manifest }

describe('native pnpm hook contract', () => {
  let root: string
  let hooks: Hooks
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ras-pnpm-'))
    const plan = installationPlan(
      defineConfig({
        integrations: [defineIntegration({ name: 'query', packages: { '@tanstack/react-query': '5.104.1', react: '19.3.0' } })],
      }),
    )
    const file = join(root, '.pnpmfile.cjs')
    await writeFile(file, pnpmHook(plan))
    hooks = createRequire(import.meta.url)(file).hooks as Hooks
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('preserves the caller release-age policy', () => {
    expect(hooks.updateConfig({ minimumReleaseAge: 10080 }).minimumReleaseAge).toBe(10080)
  })

  it('preserves the caller registry', () => {
    expect(hooks.updateConfig({ registry: 'https://registry.example.com' }).registry).toBe('https://registry.example.com')
  })

  it('preserves unrelated overrides', () => {
    expect(hooks.updateConfig({ overrides: { undici: '7.30.0' } }).overrides?.undici).toBe('7.30.0')
  })

  it('rejects a caller override that conflicts with a managed version', () => {
    expect(() => hooks.updateConfig({ overrides: { react: '18.0.0' } })).toThrow('Consumer override conflicts with managed react')
  })

  it('preserves unrelated build approvals', () => {
    expect(hooks.updateConfig({ allowBuilds: { sharp: true } }).allowBuilds?.sharp).toBe(true)
  })

  it('defaults managed build scripts to denied', () => {
    expect(hooks.updateConfig({}).allowBuilds?.react).toBe(false)
  })

  it('does not replace application package dependencies', () => {
    const pkg = { name: 'application', dependencies: { lodash: '4.17.21' } }
    expect(hooks.readPackage(pkg)).toEqual(pkg)
  })

  it('converts selected optional peers into pinned dependencies on RAS', () => {
    const pkg = hooks.readPackage({
      name: 'ras-stack',
      peerDependencies: { react: '>=19 <20', postgres: '>=3 <4' },
      peerDependenciesMeta: { react: { optional: true } },
    })
    expect(pkg.dependencies?.react).toBe('19.3.0')
    expect(pkg.peerDependencies).toEqual({ postgres: '>=3 <4' })
  })

  it('does not publicly hoist an unselected SDK', () => {
    expect(hooks.updateConfig({ publicHoistPattern: ['existing'] }).publicHoistPattern).toEqual([
      'existing',
      '@tanstack/react-query',
      'react',
    ])
  })
})
