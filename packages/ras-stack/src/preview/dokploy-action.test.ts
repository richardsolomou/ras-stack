import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeDokploy, previewManager } from './testing.js'

const exec = promisify(execFile)
const script = new URL('../../../../actions/deploy-dokploy-image/deploy.sh', import.meta.url).pathname

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Dokploy image deployment action', () => {
  it('rejects incomplete private registry credentials', async () => {
    const fixture = await curlFixture()
    await expect(run(fixture, { DOKPLOY_REGISTRY_USERNAME: 'user' })).rejects.toMatchObject({
      stderr: expect.stringContaining('must be provided together'),
    })
  })

  // The action deploys with curl so the deploy path needs no Node, which leaves two implementations of one
  // Dokploy contract. This holds the shell to whatever DokployPreviewManager sends for the same two procedures.
  it('sends what the TypeScript client sends for the procedures they share', async () => {
    const fixture = await curlFixture()
    await run(fixture)
    const shell = parseCurlCalls(await readFile(fixture.calls, 'utf8'))

    const client = await typescriptCalls()

    expect(shell.map((call) => call.url)).toEqual([
      'https://dokploy.example/api/application.saveDockerProvider',
      'https://dokploy.example/api/application.deploy',
    ])
    expect(shell.map((call) => call.body)).toEqual(client)
    expect(shell.every((call) => call.headers['x-api-key'] === 'secret')).toBe(true)
  })
})

async function typescriptCalls() {
  const server = fakeDokploy({
    applications: [{ applicationId: 'application-id', name: 'example-pr-1' }],
    domains: [{ host: 'pr-1.example.com' }],
  })
  await previewManager(server.fetch, { hostname: () => 'pr-1.example.com' }).deploy({
    prNumber: '1',
    image: 'ghcr.io/example/application:sha-abc123',
    environment: 'APP_URL=https://pr-1.example.com\n',
  })
  return [server.bodies.get('application.saveDockerProvider'), server.bodies.get('application.deploy')]
}

// jq pretty-prints the body, so an argument can span lines. Each invocation starts at the flag the script passes first,
// and within one the body is everything between --data and the trailing URL.
function parseCurlCalls(recorded: string) {
  return recorded
    .split('--fail-with-body\n')
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split('\n').filter((line, index, all) => line !== '' || index < all.length - 1)
      const data = lines.indexOf('--data')
      const headers: Record<string, string> = {}
      for (const [index, line] of lines.entries()) {
        if (lines[index - 1] !== '--header') continue
        const [name, ...value] = line.split(':')
        headers[name!.trim().toLowerCase()] = value.join(':').trim()
      }
      return { url: lines.at(-1)!, body: JSON.parse(lines.slice(data + 1, -1).join('\n')) as unknown, headers }
    })
}

async function curlFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ras-stack-dokploy-'))
  roots.push(directory)
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
