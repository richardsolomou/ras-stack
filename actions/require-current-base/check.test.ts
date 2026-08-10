import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const script = new URL('./check.sh', import.meta.url).pathname

describe('current base check', () => {
  it('accepts a head containing the declared base', async () => {
    const repository = await fixtureRepository()
    const base = await commit(repository, 'base')
    const head = await commit(repository, 'head')

    await expect(run(repository, base, head)).resolves.toMatchObject({ stdout: expect.stringContaining('contains base') })
  })

  it('rejects a head missing the declared base', async () => {
    const repository = await fixtureRepository()
    const original = await commit(repository, 'original')
    const staleHead = await commit(repository, 'stale')
    await exec('git', ['reset', '--hard', original], { cwd: repository })
    const currentBase = await commit(repository, 'current-base')

    await expect(run(repository, currentBase, staleHead)).rejects.toMatchObject({
      stderr: expect.stringContaining('refresh the dependency branch'),
    })
  })

  it('rejects untrusted revision syntax', async () => {
    const repository = await fixtureRepository()
    const head = await commit(repository, 'head')

    await expect(run(repository, 'HEAD~1', head)).rejects.toMatchObject({ stderr: expect.stringContaining('must be a full commit SHA') })
  })
})

async function fixtureRepository() {
  const directory = await mkdtemp(join(tmpdir(), 'ras-stack-current-base-'))
  await exec('git', ['init', '--initial-branch=main'], { cwd: directory })
  await exec('git', ['config', 'user.name', 'Test'], { cwd: directory })
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: directory })
  return directory
}

async function commit(repository: string, contents: string) {
  await writeFile(join(repository, 'fixture.txt'), contents)
  await exec('git', ['add', 'fixture.txt'], { cwd: repository })
  await exec('git', ['commit', '-m', contents], { cwd: repository })
  return (await exec('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim()
}

async function run(repository: string, base: string, head: string) {
  return exec('bash', [script], { cwd: repository, env: { ...process.env, BASE_SHA: base, HEAD_SHA: head } })
}
