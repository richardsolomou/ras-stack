import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAssetsCli } from './cli.js'

describe('server assets CLI', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('rejects an unrecognized command', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runAssetsCli(['publish'])

    expect(error).toHaveBeenCalledWith('usage: ras assets <check|sync> [config-file]')
    expect(process.exitCode).toBe(2)
  })

  it('reports every drifted destination before the output is synced', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await fixture()

    await runAssetsCli(['check'])

    expect(error.mock.calls.flat()).toEqual(['server asset drift: drizzle', 'run ras assets sync after the production build'])
    expect(process.exitCode).toBe(1)
  })

  it('leaves a synced output free of drift', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await fixture()

    await runAssetsCli(['sync'])
    await runAssetsCli(['check'])

    expect(error).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('reads the configuration file named on the command line', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'custom.json'), JSON.stringify({ outputDirectory: '.output/server', assets: [] }))

    await runAssetsCli(['check', 'custom.json'])

    expect(process.exitCode).toBeUndefined()
  })
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ras-stack-assets-cli-'))
  await mkdir(path.join(root, 'drizzle'), { recursive: true })
  await writeFile(path.join(root, 'drizzle/0000.sql'), 'CREATE TABLE example (id integer);')
  await writeFile(
    path.join(root, 'ras-stack.assets.json'),
    JSON.stringify({ outputDirectory: '.output/server', assets: [{ source: 'drizzle', destination: 'drizzle' }] }),
  )
  vi.spyOn(process, 'cwd').mockReturnValue(root)
  return root
}
