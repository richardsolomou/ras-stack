import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const exec = promisify(execFile)

// The script is read out of the workflow rather than copied here, so this cannot drift from what CI runs.
async function releaseScript() {
  const source = await readFile(new URL('../../../../.github/workflows/release-changesets.yml', import.meta.url), 'utf8')
  const workflow = parse(source) as { jobs: { release: { steps: { name?: string; run?: string }[] } } }
  const step = workflow.jobs.release.steps.find((candidate) => candidate.name === 'Release pending changesets')
  if (!step?.run) throw new Error('release step is missing its script')
  return step.run
}

async function publicationScript() {
  const source = await readFile(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const workflow = parse(source) as { jobs: { publish: { steps: { name?: string; run?: string }[] } } }
  const step = workflow.jobs.publish.steps.find((candidate) => candidate.name === 'Publish through the OIDC-trusted workflow')
  if (!step?.run) throw new Error('publication step is missing its script')
  return step.run
}

async function releaseVerificationScript() {
  const source = await readFile(new URL('../../../../.github/workflows/release.yml', import.meta.url), 'utf8')
  const workflow = parse(source) as { jobs: { publish: { steps: { name?: string; run?: string }[] } } }
  const step = workflow.jobs.publish.steps.find((candidate) => candidate.name === 'Verify release version')
  if (!step?.run) throw new Error('release verification step is missing its script')
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

describe('npm publication dispatch', () => {
  it('watches the newly dispatched tagged workflow instead of stale runs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ras-stack-publication-'))
    const bin = join(root, 'bin')
    const dispatched = join(root, 'dispatched')
    const log = join(root, 'gh.log')
    const gh = join(bin, 'gh')
    await mkdir(bin)
    await writeFile(
      gh,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$GH_LOG"\nif [ "$1 $2" = "workflow run" ]; then\n  touch "$GH_DISPATCHED"\nfi\nif [ "$1 $2" = "run list" ]; then\n  if [ -e "$GH_DISPATCHED" ]; then\n    printf \'%s\\n\' \'[{"databaseId":41,"displayTitle":"Release v1.2.3","conclusion":"success"},{"databaseId":42,"displayTitle":"Release v1.2.3","conclusion":"failure"},{"databaseId":123,"displayTitle":"Release v1.2.3","conclusion":null}]\'\n  else\n    printf \'%s\\n\' \'[{"databaseId":41,"displayTitle":"Release v1.2.3","conclusion":"success"},{"databaseId":42,"displayTitle":"Release v1.2.3","conclusion":"failure"}]\'\n  fi\nfi\n',
    )
    await chmod(gh, 0o755)

    await exec('bash', ['-c', await publicationScript()], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        GH_DISPATCHED: dispatched,
        GH_LOG: log,
        GH_TOKEN: 'unused',
        GITHUB_REPOSITORY: 'richardsolomou/ras-stack',
        RELEASE_TAG: 'v1.2.3',
      },
    })

    const calls = (await readFile(log, 'utf8')).trim().split('\n')
    expect(calls).toContain('workflow run release.yml --repo richardsolomou/ras-stack --ref v1.2.3 -f release_tag=v1.2.3')
    expect(calls.at(-1)).toBe('run watch 123 --repo richardsolomou/ras-stack --exit-status')
  })

  it('exempts the creator and its runtime dependency from the release-age gate', async () => {
    const source = await readFile(new URL('../../../../pnpm-workspace.yaml', import.meta.url), 'utf8')
    const workspace = parse(source) as { minimumReleaseAgeExclude?: string[] }

    expect(workspace.minimumReleaseAgeExclude).toEqual(expect.arrayContaining(['create-ras-app', 'ras-stack']))
  })
})

describe('npm publication verification', () => {
  it('rejects a manual dispatch running from the default branch', async () => {
    const fixture = await publicationRepository()

    await expect(runPublicationVerification(fixture, 'refs/heads/main', fixture.head)).rejects.toMatchObject({ code: 1 })
  })

  it('rejects a provenance SHA that differs from the checked-out release', async () => {
    const fixture = await publicationRepository()

    await expect(runPublicationVerification(fixture, 'refs/tags/v1.2.3', '0000000000000000000000000000000000000000')).rejects.toMatchObject(
      { code: 1 },
    )
  })

  it('accepts a workflow executing at the requested tag and checkout', async () => {
    const fixture = await publicationRepository()

    await expect(runPublicationVerification(fixture, 'refs/tags/v1.2.3', fixture.head)).resolves.toBeDefined()
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

async function runPublicationVerification(fixture: PublicationFixture, ref: string, sha: string) {
  return exec('bash', ['-c', await releaseVerificationScript()], {
    cwd: fixture.work,
    env: {
      ...process.env,
      GITHUB_REF: ref,
      GITHUB_SHA: sha,
      RELEASE_TAG: 'v1.2.3',
    },
  })
}

type Fixture = { work: string; output: string; head: string; previous: string }
type PublicationFixture = { work: string; head: string }

async function publicationRepository(): Promise<PublicationFixture> {
  const work = await mkdtemp(join(tmpdir(), 'ras-stack-publication-verification-'))
  await mkdir(join(work, 'packages/ras-stack'), { recursive: true })
  await mkdir(join(work, 'packages/create-ras-app'), { recursive: true })
  await writeFile(join(work, 'packages/ras-stack/package.json'), JSON.stringify({ name: 'ras-stack', version: '1.2.3' }))
  await writeFile(join(work, 'packages/create-ras-app/package.json'), JSON.stringify({ name: 'create-ras-app', version: '1.2.3' }))
  await exec('git', ['init', '--initial-branch=main'], { cwd: work })
  await exec('git', ['config', 'user.name', 'Test'], { cwd: work })
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: work })
  await exec('git', ['add', '-A'], { cwd: work })
  await exec('git', ['commit', '-m', 'release'], { cwd: work })
  const head = (await exec('git', ['rev-parse', 'HEAD'], { cwd: work })).stdout.trim()
  return { work, head }
}

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
