import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runChangesetsCli } from './cli.js'

const roots: string[] = []
afterEach(async () => {
  process.exitCode = undefined
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('changeset validation CLI', () => {
  it.each([[], ['sync'], ['check', 'extra']].map((arguments_) => ({ arguments_ })))(
    'rejects unsupported arguments $arguments_',
    async ({ arguments_ }) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await runChangesetsCli(arguments_)
      expect({ calls: error.mock.calls, exitCode: process.exitCode }).toEqual({ calls: [['usage: ras changesets check']], exitCode: 2 })
    },
  )

  it('rejects release notes referencing an unknown workspace package', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const root = await repository()
    await writeFile(join(root, '.changeset/invalid.md'), '---\nunknown: patch\n---\nFix it.\n')
    await runChangesetsCli(['check'])
    expect({ calls: error.mock.calls, exitCode: process.exitCode }).toEqual({
      calls: [['.changeset/invalid.md: unknown package "unknown"']],
      exitCode: 1,
    })
  })

  it('accepts a repository with no pending release without generating policy files', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await repository()
    await runChangesetsCli(['check'])
    expect({ calls: error.mock.calls, exitCode: process.exitCode }).toEqual({ calls: [], exitCode: undefined })
  })
})

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'ras-changesets-cli-'))
  roots.push(root)
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
  await mkdir(join(root, '.changeset'))
  vi.spyOn(process, 'cwd').mockReturnValue(root)
  return root
}
