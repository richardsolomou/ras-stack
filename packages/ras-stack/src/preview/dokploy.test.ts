import { describe, expect, it, vi } from 'vitest'
import { loadPreviewAppSecrets, previewHostname, pullRequestNumber } from './dokploy-preview.js'
import { fakeDokploy, previewManager } from './testing.js'

const customHostname = (prNumber: string) => `pr-${prNumber}.example.com`

describe('Dokploy preview lifecycle', () => {
  it('creates, configures, deploys, and health-checks one preview', async () => {
    const server = fakeDokploy()
    const configure = vi.fn()
    const manager = previewManager(server.fetch, { hostname: customHostname })
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
    const manager = previewManager(server.fetch)
    const result = await manager.deploy({
      prNumber: '42',
      image: 'ghcr.io/example/app:pr-42',
      environment: ({ url }) => `APP_URL=${url}\n`,
    })

    expect({
      result,
      generated: server.bodies.get('domain.generateDomain'),
      ipProcedure: server.procedures.find(
        (procedure) => procedure === 'settings.getIp' || procedure === 'domain.canGenerateTraefikMeDomains',
      ),
      domain: server.bodies.get('domain.create'),
      environment: server.bodies.get('application.saveEnvironment'),
      healthUrl: server.healthUrls[0],
    }).toEqual({
      result: {
        applicationId: 'app-42',
        host: 'ras-preview-a1b2c3-1-1-1-1.sslip.io',
        url: 'http://ras-preview-a1b2c3-1-1-1-1.sslip.io',
      },
      generated: { appName: 'ras-preview' },
      ipProcedure: 'settings.getIp',
      domain: {
        applicationId: 'app-42',
        host: 'ras-preview-a1b2c3-1-1-1-1.sslip.io',
        path: '/',
        port: 3000,
        https: false,
        certificateType: 'none',
        domainType: 'application',
      },
      environment: {
        applicationId: 'app-42',
        env: 'APP_URL=http://ras-preview-a1b2c3-1-1-1-1.sslip.io\n',
        buildArgs: null,
        buildSecrets: null,
        createEnvFile: false,
      },
      healthUrl: 'http://ras-preview-a1b2c3-1-1-1-1.sslip.io/api/health',
    })
  })

  it('uses the application details server for a remote generated domain', async () => {
    const server = fakeDokploy({ applications: [{ applicationId: 'app-42', name: 'example-pr-42', serverId: 'server-1' }] })

    await previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })

    expect({
      generated: server.bodies.get('domain.generateDomain'),
      ipProcedure: server.procedures.find(
        (procedure) => procedure === 'settings.getIp' || procedure === 'domain.canGenerateTraefikMeDomains',
      ),
    }).toEqual({
      generated: { appName: 'ras-preview', serverId: 'server-1' },
      ipProcedure: 'domain.canGenerateTraefikMeDomains',
    })
  })

  it('reuses an existing generated domain', async () => {
    const server = fakeDokploy({
      applications: [{ applicationId: 'app-42', name: 'example-pr-42', serverId: 'server-1' }],
      domains: [{ domainId: 'generated-domain', host: 'ras-preview-a1b2c3-1-1-1-1.sslip.io' }],
    })

    await previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })

    expect(server.procedures).not.toContain('domain.generateDomain')
    expect(server.procedures).not.toContain('domain.create')
  })

  it('rejects a generated hostname outside sslip.io', async () => {
    const server = fakeDokploy({ generatedDomain: 'preview.example.com' })

    await expect(previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'did not return an sslip.io hostname',
    )
    expect(server.procedures).not.toContain('domain.create')
  })

  it('rejects a generated hostname with an earlier IP-shaped sequence', async () => {
    const server = fakeDokploy({ generatedDomain: 'ras-preview-a1b2c3-127-0-0-1-1-1-1-1.sslip.io' })

    await expect(previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'did not return an sslip.io hostname',
    )
    expect(server.procedures).not.toContain('domain.create')
  })

  it.each(['', '127.0.0.1', '10.0.0.1', '169.254.169.254', '203.0.113.10', '2001:db8::1'])(
    'rejects a non-public Dokploy server IP (%s)',
    async (serverIp) => {
      const server = fakeDokploy({ generatedDomain: 'ras-preview-a1b2c3-127-0-0-1.sslip.io', serverIp })

      await expect(previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
        'requires a public server IP',
      )
      expect(server.procedures).not.toContain('domain.generateDomain')
      expect(server.procedures).not.toContain('domain.create')
    },
  )

  it('rotates a generated route after the Dokploy server IP changes', async () => {
    const server = fakeDokploy({
      applications: [{ applicationId: 'app-42', name: 'example-pr-42', serverId: 'server-1' }],
      domains: [{ domainId: 'old-generated-domain', host: 'ras-preview-a1b2c3-8-8-8-8.sslip.io' }],
    })

    const result = await previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })

    expect({ host: result.host, deleted: server.bodies.get('domain.delete') }).toEqual({
      host: 'ras-preview-a1b2c3-1-1-1-1.sslip.io',
      deleted: { domainId: 'old-generated-domain' },
    })
    expect(server.events.indexOf('health')).toBeLessThan(server.events.indexOf('domain.delete'))
  })

  it('reuses the current generated route while cleaning up an older route', async () => {
    const server = fakeDokploy({
      applications: [{ applicationId: 'app-42', name: 'example-pr-42', serverId: 'server-1' }],
      domains: [
        { domainId: 'old-generated-domain', host: 'ras-preview-a1b2c3-8-8-8-8.sslip.io' },
        { domainId: 'current-generated-domain', host: 'ras-preview-b2c3d4-1-1-1-1.sslip.io' },
      ],
    })

    const result = await previewManager(server.fetch).deploy({ prNumber: '42', image: 'example', environment: '' })

    expect({
      host: result.host,
      generated: server.procedures.includes('domain.generateDomain'),
      deleted: server.bodies.get('domain.delete'),
    }).toEqual({
      host: 'ras-preview-b2c3d4-1-1-1-1.sslip.io',
      generated: false,
      deleted: { domainId: 'old-generated-domain' },
    })
  })

  it('removes a generated HTTP route when switching to a custom domain', async () => {
    const server = fakeDokploy({
      applications: [{ applicationId: 'app-42', name: 'example-pr-42', serverId: 'server-1' }],
      domains: [{ domainId: 'generated-domain', host: 'ras-preview-a1b2c3-1-1-1-1.sslip.io' }],
    })

    await previewManager(server.fetch, { hostname: customHostname }).deploy({ prNumber: '42', image: 'example', environment: '' })

    expect(server.bodies.get('domain.delete')).toEqual({ domainId: 'generated-domain' })
    expect(server.procedures.indexOf('domain.create')).toBeLessThan(server.procedures.indexOf('domain.delete'))
    expect(server.events.indexOf('health')).toBeLessThan(server.events.indexOf('domain.delete'))
  })

  it('preserves an explicitly configured sslip.io custom route across deployments', async () => {
    const server = fakeDokploy({ applications: [{ applicationId: 'app-42', name: 'example-pr-42', serverId: 'server-1' }] })
    const manager = previewManager(server.fetch, { hostname: (prNumber) => `pr-${prNumber}.8-8-8-8.sslip.io` })

    await manager.deploy({ prNumber: '42', image: 'example', environment: '' })
    await manager.deploy({ prNumber: '42', image: 'example', environment: '' })

    expect(server.procedures).not.toContain('domain.delete')
  })

  it('deletes an existing preview after application cleanup', async () => {
    const server = fakeDokploy({ applications: [{ applicationId: 'app-42', name: 'example-pr-42' }] })
    const cleanup = vi.fn()
    expect(await previewManager(server.fetch, { hostname: customHostname }).delete('42', cleanup)).toBe(true)
    expect({ cleanup: cleanup.mock.calls[0]?.[0], deleted: server.bodies.get('application.delete') }).toEqual({
      cleanup: { applicationId: 'app-42', name: 'example-pr-42' },
      deleted: { applicationId: 'app-42' },
    })
  })

  it('prunes only matching previews whose pull requests are closed', async () => {
    const server = fakeDokploy({
      applications: [
        { applicationId: 'open', name: 'example-pr-1' },
        { applicationId: 'closed', name: 'example-pr-2' },
        { applicationId: 'production', name: 'example-production' },
      ],
    })
    const removed = await previewManager(server.fetch, { hostname: customHostname }).prune(new Set(['1']))
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
    const server = fakeDokploy({ deploymentStatus: 'error' })
    await expect(
      previewManager(server.fetch, { hostname: customHostname }).deploy({ prNumber: '42', image: 'example', environment: '' }),
    ).rejects.toThrow('Dokploy reported a failed deployment')
  })

  it('bounds deployment polling', async () => {
    const server = fakeDokploy({ deploymentStatus: 'pending' })
    let now = 0
    const manager = previewManager(server.fetch, {
      hostname: customHostname,
      deploymentTimeoutMs: 2,
      now: () => now,
      sleep: async () => {
        now++
      },
    })
    await expect(manager.deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'Timed out waiting for the Dokploy deployment to finish',
    )
  })

  it('aborts a deployment status request that never responds', async () => {
    const server = fakeDokploy({ deploymentStatus: 'hang' })
    const manager = previewManager(server.fetch, { hostname: customHostname, deploymentTimeoutMs: 10 })
    await expect(manager.deploy({ prNumber: '42', image: 'example', environment: '' })).rejects.toThrow(
      'Timed out waiting for the Dokploy deployment to finish',
    )
  })
})

describe('preview application secrets', () => {
  it('copies allowlisted keys into the target environment', () => {
    const target: NodeJS.ProcessEnv = {}
    loadPreviewAppSecrets(['DATABASE_ADMIN_URL'], { PREVIEW_APP_SECRETS: JSON.stringify({ DATABASE_ADMIN_URL: 'postgres://x' }) }, target)
    expect(target).toEqual({ DATABASE_ADMIN_URL: 'postgres://x' })
  })

  it('does nothing when no secrets are supplied', () => {
    const target: NodeJS.ProcessEnv = {}
    loadPreviewAppSecrets(['DATABASE_ADMIN_URL'], {}, target)
    expect(target).toEqual({})
  })

  it('rejects keys outside the allowlist', () => {
    expect(() => loadPreviewAppSecrets(['SAFE'], { PREVIEW_APP_SECRETS: JSON.stringify({ AWS_SECRET_ACCESS_KEY: 'x' }) }, {})).toThrow(
      'PREVIEW_APP_SECRETS contains unsupported key AWS_SECRET_ACCESS_KEY',
    )
  })

  it('rejects anything but a JSON object of strings', () => {
    expect(() => loadPreviewAppSecrets(['SAFE'], { PREVIEW_APP_SECRETS: '["SAFE"]' }, {})).toThrow(
      'PREVIEW_APP_SECRETS must be a JSON object',
    )
    expect(() => loadPreviewAppSecrets(['SAFE'], { PREVIEW_APP_SECRETS: JSON.stringify({ SAFE: 7 }) }, {})).toThrow(
      'PREVIEW_APP_SECRETS.SAFE must be a string',
    )
  })
})
