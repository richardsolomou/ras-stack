import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPolicyCli } from './cli.js'

describe('policy CLI', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('rejects the removed adoption argument rather than syncing something else', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runPolicyCli(['sync', 'adoption'])

    expect(error).toHaveBeenCalledWith('usage: ras policy <check|sync>')
    expect(process.exitCode).toBe(2)
  })

  it('rejects the removed fleet command', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runPolicyCli(['fleet'])

    expect(error).toHaveBeenCalledWith('usage: ras policy <check|sync>')
    expect(process.exitCode).toBe(2)
  })

  it('fails a check that finds generated files missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await repository()

    await runPolicyCli(['check'])

    expect(error).toHaveBeenCalledWith('run ras policy sync and commit the result')
    expect(process.exitCode).toBe(1)
  })

  it('writes the generated files a sync produces', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await repository()

    await runPolicyCli(['sync'])
    await runPolicyCli(['check'])

    expect(log.mock.calls.flat()).toContain('updated .changeset/config.json')
    expect(process.exitCode).toBeUndefined()
  })
})

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'ras-stack-policy-cli-'))
  await writeFile(join(root, 'ras-stack.policy.json'), `${JSON.stringify({ changesets: true })}\n`)
  vi.spyOn(process, 'cwd').mockReturnValue(root)
  return root
}
