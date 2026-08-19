import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCreateCli } from './index.js'

const directories: string[] = []

afterEach(async () => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ras create', () => {
  it('copies the full-stack reference without generated state', async () => {
    const parent = await temporary()
    const destination = path.join(parent, 'My App')
    await runCreateCli([destination])
    const manifest = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'))
    expect({ name: manifest.name, dependency: manifest.dependencies['ras-stack'] }).toEqual({
      name: 'my-app',
      dependency: expect.stringMatching(/^\^\d+\.\d+\.\d+$/),
    })
    expect(await readFile(path.join(destination, 'pnpm-workspace.yaml'), 'utf8')).toContain('  - ras-stack')
    await expect(readFile(path.join(destination, 'pnpm-workspace.template.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('excludes local secrets while retaining the environment example', async () => {
    const parent = await temporary()
    const destination = path.join(parent, 'app')
    await runCreateCli([destination])
    const ignoreFiles = await Promise.all(['.gitignore', '.dockerignore'].map((file) => readFile(path.join(destination, file), 'utf8')))
    for (const contents of ignoreFiles) {
      expect(contents).toContain('.env\n.env.*\n!.env.example\n')
    }
  })

  it('does not write during a dry run', async () => {
    const parent = await temporary()
    const destination = path.join(parent, 'app')
    await runCreateCli([destination, '--dry-run'])
    await expect(readFile(path.join(destination, 'package.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses to merge into a non-empty directory', async () => {
    const destination = await temporary()
    await writeFile(path.join(destination, 'keep.txt'), 'keep')
    await expect(runCreateCli([destination])).rejects.toThrow('Destination must be an empty directory')
  })
})

async function temporary() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ras-create-'))
  directories.push(directory)
  await mkdir(directory, { recursive: true })
  return directory
}
