import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkServerAssets, syncServerAssets, type ServerAssetsConfig } from './index.js'

describe('production server assets', () => {
  it('copies declared files and verifies exact output content', async () => {
    const root = await fixture()
    await syncServerAssets(root, config)
    expect({
      drift: await checkServerAssets(root, config),
      migration: await readFile(path.join(root, '.output/server/drizzle/0000.sql'), 'utf8'),
    }).toEqual({
      drift: [],
      migration: 'CREATE TABLE example (id integer);',
    })
  })

  it('detects changed and additional output files', async () => {
    const root = await fixture()
    await syncServerAssets(root, config)
    await writeFile(path.join(root, '.output/server/drizzle/0000.sql'), 'changed')
    await writeFile(path.join(root, '.output/server/drizzle/extra.sql'), 'extra')
    expect(await checkServerAssets(root, config)).toEqual(['drizzle'])
  })

  it('rejects source and destination path escapes', async () => {
    const root = await fixture()
    await expect(syncServerAssets(root, { outputDirectory: '../output', assets: [] })).rejects.toThrow('outputDirectory must stay inside')
    await expect(
      syncServerAssets(root, { outputDirectory: '.output/server', assets: [{ source: 'drizzle', destination: '../../outside' }] }),
    ).rejects.toThrow('assets[0].destination must stay inside')
  })

  it('rejects overlapping destinations before copying in parallel', async () => {
    const root = await fixture()
    await expect(
      syncServerAssets(root, {
        outputDirectory: '.output/server',
        assets: [
          { source: 'drizzle', destination: 'data' },
          { source: 'outside.txt', destination: 'data/file.txt' },
        ],
      }),
    ).rejects.toThrow('asset destinations must not overlap: data and data/file.txt')
  })

  it('rejects symbolic links instead of copying external content', async () => {
    const root = await fixture()
    await symlink(path.join(root, 'outside.txt'), path.join(root, 'drizzle/link'))
    await expect(syncServerAssets(root, config)).rejects.toThrow('server assets must not contain symbolic links')
  })
})

const config: ServerAssetsConfig = {
  outputDirectory: '.output/server',
  assets: [{ source: 'drizzle', destination: 'drizzle' }],
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ras-stack-assets-'))
  await mkdir(path.join(root, 'drizzle'), { recursive: true })
  await writeFile(path.join(root, 'drizzle/0000.sql'), 'CREATE TABLE example (id integer);')
  await writeFile(path.join(root, 'outside.txt'), 'private')
  return root
}
