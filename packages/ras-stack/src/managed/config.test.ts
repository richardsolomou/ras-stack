import { describe, expect, it } from 'vitest'
import { defineConfig, defineIntegration, oxlint, tanstackQuery, typescript } from '../config.js'
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
    const plan = installationPlan(defineConfig({ tooling: [typescript.browser, oxlint.application] }))
    expect(plan.presets).toEqual({ typescript: 'browser', oxlint: ['application'], vite: [] })
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
