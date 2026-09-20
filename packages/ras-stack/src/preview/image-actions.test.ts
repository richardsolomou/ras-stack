import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const exec = promisify(execFile)
const resolveScript = new URL('../../../../actions/resolve-container-image/resolve.sh', import.meta.url).pathname
const recordScript = new URL('../../../../actions/publish-production-image/record-reference.sh', import.meta.url).pathname
const digest = `sha256:${'a'.repeat(64)}`
const sha = 'b'.repeat(40)

type Action = {
  inputs: Record<string, { default?: string }>
  runs: { steps: Array<{ uses?: string; with?: Record<string, string> }> }
}

describe('container image actions', () => {
  it('resolves a readable tag to its immutable digest', async () => {
    const fixture = await dockerFixture()
    await exec('bash', [resolveScript], {
      env: {
        ...process.env,
        PATH: `${fixture.directory}${delimiter}${process.env.PATH}`,
        IMAGE: 'ghcr.io/example/app:preview',
        GITHUB_OUTPUT: fixture.output,
      },
    })
    expect(await readFile(fixture.output, 'utf8')).toBe(`reference=ghcr.io/example/app:preview@${digest}\n`)
  })

  it('records the published commit tag and rejects malformed digests', async () => {
    const fixture = await dockerFixture()
    await exec('bash', [recordScript], {
      env: { ...process.env, IMAGE: 'ghcr.io/example/app', SHA: sha, DIGEST: digest, GITHUB_OUTPUT: fixture.output },
    })
    expect(await readFile(fixture.output, 'utf8')).toBe(`reference=ghcr.io/example/app:sha-${sha}@${digest}\n`)
    await expect(
      exec('bash', [recordScript], {
        env: { ...process.env, IMAGE: 'ghcr.io/example/app', SHA: sha, DIGEST: 'latest', GITHUB_OUTPUT: fixture.output },
      }),
    ).rejects.toBeDefined()
  })

  it('forwards BuildKit secrets through the production image action', async () => {
    const action = parse(
      await readFile(new URL('../../../../actions/publish-production-image/action.yml', import.meta.url), 'utf8'),
    ) as Action
    const build = action.runs.steps.find((step) => step.uses === 'docker/build-push-action@v7')

    expect({ default: action.inputs.secrets?.default, forwarded: build?.with?.secrets }).toEqual({
      default: '',
      forwarded: '${{ inputs.secrets }}',
    })
  })
})

async function dockerFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ras-stack-image-actions-'))
  const output = join(directory, 'output')
  await writeFile(output, '')
  const docker = join(directory, 'docker')
  await writeFile(docker, `#!/usr/bin/env bash\necho '"${digest}"'\n`)
  await chmod(docker, 0o755)
  return { directory, output }
}
