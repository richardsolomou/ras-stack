import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const script = new URL('../../actions/prune-preview-images/prune.sh', import.meta.url).pathname

describe('preview image pruning action', () => {
  it('deletes only the closed pull request preview version', async () => {
    const fixture = await githubFixture()
    await run(fixture, { PREVIEW_PR_NUMBER: '42' })
    expect(await readFile(fixture.deletions, 'utf8')).toContain('/versions/1')
    expect(await readFile(fixture.deletions, 'utf8')).not.toContain('/versions/2')
    expect(await readFile(fixture.deletions, 'utf8')).not.toContain('/versions/3')
  })

  it('keeps open pull request versions during an orphan sweep', async () => {
    const fixture = await githubFixture()
    await run(fixture, { PREVIEW_OPEN_PR_NUMBERS: '42' })
    expect(await readFile(fixture.deletions, 'utf8')).toContain('/versions/2')
    expect(await readFile(fixture.deletions, 'utf8')).not.toContain('/versions/1')
  })
})

async function githubFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ras-stack-preview-images-'))
  const deletions = join(directory, 'deletions')
  await writeFile(deletions, '')
  const gh = join(directory, 'gh')
  await writeFile(
    gh,
    `#!/usr/bin/env bash
if [[ "$*" == *"/users/owner --jq .type"* ]]; then echo User; exit 0; fi
if [[ "$*" == *"--paginate --slurp"* ]]; then
  echo '[[{"id":1,"metadata":{"container":{"tags":["preview-pr-42-sha-${'a'.repeat(40)}"]}}},{"id":2,"metadata":{"container":{"tags":["preview-pr-43-sha-${'b'.repeat(40)}"]}}},{"id":3,"metadata":{"container":{"tags":["latest","preview-pr-42-sha-${'a'.repeat(40)}"]}}}]]'
  exit 0
fi
if [[ "$*" == *"--method DELETE"* ]]; then echo "$*" >> "$DELETIONS"; exit 0; fi
exit 1
`,
  )
  await chmod(gh, 0o755)
  return { deletions, directory }
}

function run(fixture: Awaited<ReturnType<typeof githubFixture>>, overrides: Record<string, string>) {
  return exec('bash', [script], {
    env: {
      ...process.env,
      PATH: `${fixture.directory}${delimiter}${process.env.PATH}`,
      DELETIONS: fixture.deletions,
      PREVIEW_REPOSITORY: 'owner/app',
      PREVIEW_PACKAGE: 'app',
      PREVIEW_PR_NUMBER: '',
      PREVIEW_OPEN_PR_NUMBERS: '',
      ...overrides,
    },
  })
}
