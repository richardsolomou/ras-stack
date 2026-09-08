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
  it('grants the caller permission to merge release pull requests', async () => {
    const source = await readFile(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8')
    const workflow = parse(source) as { jobs: { release: { permissions: Record<string, string> } } }

    expect(workflow.jobs.release.permissions['pull-requests']).toBe('write')
  })

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

  it('validates and merges a release pull request before tagging the protected branch', async () => {
    const fixture = await repository({ changesets: true })
    const fake = await releaseGh(fixture.work)

    await run(fixture, fixture.head, {
      GH_DISPATCHED: fake.dispatched,
      GH_LOG: fake.log,
      GITHUB_REPOSITORY: 'example/repository',
      GITHUB_RUN_ID: '42',
      PATH: `${fake.bin}:${process.env.PATH ?? ''}`,
      VALIDATION_WORKFLOW: 'ci.yml',
      VERSION_COMMAND: 'printf release > release.txt',
    })

    const released = (await exec('git', ['rev-parse', 'refs/tags/v1.2.3'], { cwd: fixture.work })).stdout.trim()
    const releaseCommit = (await exec('git', ['rev-parse', `${released}^2`], { cwd: fixture.work })).stdout.trim()
    const remoteMain = (await exec('git', ['ls-remote', 'origin', 'refs/heads/main'], { cwd: fixture.work })).stdout.split('\t')[0]
    const releaseBranches = (await exec('git', ['ls-remote', '--heads', 'origin', 'release-candidate/*'], { cwd: fixture.work })).stdout
    const calls = (await readFile(fake.log, 'utf8')).trim().split('\n')

    expect(remoteMain).toBe(released)
    expect(releaseBranches).toBe('')
    expect(calls.findIndex((call) => call.startsWith('pr create '))).toBeLessThan(
      calls.findIndex((call) => call.startsWith('workflow run ')),
    )
    expect(calls.findIndex((call) => call.startsWith('workflow run '))).toBeLessThan(
      calls.findIndex((call) => call.startsWith('run watch ')),
    )
    expect(calls.findIndex((call) => call.startsWith('run watch '))).toBeLessThan(calls.findIndex((call) => call.startsWith('pr merge ')))
    expect(calls.find((call) => call.startsWith('pr merge '))).toContain(`--match-head-commit ${releaseCommit}`)
    expect(calls.findIndex((call) => call.startsWith('pr merge '))).toBeLessThan(
      calls.findIndex((call) => call.startsWith('release create ')),
    )
  })

  it('leaves the protected branch unchanged when release validation fails', async () => {
    const fixture = await repository({ changesets: true })
    const fake = await releaseGh(fixture.work)

    await expect(
      run(fixture, fixture.head, {
        GH_DISPATCHED: fake.dispatched,
        GH_LOG: fake.log,
        GH_WATCH_EXIT: '1',
        GITHUB_REPOSITORY: 'example/repository',
        GITHUB_RUN_ID: '42',
        PATH: `${fake.bin}:${process.env.PATH ?? ''}`,
        VALIDATION_WORKFLOW: 'ci.yml',
        VERSION_COMMAND: 'printf release > release.txt',
      }),
    ).rejects.toMatchObject({ code: 1 })

    const remoteMain = (await exec('git', ['ls-remote', 'origin', 'refs/heads/main'], { cwd: fixture.work })).stdout.split('\t')[0]
    const releaseBranches = (await exec('git', ['ls-remote', '--heads', 'origin', 'release-candidate/*'], { cwd: fixture.work })).stdout
    const releaseTags = (await exec('git', ['ls-remote', '--tags', 'origin', 'refs/tags/v1.2.3'], { cwd: fixture.work })).stdout
    const calls = (await readFile(fake.log, 'utf8')).trim().split('\n')

    expect(remoteMain).toBe(fixture.head)
    expect(releaseBranches).toBe('')
    expect(releaseTags).toBe('')
    expect(calls.some((call) => call.startsWith('pr close '))).toBe(true)
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
      VALIDATION_WORKFLOW: '',
      VERSION_COMMAND: 'true',
      VERSION_FILE: 'package.json',
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

async function releaseGh(work: string) {
  const bin = join(work, 'bin')
  const dispatched = join(work, 'dispatched')
  const log = join(work, 'gh.log')
  const gh = join(bin, 'gh')
  await mkdir(bin)
  await writeFile(
    gh,
    '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$GH_LOG"\nif [ "$1 $2" = "workflow run" ]; then\n  touch "$GH_DISPATCHED"\nfi\nif [ "$1 $2" = "run list" ]; then\n  if [ -e "$GH_DISPATCHED" ]; then\n    sha="$(git rev-parse HEAD)"\n    printf \'[{"databaseId":123,"headSha":"%s"}]\\n\' "$sha"\n  else\n    printf \'[]\\n\'\n  fi\nfi\nif [ "$1 $2" = "run watch" ]; then\n  exit "${GH_WATCH_EXIT:-0}"\nfi\nif [ "$1 $2" = "pr create" ]; then\n  printf \'%s\\n\' \'https://github.com/example/repository/pull/1\'\nfi\nif [ "$1 $2" = "pr merge" ]; then\n  release_sha="$(git rev-parse HEAD)"\n  release_branch="$(git ls-remote --heads origin \'release-candidate/*\' | awk \'{sub("refs/heads/", "", $2); print $2}\')"\n  git fetch origin main >/dev/null 2>&1\n  git checkout -B release-merge origin/main >/dev/null 2>&1\n  git merge --no-ff "$release_sha" -m \'Merge release\' >/dev/null 2>&1\n  git push origin HEAD:main >/dev/null 2>&1\n  git push origin --delete "$release_branch" >/dev/null 2>&1\nfi\n',
  )
  await chmod(gh, 0o755)
  return { bin, log, dispatched }
}

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
  await writeFile(join(work, 'package.json'), JSON.stringify({ name: 'example', version: '1.2.3' }))

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
