import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkConsumer, preparedPlan } from './install.js'

const manifest = { name: 'application', packageManager: 'pnpm@12.13.0' }

describe('managed configuration ownership', () => {
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

  it.each(['pnpm@10.33.0', 'npm@11.0.0'])('rejects unsupported package manager %s', async (packageManager) => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ ...manifest, packageManager }))
    await expect(checkConsumer(root)).rejects.toThrow('pnpm 11 or newer')
  })

  it('rejects an unnamed consumer', async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: manifest.packageManager }))
    await expect(checkConsumer(root)).rejects.toThrow('unique name')
  })

  it('rejects a consumer-owned generated directory', async () => {
    await mkdir(join(root, '.ras'))
    await expect(checkConsumer(root)).rejects.toThrow('consumer-owned .ras')
  })

  it('rejects a generated directory symlink', async () => {
    await symlink(root, join(root, '.ras'))
    await expect(checkConsumer(root)).rejects.toThrow('must not be a symbolic link')
  })

  it('rejects an uninstalled selection', async () => {
    await expect(preparedPlan(root)).rejects.toThrow('Managed @ras-test/alpha@1.0.0 is not installed; run ras sync')
  })

  it('rejects a nested workspace consumer', async () => {
    const nested = join(root, 'nested')
    await mkdir(nested)
    await writeFile(join(nested, 'package.json'), JSON.stringify(manifest))
    await expect(checkConsumer(nested)).rejects.toThrow('workspace root')
  })
})
