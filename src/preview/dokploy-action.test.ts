import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const script = new URL('../../actions/deploy-dokploy-image/deploy.sh', import.meta.url).pathname

describe('Dokploy image deployment action', () => {
  it('selects the public image provider before deploying', async () => {
    const fixture = await curlFixture()
    await run(fixture)

    const calls = await readFile(fixture.calls, 'utf8')
    expect(calls).toContain('ghcr.io/example/application:sha-abc123')
    expect(calls).toContain('"registryUrl": null')
    expect(calls).toContain('https://dokploy.example/api/application.saveDockerProvider')
    expect(calls).toContain('https://dokploy.example/api/application.deploy')
    expect(calls.indexOf('application.saveDockerProvider')).toBeLessThan(calls.indexOf('application.deploy'))
  })

  it('rejects incomplete private registry credentials', async () => {
    const fixture = await curlFixture()
    await expect(run(fixture, { DOKPLOY_REGISTRY_USERNAME: 'user' })).rejects.toMatchObject({
      stderr: expect.stringContaining('must be provided together'),
    })
  })
})

async function curlFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ras-stack-dokploy-'))
  const calls = join(directory, 'calls')
  const curl = join(directory, 'curl')
  await writeFile(curl, '#!/usr/bin/env bash\nprintf \'%s\\n\' "$@" >> "$CALLS"\n')
  await chmod(curl, 0o755)
  return { calls, directory }
}

function run(fixture: Awaited<ReturnType<typeof curlFixture>>, overrides: Record<string, string> = {}) {
  return exec('bash', [script], {
    env: {
      ...process.env,
      PATH: `${fixture.directory}${delimiter}${process.env.PATH}`,
      CALLS: fixture.calls,
      DOKPLOY_URL: 'https://dokploy.example/',
      DOKPLOY_API_KEY: 'secret',
      DOKPLOY_APPLICATION_ID: 'application-id',
      DOKPLOY_IMAGE: 'ghcr.io/example/application:sha-abc123',
      DOKPLOY_REGISTRY_URL: '',
      DOKPLOY_REGISTRY_USERNAME: '',
      DOKPLOY_REGISTRY_PASSWORD: '',
      ...overrides,
    },
  })
}
