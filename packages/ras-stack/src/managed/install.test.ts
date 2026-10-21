import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkConsumer, loadPlan, preparedPlan } from './install.js'
import { hooks } from './pnpm.js'

const manifest = { name: 'application', packageManager: 'pnpm@12.13.0' }

describe('native managed configuration', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ras-native-'))
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest))
    await writeFile(join(root, 'ras.config.ts'), "export default {integrations:[{name:'fixture',packages:{'@ras-test/alpha':'1.0.0'}}]}\n")
    await writeFile(join(root, 'pnpm-workspace.yaml'), '{}\n')
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  it('injects selected packages into the application during native resolution', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    expect((await hooks.readPackage({ name: 'application' })).dependencies?.['@ras-test/alpha']).toBe('1.0.0')
  })

  it('finds the workspace from a nested working directory', async () => {
    const nested = join(root, 'nested')
    await mkdir(nested)
    vi.spyOn(process, 'cwd').mockReturnValue(nested)
    expect((await hooks.readPackage({ name: 'application' })).dependencies?.['@ras-test/alpha']).toBe('1.0.0')
  })

  it('rejects a package hook without a workspace', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/')
    await expect(hooks.readPackage({ name: 'application' })).rejects.toThrow('workspace with a RAS config dependency')
  })

  it('requires the pnpm configuration directory', async () => {
    await expect(hooks.updateConfig({})).rejects.toThrow('workspace directory')
  })

  it('writes configuration before pnpm installs regular dependencies', async () => {
    await hooks.updateConfig({ lockfileDir: root })
    expect(await readFile(join(root, '.ras/.gitignore'), 'utf8')).toContain('Generated')
  })

  it.each(['ras-stack', '@ras-test/alpha'])('rejects duplicate manifest ownership of %s', async (name) => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ ...manifest, dependencies: { [name]: '1.0.0' } }))
    await expect(checkConsumer(root, await loadPlan(root))).rejects.toThrow('remove it before RAS can own it')
  })

  it.each(['pnpm@11.15.0', 'pnpm@12.11.2', 'npm@11.0.0'])('rejects unsupported package manager %s', async (packageManager) => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ ...manifest, packageManager }))
    await expect(checkConsumer(root, await loadPlan(root))).rejects.toThrow('pnpm 12.12 or newer')
  })

  it('rejects an unnamed consumer', async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: manifest.packageManager }))
    await expect(checkConsumer(root, await loadPlan(root))).rejects.toThrow('unique name')
  })

  it('rejects a consumer-owned generated directory', async () => {
    await mkdir(join(root, '.ras'))
    await expect(checkConsumer(root, await loadPlan(root))).rejects.toThrow('consumer-owned .ras')
  })

  it('rejects a generated directory symlink', async () => {
    await symlink(root, join(root, '.ras'))
    await expect(checkConsumer(root, await loadPlan(root))).rejects.toThrow('must not be a symbolic link')
  })

  it('rejects an uninstalled selection', async () => {
    await expect(preparedPlan(root)).rejects.toThrow('Managed @ras-test/alpha@1.0.0 is not installed; run pnpm install')
  })

  it('rejects a nested workspace consumer', async () => {
    const nested = join(root, 'nested')
    await mkdir(nested)
    await writeFile(join(nested, 'package.json'), JSON.stringify(manifest))
    await expect(checkConsumer(nested, await loadPlan(root))).rejects.toThrow('workspace root')
  })
})
