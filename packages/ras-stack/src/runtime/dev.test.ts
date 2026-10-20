import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseRealtimeDevArguments, runRealtimeDev } from './dev.js'

describe('Docker-backed realtime development', () => {
  it('builds a foreground localhost-only Centrifugo command', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ras-stack-realtime-dev-'))
    const configPath = join(directory, 'realtime.json')
    await writeFile(configPath, '{}')
    const run = vi.fn().mockResolvedValue({ code: 0 })

    await runRealtimeDev(
      {
        configPath,
        containerName: 'example-realtime',
        port: 8123,
        origin: 'http://localhost:3100',
        secret: 'development-secret',
        bindAddress: '0.0.0.0',
      },
      { run },
    )

    expect(run).toHaveBeenCalledOnce()
    const [command, args] = run.mock.calls[0]! as [string, string[]]
    const isEnvironment = (_argument: string, index: number) => args[index - 1] === '-e'
    expect({
      command,
      args: args.filter((argument, index) => argument !== '-e' && !isEnvironment(argument, index)),
      environment: args.filter(isEnvironment).toSorted(),
    }).toEqual({
      command: 'docker',
      args: [
        'run',
        '--rm',
        '--name',
        'example-realtime',
        '--add-host',
        'host.docker.internal:host-gateway',
        '-p',
        '0.0.0.0:8123:8000',
        '-v',
        `${configPath}:/centrifugo/config.json:ro`,
        'ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.4@sha256:183261400ef822d3dfb7ae9391dc3836d343e01de41ab131df6a42751f87288e',
        '/usr/local/bin/centrifugo',
        '--config=/centrifugo/config.json',
      ],
      environment: [
        'CENTRIFUGO_CLIENT_ALLOWED_ORIGINS=http://localhost:3100',
        'CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_ENABLED=true',
        'CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY=development-secret',
        'CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY=development-secret',
        'CENTRIFUGO_HEALTH_ENABLED=true',
        'CENTRIFUGO_HTTP_API_KEY=development-secret',
        'CENTRIFUGO_VAR_PROXY_SECRET=development-secret',
      ],
    })
    await rm(directory, { recursive: true })
  })

  it('replaces an existing container only in detached mode', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ras-stack-realtime-dev-'))
    const configPath = join(directory, 'realtime.json')
    await writeFile(configPath, '{}')
    const run = vi.fn().mockResolvedValue({ code: 0 })

    await runRealtimeDev(
      {
        configPath,
        containerName: 'example-realtime',
        port: 8000,
        origin: 'http://localhost:3000',
        secret: 'secret',
        detached: true,
        connectProxyEndpoint: 'http://host.docker.internal:3000/api/centrifugo/connect',
      },
      { run },
    )

    expect(run.mock.calls[0]).toEqual(['docker', ['rm', '--force', 'example-realtime'], 'ignore'])
    expect(run.mock.calls[1]?.[1]).toContain('-d')
    expect(run.mock.calls[1]?.[1]).toContain(
      'CENTRIFUGO_CLIENT_PROXY_CONNECT_ENDPOINT=http://host.docker.internal:3000/api/centrifugo/connect',
    )
    await rm(directory, { recursive: true })
  })

  it('fails before Docker when the config is unavailable', async () => {
    const run = vi.fn()
    await expect(
      runRealtimeDev(
        {
          configPath: '/does/not/exist.json',
          containerName: 'example-realtime',
          port: 8000,
          origin: 'http://localhost:3000',
          secret: 'secret',
        },
        { run },
      ),
    ).rejects.toThrow('realtime config is unavailable')
    expect(run).not.toHaveBeenCalled()
  })

  it('reports a missing Docker executable clearly', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ras-stack-realtime-dev-'))
    const configPath = join(directory, 'realtime.json')
    await writeFile(configPath, '{}')
    const run = vi.fn().mockRejectedValue(Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' }))

    await expect(
      runRealtimeDev(
        {
          configPath,
          containerName: 'example-realtime',
          port: 8000,
          origin: 'http://localhost:3000',
          secret: 'secret',
        },
        { run },
      ),
    ).rejects.toThrow('Docker is required')
    await rm(directory, { recursive: true })
  })

  it('parses explicit CLI settings and rejects unknown arguments', () => {
    expect(
      parseRealtimeDevArguments([
        '--config',
        './realtime.json',
        '--name',
        'example-realtime',
        '--port',
        '8001',
        '--bind-address',
        '0.0.0.0',
        '--origin',
        'http://localhost:3001',
        '--secret',
        'secret',
        '--detach',
      ]),
    ).toEqual({
      configPath: './realtime.json',
      containerName: 'example-realtime',
      port: 8001,
      bindAddress: '0.0.0.0',
      origin: 'http://localhost:3001',
      secret: 'secret',
      detached: true,
    })
    expect(() => parseRealtimeDevArguments(['--wat'])).toThrow("Unknown option '--wat'")
  })

  it('rejects a non-local bind address', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ras-stack-realtime-dev-'))
    const configPath = join(directory, 'realtime.json')
    await writeFile(configPath, '{}')
    await expect(
      runRealtimeDev({
        configPath,
        containerName: 'example-realtime',
        port: 8000,
        origin: 'http://localhost:3000',
        secret: 'secret',
        bindAddress: '192.0.2.1',
      }),
    ).rejects.toThrow('bindAddress must be 127.0.0.1 or 0.0.0.0')
    await rm(directory, { recursive: true })
  })
})
