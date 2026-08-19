import { describe, expect, it, vi } from 'vitest'
import { DokployClient, DokployPreviewManager, previewHostname, pullRequestNumber } from './dokploy.js'

describe('Dokploy preview lifecycle', () => {
  it('creates, configures, deploys, and health-checks one preview', async () => {
    const server = fakeDokploy()
    const configure = vi.fn()
    const manager = previewManager(server.fetch)
    const result = await manager.deploy({
      prNumber: '42',
      image: 'ghcr.io/example/app:pr-42',
      environment: 'APP_URL=https://pr-42.example.com\n',
      registry: { username: 'registry-user', password: 'registry-password' },
      configure,
    })
    expect({
      result,
      configured: configure.mock.calls.length,
      procedures: server.procedures,
      provider: server.bodies.get('application.saveDockerProvider'),
      domain: server.bodies.get('domain.create'),
    }).toEqual({
      result: { applicationId: 'app-42', host: 'pr-42.example.com', url: 'https://pr-42.example.com' },
      configured: 1,
      procedures: [
        'environment.one',
        'application.create',
        'environment.one',
        'application.one',
        'domain.create',
        'application.saveDockerProvider',
        'application.saveEnvironment',
        'application.deploy',
        'application.one',
      ],
      provider: {
        applicationId: 'app-42',
        dockerImage: 'ghcr.io/example/app:pr-42',
        username: 'registry-user',
        password: 'registry-password',
        registryUrl: 'ghcr.io',
      },
      domain: {
        applicationId: 'app-42',
        host: 'pr-42.example.com',
        path: '/',
        port: 3000,
        https: true,
        certificateType: 'letsencrypt',
        domainType: 'application',
      },
    })
  })

  it('uses Dokploy generated sslip.io domains over HTTP', async () => {
    const server = fakeDokploy()
    const manager = generatedPreviewManager(server.fetch)
    const result = await manager.deploy({
      prNumber: '42',
      image: 'ghcr.io/example/app:pr-42',
      environment: ({ url }) => `APP_URL=${url}\n`,
    })

    expect({
      result,
      generated: server.bodies.get('domain.generateDomain'),
      domain: server.bodies.get('domain.create'),
      environment: server.bodies.get('application.saveEnvironment'),
      healthUrl: server.healthUrls[0],
    }).toEqual({
      result: {
        applicationId: 'app-42',
        host: 'example-pr-42-a1b2c3-203-0-113-10.sslip.io',
        url: 'http://example-pr-42-a1b2c3-203-0-113-10.sslip.io',
      },
      generated: { appName: 'example-pr-42', serverId: 'server-1' },
      domain: {
        applicationId: 'app-42',
        host: 'example-pr-42-a1b2c3-203-0-113-10.sslip.io',
        path: '/',
        port: 3000,
        https: false,
        certificateType: 'none',
        domainType: 'application',
      },
      environment: {
        applicationId: 'app-42',
        env: 'APP_URL=http://example-pr-42-a1b2c3-203-0-113-10.sslip.io\n',
        buildArgs: null,
        buildSecrets: null,
        createEnvFile: false,
      },
      healthUrl: 'http://example-pr-42-a1b2c3-203-0-113-10.sslip.io/api/health',
    })
  })

  it('reuses an existing generated domain', async () => {
    const server = fakeDokploy([{ applicationId: 'app-42', name: 'example-pr-42', serverId: 'server-1' }], 'done', [
      { domainId: 'generated-domain', host: 'example-pr-42-existing-203-0-113-10.sslip.io' },
    ])

    await generatedPreviewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })

    expect(server.procedures).not.toContain('domain.generateDomain')
    expect(server.procedures).not.toContain('domain.create')
  })

  it('rejects a generated hostname outside sslip.io', async () => {
    const server = fakeDokploy([], 'done', [], 'preview.example.com')

    await expect(generatedPreviewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'did not return an sslip.io hostname',
    )
    expect(server.procedures).not.toContain('domain.create')
  })

  it.each(['', '127.0.0.1', '10.0.0.1', '169.254.169.254'])('rejects a non-public Dokploy server IP (%s)', async (serverIp) => {
    const server = fakeDokploy([], 'done', [], 'example-pr-42-a1b2c3-127-0-0-1.sslip.io', serverIp)

    await expect(generatedPreviewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'requires a public server IP',
    )
    expect(server.procedures).not.toContain('domain.generateDomain')
    expect(server.procedures).not.toContain('domain.create')
  })

  it('removes a generated HTTP route when switching to a custom domain', async () => {
    const server = fakeDokploy([{ applicationId: 'app-42', name: 'example-pr-42', serverId: 'server-1' }], 'done', [
      { domainId: 'generated-domain', host: 'example-pr-42-existing-203-0-113-10.sslip.io' },
    ])

    await previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })

    expect(server.bodies.get('domain.delete')).toEqual({ domainId: 'generated-domain' })
    expect(server.procedures.indexOf('domain.create')).toBeLessThan(server.procedures.indexOf('domain.delete'))
  })

  it('deletes an existing preview after application cleanup', async () => {
    const server = fakeDokploy([{ applicationId: 'app-42', name: 'example-pr-42' }])
    const cleanup = vi.fn()
    expect(await previewManager(server.fetch).delete('42', cleanup)).toBe(true)
    expect({ cleanup: cleanup.mock.calls[0]?.[0], deleted: server.bodies.get('application.delete') }).toEqual({
      cleanup: { applicationId: 'app-42', name: 'example-pr-42' },
      deleted: { applicationId: 'app-42' },
    })
  })

  it('prunes only matching previews whose pull requests are closed', async () => {
    const server = fakeDokploy([
      { applicationId: 'open', name: 'example-pr-1' },
      { applicationId: 'closed', name: 'example-pr-2' },
      { applicationId: 'production', name: 'example-production' },
    ])
    const removed = await previewManager(server.fetch).prune(new Set(['1']))
    expect({ removed, deleted: server.bodies.get('application.delete') }).toEqual({
      removed: ['2'],
      deleted: { applicationId: 'closed' },
    })
  })

  it('rejects unsafe pull request and hostname inputs', () => {
    expect(() => pullRequestNumber('../42')).toThrow('pull request number must contain only digits')
    expect(() => previewHostname('example.com/path')).toThrow('preview hostname must be a bare hostname')
    expect(() => previewHostname('user@example.com')).toThrow('preview hostname must be a bare hostname')
  })

  it('fails immediately when Dokploy reports a deployment error', async () => {
    const server = fakeDokploy([], 'error')
    await expect(previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'Dokploy reported a failed deployment',
    )
  })

  it('bounds deployment polling', async () => {
    const server = fakeDokploy([], 'pending')
    let now = 0
    const client = new DokployClient({
      url: 'https://dokploy.example',
      apiKey: 'secret',
      environmentId: 'environment',
      fetch: server.fetch,
      log: () => undefined,
    })
    const manager = new DokployPreviewManager({
      client,
      applicationName: (prNumber) => `example-pr-${prNumber}`,
      hostname: (prNumber) => `pr-${prNumber}.example.com`,
      port: 3000,
      fetch: server.fetch,
      deploymentTimeoutMs: 2,
      now: () => now,
      sleep: async () => {
        now++
      },
      log: () => undefined,
    })
    await expect(manager.deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'Timed out waiting for the Dokploy deployment to finish',
    )
  })

  it('aborts a deployment status request that never responds', async () => {
    const server = fakeDokploy([], 'hang')
    const client = new DokployClient({
      url: 'https://dokploy.example',
      apiKey: 'secret',
      environmentId: 'environment',
      fetch: server.fetch,
      log: () => undefined,
    })
    const manager = new DokployPreviewManager({
      client,
      applicationName: (prNumber) => `example-pr-${prNumber}`,
      hostname: (prNumber) => `pr-${prNumber}.example.com`,
      port: 3000,
      fetch: server.fetch,
      deploymentTimeoutMs: 10,
      pollIntervalMs: 0,
      log: () => undefined,
    })
    await expect(manager.deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'Timed out waiting for the Dokploy deployment to finish',
    )
  })
})

function previewManager(fetch: typeof globalThis.fetch) {
  const client = new DokployClient({
    url: 'https://dokploy.example',
    apiKey: 'secret',
    environmentId: 'environment',
    fetch,
    log: () => undefined,
  })
  return new DokployPreviewManager({
    client,
    applicationName: (prNumber) => `example-pr-${prNumber}`,
    hostname: (prNumber) => `pr-${prNumber}.example.com`,
    port: 3000,
    fetch,
    sleep: async () => undefined,
    log: () => undefined,
  })
}

function generatedPreviewManager(fetch: typeof globalThis.fetch) {
  const client = new DokployClient({
    url: 'https://dokploy.example',
    apiKey: 'secret',
    environmentId: 'environment',
    fetch,
    log: () => undefined,
  })
  return new DokployPreviewManager({
    client,
    applicationName: (prNumber) => `example-pr-${prNumber}`,
    port: 3000,
    fetch,
    sleep: async () => undefined,
    log: () => undefined,
  })
}

function fakeDokploy(
  initial: { applicationId: string; name: string; serverId?: string }[] = [],
  deploymentStatus: string = 'done',
  domains: { domainId?: string; host: string }[] = [],
  generatedDomain = 'example-pr-42-a1b2c3-203-0-113-10.sslip.io',
  serverIp = '203.0.113.10',
) {
  const applications = [...initial]
  const procedures: string[] = []
  const bodies = new Map<string, unknown>()
  const healthUrls: string[] = []
  let deployed = false
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.hostname !== 'dokploy.example') {
      healthUrls.push(url.toString())
      return new Response('healthy')
    }
    const procedure = url.pathname.slice('/api/'.length)
    procedures.push(procedure)
    if (init?.body !== undefined && typeof init.body !== 'string') throw new Error('test expected a JSON string body')
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    if (body !== undefined) bodies.set(procedure, body)
    if (procedure === 'environment.one') return Response.json({ applications })
    if (procedure === 'application.create') {
      applications.push({ applicationId: 'app-42', name: String(body?.name), serverId: 'server-1' })
      return new Response(null)
    }
    if (procedure === 'domain.canGenerateTraefikMeDomains') return Response.json(serverIp)
    if (procedure === 'domain.generateDomain') return Response.json(generatedDomain)
    if (procedure === 'application.deploy') deployed = true
    if (procedure === 'application.one') {
      if (deployed && deploymentStatus === 'hang') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })
      }
      return Response.json(deployed ? { applicationStatus: deploymentStatus } : { domains })
    }
    return new Response(null)
  })
  return { bodies, fetch, healthUrls, procedures }
}
