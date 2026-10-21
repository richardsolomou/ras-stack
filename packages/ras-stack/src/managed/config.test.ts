import { describe, expect, it } from 'vitest'
import {
  betterAuth,
  defineConfig,
  defineIntegration,
  oxlint,
  posthog,
  react,
  spacetimeDB,
  tailwind,
  tanstackQuery,
  typescript,
  ui,
} from '../config.js'
import { installationPlan } from './plan.js'

describe('managed configuration', () => {
  it('selects Query without installing SpacetimeDB', () => {
    expect(installationPlan(defineConfig({ integrations: [tanstackQuery] })).dependencies).not.toHaveProperty('spacetimedb')
  })

  it('includes a single React version for Query and application code', () => {
    const plan = installationPlan(defineConfig({ integrations: [react, tanstackQuery, tanstackQuery] }))
    expect(Object.keys(plan.dependencies).filter((name) => name === 'react')).toEqual(['react'])
  })

  it('selects the SpacetimeDB SDK through a typed descriptor', () => {
    expect(installationPlan(defineConfig({ integrations: [spacetimeDB] })).dependencies.spacetimedb).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('selects compiler and linter versions with their presets', () => {
    const plan = installationPlan(defineConfig({ tooling: [typescript.browser, oxlint.application] }))
    expect(plan.presets).toEqual({ typescript: 'browser', oxlint: ['application'] })
  })

  it('leaves auth plugins out of the core selection', () => {
    expect(installationPlan({ integrations: [betterAuth] }).dependencies).not.toHaveProperty('@better-auth/stripe')
  })

  it('keeps the Stripe auth plugin on the core auth release', () => {
    const packages = installationPlan({ integrations: [betterAuth.stripe] }).dependencies
    expect(packages['@better-auth/stripe']).toBe(packages['better-auth'])
  })

  it('does not install the Stripe plugin for OAuth', () => {
    expect(installationPlan({ integrations: [betterAuth.oauth] }).dependencies).not.toHaveProperty('@better-auth/stripe')
  })

  it('selects the compiled class utility without the alternative class utilities', () => {
    expect(installationPlan({ integrations: [ui.cn] }).dependencies).toEqual({ cn: '0.4.0' })
  })

  it('leaves animation styles out of the base Tailwind selection', () => {
    expect(installationPlan({ tooling: [tailwind] }).dependencies).not.toHaveProperty('tw-animate-css')
  })

  it('does not select a browser SDK for PostHog build tools', () => {
    expect(installationPlan({ tooling: [posthog.build] }).dependencies).not.toHaveProperty('posthog-js')
  })

  it('rejects incompatible selections', () => {
    const conflicting = defineIntegration({ name: 'conflict', packages: { react: '1.0.0' } })
    expect(() => installationPlan(defineConfig({ integrations: [react, conflicting] }))).toThrow('Conflicting versions for react')
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
