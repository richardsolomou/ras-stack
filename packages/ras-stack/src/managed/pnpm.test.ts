import { beforeEach, describe, expect, it } from 'vitest'
import { defineConfig, defineIntegration } from '../config.js'
import { installationPlan } from './plan.js'
import { createHooks } from './pnpm.js'

type Hooks = ReturnType<typeof createHooks>

describe('native pnpm hook contract', () => {
  let hooks: Hooks
  beforeEach(() => {
    const plan = installationPlan(
      defineConfig({
        integrations: [defineIntegration({ name: 'query', packages: { '@tanstack/react-query': '5.104.1', react: '19.3.0' } })],
      }),
    )
    hooks = createHooks(plan, 'application', '5.0.0')
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
    const pkg = { name: 'unrelated', dependencies: { lodash: '4.17.21' } }
    expect(hooks.readPackage(pkg)).toEqual(pkg)
  })

  it('attaches selected dependencies to RAS', () => {
    expect(hooks.readPackage({ name: 'ras-stack', version: '5.0.0' }).dependencies?.react).toBe('19.3.0')
  })

  it('leaves a different workspace RAS version alone', () => {
    expect(hooks.readPackage({ name: 'ras-stack', version: '4.0.0' }).dependencies).toBeUndefined()
  })

  it('rejects an override that changes the RAS runtime version', () => {
    expect(() => hooks.updateConfig({ overrides: { 'ras-stack': '4.0.0' } })).toThrow('conflicts with managed ras-stack')
  })

  it('attaches selected dependencies to the consuming application', () => {
    expect(hooks.readPackage({ name: 'application' }).dependencies?.react).toBe('19.3.0')
  })

  it('leaves native hoisting configuration unchanged', () => {
    expect(hooks.updateConfig({ publicHoistPattern: ['existing'] }).publicHoistPattern).toEqual(['existing'])
  })

  it('does not introduce workspace-wide overrides', () => {
    expect(hooks.updateConfig({}).overrides).toBeUndefined()
  })
})

it('installs the runtime RAS version matching the config dependency', () => {
  const hooks = createHooks(installationPlan({}), 'application', '5.1.0')
  expect(hooks.readPackage({ name: 'application' }).dependencies?.['ras-stack']).toBe('5.1.0')
})
