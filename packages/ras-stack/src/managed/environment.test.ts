import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineConfig, oxlint, typescript } from '../config.js'
import { commandPath, environmentFiles, prepareEnvironment } from './environment.js'
import { installationPlan } from './plan.js'

describe('generated tooling environment', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ras-environment-'))
    await mkdir(join(root, '.ras'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('resolves the compiler preset from the shared dependency graph', async () => {
    const files = environmentFiles(installationPlan(defineConfig({ tooling: [typescript.browser] })))
    const file = join(root, '.ras/tsconfig.json')
    const config = JSON.parse(files['tsconfig.json']!) as { extends: string }
    expect(resolve(dirname(file), config.extends)).toBe(join(root, 'node_modules/ras-stack/config/typescript/browser.json'))
  })

  it('composes linter presets in selection order', async () => {
    const files = environmentFiles(installationPlan(defineConfig({ tooling: [oxlint, oxlint.domain] })))
    const config = JSON.parse(files['oxlint.json']!) as { extends: string[] }
    expect(config.extends).toEqual([
      '../node_modules/ras-stack/config/oxlint/application.json',
      '../node_modules/ras-stack/config/oxlint/domain.json',
    ])
  })

  it('uses the base preset without an extra path segment', async () => {
    const files = environmentFiles(
      installationPlan(defineConfig({ tooling: [{ name: 'base-lint', includes: [oxlint], presets: { oxlint: ['base'] } }] })),
    )
    const config = JSON.parse(files['oxlint.json']!) as { extends: string[] }
    expect(config.extends).toContain('../node_modules/ras-stack/config/oxlint.json')
  })

  it('points editors to the normally installed compiler', async () => {
    const files = environmentFiles(installationPlan(defineConfig({ tooling: [typescript.library] })))
    const settings = JSON.parse(files['vscode-settings.json']!) as Record<string, string>
    expect(settings['typescript.tsdk']).toBe('node_modules/typescript/lib')
  })

  it('rebuilds generated presets after a native install', async () => {
    await prepareEnvironment(root, installationPlan({ tooling: [typescript.browser] }))
    expect(JSON.parse(await readFile(join(root, '.ras/tsconfig.json'), 'utf8')).extends).toBe(
      '../node_modules/ras-stack/config/typescript/browser.json',
    )
  })

  it('does not rewrite identical local presets', async () => {
    const plan = installationPlan({ tooling: [typescript.browser] })
    await prepareEnvironment(root, plan)
    const before = await stat(join(root, '.ras/tsconfig.json'))
    await prepareEnvironment(root, plan)
    expect((await stat(join(root, '.ras/tsconfig.json'))).ino).toBe(before.ino)
  })

  it('removes generated configuration after deselection', async () => {
    await prepareEnvironment(root, installationPlan({ tooling: [typescript.browser] }))
    await prepareEnvironment(root, installationPlan({}))
    await expect(readFile(join(root, '.ras/tsconfig.json'))).rejects.toThrow('ENOENT')
  })

  it('repairs corrupt local generated JSON', async () => {
    await writeFile(join(root, '.ras/tsconfig.json'), 'broken')
    await prepareEnvironment(root, installationPlan({ tooling: [typescript.browser] }))
    expect(JSON.parse(await readFile(join(root, '.ras/tsconfig.json'), 'utf8')).extends).toBe(
      '../node_modules/ras-stack/config/typescript/browser.json',
    )
  })

  it('resolves a string-form package executable', async () => {
    await mkdir(join(root, 'node_modules/tool'), { recursive: true })
    await writeFile(join(root, 'node_modules/tool/package.json'), JSON.stringify({ bin: './bin.js' }))
    expect(await commandPath(root, 'tool', 'tool')).toBe(join(root, 'node_modules/tool/bin.js'))
  })

  it('rejects a package that does not publish the requested executable', async () => {
    await mkdir(join(root, 'node_modules/tool'), { recursive: true })
    await writeFile(join(root, 'node_modules/tool/package.json'), '{}')
    await expect(commandPath(root, 'tool', 'missing')).rejects.toThrow('safe missing executable')
  })
})
