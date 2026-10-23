import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

const exec = promisify(execFile)
const workflow = parse(await readFile(new URL('../../../../.github/workflows/update-stack.yml', import.meta.url), 'utf8')) as {
  jobs: { update: { steps: Array<{ id?: string; uses?: string; run?: string; with?: Record<string, string> }> } }
}

it.each([undefined, 'dependabot.yml', 'dependabot.yaml'])('stages only managed files with bot policy %s', async (policy) => {
  const directory = await mkdtemp(join(tmpdir(), 'ras-update-workflow-'))
  const repository = join(directory, 'repository')
  const bin = join(directory, 'bin')
  await mkdir(join(repository, '.github'), { recursive: true })
  await mkdir(bin)
  await writeFile(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n')
  await chmod(join(bin, 'pnpm'), 0o755)
  const managed = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', ...(policy ? [`.github/${policy}`] : [])]
  const files = [...managed, 'package.json', '.github/unrelated.yml']
  await Promise.all(files.map((file) => writeFile(join(repository, file), 'original\n')))
  await exec('git', ['init', '--quiet', repository])
  await exec('git', ['config', 'user.name', 'Test'], { cwd: repository })
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repository })
  await exec('git', ['add', '--', ...files], { cwd: repository })
  await exec('git', ['commit', '-qm', 'fixture'], { cwd: repository })
  await Promise.all(files.map((file) => writeFile(join(repository, file), 'changed\n')))
  await mkdir(join(repository, 'node_modules/ras-stack'), { recursive: true })
  await writeFile(join(repository, 'node_modules/ras-stack/package.json'), '{"version":"5.0.0"}\n')
  const output = join(directory, 'output')
  const run = workflow.jobs.update.steps.find((step) => step.id === 'upgrade')?.run
  if (!run) throw new Error('Missing upgrade command')
  await exec('bash', ['-euo', 'pipefail', '-c', run], {
    cwd: repository,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RAS_TARGET: 'latest', GITHUB_OUTPUT: output },
  })
  const paths =
    (await readFile(output, 'utf8'))
      .split('\n')
      .find((line) => line.startsWith('paths='))
      ?.slice('paths='.length) ?? ''
  const input = workflow.jobs.update.steps.find((step) => step.uses?.startsWith('peter-evans/create-pull-request@'))?.with?.['add-paths']
  if (!input) throw new Error('Missing PR paths')
  const selected = input
    .replace('${{ steps.upgrade.outputs.paths }}', paths)
    .split(/[\n,]+/)
    .map((file) => file.trim())
    .filter(Boolean)
  await exec('git', ['add', '--', ...selected], { cwd: repository })
  const staged = (await exec('git', ['diff', '--cached', '--name-only'], { cwd: repository })).stdout.trim().split('\n')
  expect(staged).toEqual(managed.toSorted())
})
