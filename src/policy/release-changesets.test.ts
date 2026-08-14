import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const exec = promisify(execFile)

// The script is read out of the workflow rather than copied here, so this cannot drift from what CI runs.
async function releaseScript() {
  const source = await readFile(new URL('../../.github/workflows/release-changesets.yml', import.meta.url), 'utf8')
  const workflow = parse(source) as { jobs: { release: { steps: { name?: string; run?: string }[] } } }
  const step = workflow.jobs.release.steps.find((candidate) => candidate.name === 'Release pending changesets')
  if (!step?.run) throw new Error('release step is missing its script')
  return step.run
}

describe('changeset release workflow', () => {
  it('stands down when the branch carries no changesets', async () => {
    const fixture = await repository({ changesets: false })

    const { stdout } = await run(fixture, fixture.head)

    expect(await outputs(fixture)).toEqual({ created: 'false', tag: '', sha: fixture.head })
    expect(stdout).not.toContain('::notice::')
  })

  // A second merge moves the branch while the first run is still queued, which is ordinary rather than broken.
  it('stands down when the branch advanced past the commit that triggered it', async () => {
    const fixture = await repository({ changesets: true })

    const { stdout } = await run(fixture, fixture.previous)

    expect(await outputs(fixture)).toEqual({ created: 'false', tag: '', sha: fixture.previous })
    expect(stdout).toContain(`::notice::main advanced past ${fixture.previous}`)
  })

  it('keeps releasing when the triggering commit is still the branch head', async () => {
    const fixture = await repository({ changesets: true })

    // The version command is the first thing past the guard, so reaching it proves the guard let the run through.
    await expect(run(fixture, fixture.head, { VERSION_COMMAND: 'echo reached-version-command >&2 && exit 3' })).rejects.toMatchObject({
      stderr: expect.stringContaining('reached-version-command'),
    })
  })
})

async function run(fixture: Fixture, sha: string, overrides: Record<string, string> = {}) {
  return exec('bash', ['-c', await releaseScript()], {
    cwd: fixture.work,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: fixture.work,
      GITHUB_OUTPUT: fixture.output,
      GITHUB_SHA: sha,
      GITHUB_REF_NAME: 'main',
      GH_TOKEN: 'unused',
      TAG_PREFIX: 'v',
      VERSION_COMMAND: 'true',
      ...overrides,
    },
  })
}

async function outputs(fixture: Fixture) {
  const written = await readFile(fixture.output, 'utf8')
  return Object.fromEntries(
    written
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  ) as Record<string, string>
}

type Fixture = { work: string; output: string; head: string; previous: string }

async function repository(options: { changesets: boolean }): Promise<Fixture> {
  const remote = await mkdtemp(join(tmpdir(), 'ras-stack-release-origin-'))
  const work = await mkdtemp(join(tmpdir(), 'ras-stack-release-'))
  await exec('git', ['init', '--bare', '--initial-branch=main'], { cwd: remote })
  await exec('git', ['init', '--initial-branch=main'], { cwd: work })
  await exec('git', ['config', 'user.name', 'Test'], { cwd: work })
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: work })
  await exec('git', ['remote', 'add', 'origin', remote], { cwd: work })

  if (options.changesets) {
    await mkdir(join(work, '.changeset'), { recursive: true })
    await writeFile(join(work, '.changeset/pending.md'), "---\n'example': minor\n---\n\nA pending change.\n")
  }

  await writeFile(join(work, 'file.txt'), 'first')
  await exec('git', ['add', '-A'], { cwd: work })
  await exec('git', ['commit', '-m', 'first'], { cwd: work })
  const previous = (await exec('git', ['rev-parse', 'HEAD'], { cwd: work })).stdout.trim()

  await writeFile(join(work, 'file.txt'), 'second')
  await exec('git', ['commit', '-am', 'second'], { cwd: work })
  const head = (await exec('git', ['rev-parse', 'HEAD'], { cwd: work })).stdout.trim()
  await exec('git', ['push', 'origin', 'main'], { cwd: work })

  return { work, output: join(work, 'github-output'), head, previous }
}
