import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { DokployClient, DokployPreviewManager } from './dokploy.js'

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
  const shared = new Set(['application.saveDockerProvider', 'application.deploy'])
  const bodies: unknown[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.hostname !== 'dokploy.example') return new Response('healthy')
    const procedure = url.pathname.slice('/api/'.length)
    if (typeof init?.body === 'string' && shared.has(procedure)) bodies.push(JSON.parse(init.body))
    if (procedure === 'environment.one') return Response.json({ applications: [{ applicationId: 'application-id', name: 'example-pr-1' }] })
    if (procedure === 'application.one') {
      return Response.json(bodies.length > 1 ? { applicationStatus: 'done' } : { domains: [{ host: 'pr-1.example.com' }] })
    }
    return new Response(null)
  })
  const client = new DokployClient({
    url: 'https://dokploy.example',
    apiKey: 'secret',
    environmentId: 'environment',
    fetch,
    log: () => undefined,
  })
  const manager = new DokployPreviewManager({
    client,
    applicationName: () => 'example-pr-1',
    hostname: () => 'pr-1.example.com',
    port: 3000,
    fetch,
    sleep: async () => undefined,
    log: () => undefined,
  })
  await manager.deploy({
    prNumber: '1',
    image: 'ghcr.io/example/application:sha-abc123',
    environment: 'APP_URL=https://pr-1.example.com\n',
  })
  return bodies
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
