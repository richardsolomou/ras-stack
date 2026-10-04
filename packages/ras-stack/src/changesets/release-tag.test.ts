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
  await Promise.all(
    ['ras-stack', 'config'].map(async (directory) => {
      await mkdir(join(root, 'packages', directory), { recursive: true })
      await writeFile(
        join(root, 'packages', directory, 'package.json'),
        JSON.stringify({ version: directory === 'config' ? '1.0.0' : '2.0.2' }),
      )
    }),
  )
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['add', 'packages'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'fixture'], {
    cwd: root,
    stdio: 'ignore',
  })
  return root
}

describe('independent package release tags', () => {
  it('tags a configuration-only release without bumping the runtime package', async () => {
    const root = await repository()
    await writeFile(join(root, 'packages/config/package.json'), JSON.stringify({ version: '1.0.1' }))
    expect(execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' }).trim()).toBe('config-v1.0.1')
  })

  it('uses the runtime release tag when both packages change', async () => {
    const root = await repository()
    await Promise.all(
      ['ras-stack', 'config'].map((directory) =>
        writeFile(
          join(root, 'packages', directory, 'package.json'),
          JSON.stringify({ version: directory === 'config' ? '1.0.1' : '3.0.0' }),
        ),
      ),
    )
    expect(execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' }).trim()).toBe('v3.0.0')
  })

  it('refuses a release without a changed package version', async () => {
    const root = await repository()
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
    expect({ status: result.status, reason: result.stderr.includes('Versioning did not change a publishable package') }).toEqual({
      status: 1,
      reason: true,
    })
  })
})
