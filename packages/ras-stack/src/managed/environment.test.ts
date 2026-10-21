import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineConfig, oxlint, typescript } from '../config.js'
import { commandPath, writeEnvironment } from './environment.js'
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
    await writeEnvironment(join(root, '.ras'), installationPlan(defineConfig({ tooling: [typescript.browser] })))
    const file = join(root, '.ras/tsconfig.json')
    const config = JSON.parse(await readFile(file, 'utf8')) as { extends: string }
    expect(resolve(dirname(file), config.extends)).toBe(join(root, 'node_modules/ras-stack-config/config/typescript/browser.json'))
  })

  it('composes linter presets in selection order', async () => {
    await writeEnvironment(join(root, '.ras'), installationPlan(defineConfig({ tooling: [oxlint.application, oxlint.domain] })))
    const config = JSON.parse(await readFile(join(root, '.ras/oxlint.json'), 'utf8')) as { extends: string[] }
    expect(config.extends).toEqual([
      '../node_modules/ras-stack-config/config/oxlint/application.json',
      '../node_modules/ras-stack-config/config/oxlint/domain.json',
    ])
  })

  it('uses the standalone base preset without an extra path segment', async () => {
    await writeEnvironment(join(root, '.ras'), installationPlan(defineConfig({ tooling: [oxlint.base] })))
    const config = JSON.parse(await readFile(join(root, '.ras/oxlint.json'), 'utf8')) as { extends: string[] }
    expect(config.extends).toEqual(['../node_modules/ras-stack-config/config/oxlint.json'])
  })

  it('points editors to the normally installed compiler', async () => {
    await writeEnvironment(join(root, '.ras'), installationPlan(defineConfig({ tooling: [typescript.library] })))
    const settings = JSON.parse(await readFile(join(root, '.ras/vscode-settings.json'), 'utf8')) as Record<string, string>
    expect(settings['typescript.tsdk']).toBe('node_modules/typescript/lib')
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
