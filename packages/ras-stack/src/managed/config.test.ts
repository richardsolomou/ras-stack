import { describe, expect, it } from 'vitest'
import { defineConfig, defineIntegration, oxlint, tanstackQuery, tanstackStart, typescript, vite } from '../config.js'
import { installationPlan } from './plan.js'

describe('managed configuration', () => {
  it('selects Query without installing SpacetimeDB', () => {
    expect(installationPlan(defineConfig({ integrations: [tanstackQuery] })).dependencies).not.toHaveProperty('spacetimedb')
  })

  it('includes a single React version for Query and application code', () => {
    const plan = installationPlan(defineConfig({ integrations: [tanstackQuery, tanstackQuery] }))
    expect(Object.keys(plan.dependencies).filter((name) => name === 'react')).toEqual(['react'])
  })

  it('selects compiler and linter versions with their presets', () => {
    const plan = installationPlan(defineConfig({ tooling: [typescript.browser, oxlint] }))
    expect(plan.presets).toEqual({ typescript: 'browser', oxlint: ['application'], vite: [] })
  })

  it('uses NodeNext compiler defaults without a browser framework', () => {
    expect(installationPlan({ tooling: [typescript] }).presets.typescript).toBe('library')
  })

  it('infers browser compiler defaults from Vite', () => {
    expect(installationPlan({ tooling: [typescript, vite] }).presets.typescript).toBe('vite')
  })

  it.each([
    [typescript, tanstackStart],
    [tanstackStart, typescript],
  ])('infers the Start compiler target independently of selection order %#', (...tooling) => {
    expect(installationPlan({ tooling }).presets.typescript).toBe('vite')
  })

  it.each([
    [typescript, typescript.bundler],
    [typescript.bundler, typescript],
  ])('honors an explicit compiler target independently of selection order %#', (...tooling) => {
    expect(installationPlan({ integrations: [tanstackStart], tooling }).presets.typescript).toBe('bundler')
  })

  it('adds Start generated-file exclusions to the ordinary linter opt-in', () => {
    expect(installationPlan({ integrations: [tanstackStart], tooling: [oxlint] }).commands.lint?.args).toEqual([
      '--type-aware',
      '--deny-warnings',
      '--ignore-pattern',
      'src/routeTree.gen.ts',
      '--ignore-pattern',
      '.output/**',
    ])
  })

  it('infers framework defaults through nested integrations', () => {
    const app = defineIntegration({ name: 'app', includes: [tanstackStart] })
    expect(installationPlan({ tooling: [oxlint, typescript, app] }).presets).toEqual({
      typescript: 'vite',
      oxlint: ['application'],
      vite: ['start'],
    })
  })

  it('includes everyday defaults when selecting architecture boundaries alone', () => {
    expect(installationPlan({ tooling: [oxlint.domain, oxlint.layers] }).presets.oxlint).toEqual(['application', 'domain', 'layers'])
  })

  it('keeps architecture boundaries opt-in', () => {
    expect(installationPlan({ tooling: [oxlint] }).presets.oxlint).toEqual(['application'])
  })

  it('does not enable compiler or linter configuration through framework inference', () => {
    expect(installationPlan({ integrations: [tanstackStart] }).presets).toEqual({ oxlint: [], vite: ['start'] })
  })

  it('keeps compiler packages out of runtime dependencies', () => {
    expect(installationPlan({ tooling: [typescript.browser] }).dependencies).toEqual({})
  })

  it('places React types in development dependencies', () => {
    expect(installationPlan({ integrations: [tanstackQuery] }).devDependencies['@types/react']).toBe('19.3.0')
  })

  it('rejects different runtime and development versions of the same package', () => {
    expect(() =>
      defineConfig({ integrations: [{ name: 'conflict', packages: { react: '19.3.0' }, devPackages: { react: '18.0.0' } }] }),
    ).toThrow('Conflicting versions')
  })

  it('prefers runtime ownership when a tool also selects the same package', () => {
    const plan = installationPlan({ integrations: [{ name: 'shared', packages: { react: '19.3.0' }, devPackages: { react: '19.3.0' } }] })
    expect(plan.devDependencies).not.toHaveProperty('react')
  })

  it('rejects incompatible selections', () => {
    const conflicting = defineIntegration({ name: 'conflict', packages: { react: '1.0.0' } })
    expect(() => installationPlan(defineConfig({ integrations: [tanstackQuery, conflicting] }))).toThrow('Conflicting versions for react')
  })

  it('rejects conflicting compiler presets', () => {
    expect(() => installationPlan(defineConfig({ tooling: [typescript.browser, typescript.library] }))).toThrow('one TypeScript preset')
  })

  it.each(['../escape', '@scope/../../escape', 'a/b', 'node_modules'])('rejects unsafe package name %s', (name) => {
    expect(() => defineIntegration({ name: 'unsafe', packages: { [name]: '1.0.0' } })).toThrow('package name')
  })

  it.each(['latest', '^1.0.0', 'file:../package', 'git+https://example.com/a.git'])('rejects unpinned dependency %s', (version) => {
    expect(() => defineIntegration({ name: 'unpinned', packages: { fixture: version } })).toThrow('exact version')
  })

  it('rejects build approvals for packages outside the selection', () => {
    expect(() => defineConfig({ allowBuilds: ['unselected'] })).toThrow('selected dependency')
  })
})
