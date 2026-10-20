import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const resolveScript = new URL('../../../../actions/resolve-container-image/resolve.sh', import.meta.url).pathname
const recordScript = new URL('../../../../actions/publish-production-image/record-reference.sh', import.meta.url).pathname
const digest = `sha256:${'a'.repeat(64)}`
const sha = 'b'.repeat(40)

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

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

  it('records the published commit tag', async () => {
    const fixture = await dockerFixture()
    await exec('bash', [recordScript], {
      env: { ...process.env, IMAGE: 'ghcr.io/example/app', SHA: sha, DIGEST: digest, GITHUB_OUTPUT: fixture.output },
    })
    expect(await readFile(fixture.output, 'utf8')).toBe(`reference=ghcr.io/example/app:sha-${sha}@${digest}\n`)
  })

  it('rejects a malformed digest without recording a reference', async () => {
    const fixture = await dockerFixture()
    const failure = await exec('bash', [recordScript], {
      env: { ...process.env, IMAGE: 'ghcr.io/example/app', SHA: sha, DIGEST: 'latest', GITHUB_OUTPUT: fixture.output },
    }).catch((error: unknown) => error)
    expect({ failure, output: await readFile(fixture.output, 'utf8') }).toMatchObject({ failure: { code: 1 }, output: '' })
  })
})

async function dockerFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ras-stack-image-actions-'))
  roots.push(directory)
  const output = join(directory, 'output')
  await writeFile(output, '')
  const docker = join(directory, 'docker')
  await writeFile(docker, `#!/usr/bin/env bash\necho '${digest}'\n`)
  await chmod(docker, 0o755)
  return { directory, output }
}
