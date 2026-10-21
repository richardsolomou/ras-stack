import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const script = fileURLToPath(new URL('../../scripts/releaseTag.mjs', import.meta.url))
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'ras-release-tag-'))
  roots.push(root)
  await mkdir(join(root, 'packages/ras-stack'), { recursive: true })
  await writeFile(join(root, 'packages/ras-stack/package.json'), JSON.stringify({ version: '4.4.2' }))
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['add', 'packages'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'fixture'], {
    cwd: root,
    stdio: 'ignore',
  })
  return root
}

describe('RAS release tags', () => {
  it('tags a major release from the single package version', async () => {
    const root = await repository()
    await writeFile(join(root, 'packages/ras-stack/package.json'), JSON.stringify({ version: '5.0.0' }))
    expect(execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' }).trim()).toBe('v5.0.0')
  })

  it('refuses a release without a changed package version', async () => {
    const root = await repository()
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
    expect({ status: result.status, reason: result.stderr.includes('Versioning did not change ras-stack') }).toEqual({
      status: 1,
      reason: true,
    })
  })
})
