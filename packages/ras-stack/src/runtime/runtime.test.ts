import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { caddyRealtimeProxy, caddyRuntimeEnvironment, centrifugoEnvironment, persistedRealtimeSecret, runRealtimeStack } from './stack.js'

describe('self-hosted runtime configuration', () => {
  it('builds standard token and Redis Centrifugo environment', () => {
    expect(
      centrifugoEnvironment({
        apiKey: 'api',
        clientTokenSecret: 'client',
        subscriptionTokenSecret: 'subscription',
        redisUrl: 'redis://cache:6379',
      }),
    ).toEqual({
      CENTRIFUGO_HTTP_API_KEY: 'api',
      CENTRIFUGO_CLIENT_ALLOWED_ORIGINS: '*',
      CENTRIFUGO_HTTP_SERVER_ADDRESS: '127.0.0.1',
      CENTRIFUGO_HEALTH_ENABLED: 'true',
      CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY: 'client',
      CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_ENABLED: 'true',
      CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY: 'subscription',
      CENTRIFUGO_ENGINE_TYPE: 'redis',
      CENTRIFUGO_ENGINE_REDIS_ADDRESS: 'redis://cache:6379',
    })
  })

  it('generates the guarded Caddy proxy and isolated runtime directories', () => {
    const config = caddyRealtimeProxy()
    expect({
      app: config.includes('reverse_proxy 127.0.0.1:3001'),
      originGuard: config.includes('@foreignWebSocketOrigin'),
      realtime: config.includes('reverse_proxy 127.0.0.1:8000'),
      runtime: caddyRuntimeEnvironment(),
    }).toEqual({
      app: true,
      originGuard: true,
      realtime: true,
      runtime: { XDG_CONFIG_HOME: '/tmp/caddy-config', XDG_DATA_HOME: '/tmp/caddy-data' },
    })
  })

  it('compresses responses unless encoding is turned off', () => {
    expect(caddyRealtimeProxy()).toContain('\tencode zstd gzip\n')
    expect(caddyRealtimeProxy({ encode: false })).not.toContain('encode')
  })

  it('places Caddy state in explicit writable directories', () => {
    expect(caddyRuntimeEnvironment({ configHome: '/data/caddy-config', dataHome: '/data/caddy-data' })).toEqual({
      XDG_CONFIG_HOME: '/data/caddy-config',
      XDG_DATA_HOME: '/data/caddy-data',
    })
  })

  it('runs the standard topology and shuts it down in dependency order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ras-stack-runtime-'))
    const configPath = join(directory, 'Caddyfile')
    const signals = new EventEmitter() as EventEmitter & Pick<NodeJS.Process, 'off' | 'once'>
    const children = [child(), child(), child()]
    const spawned: Array<{ name: string; command: string; args?: readonly string[]; env?: NodeJS.ProcessEnv }> = []
    const running = runRealtimeStack({
      app: { command: 'node', args: ['server.mjs'], env: { APP: 'yes' } },
      centrifugo: {
        command: 'centrifugo-custom',
        configPath: '/app/realtime.json',
        env: { EXTRA: 'value' },
        environment: { apiKey: 'api', clientTokenSecret: 'secret', redisUrl: 'redis://cache:6379' },
      },
      caddy: {
        command: 'caddy-custom',
        configPath,
        env: { EXTRA: 'value' },
        runtime: { configHome: '/data/config', dataHome: '/data/data' },
      },
      supervisor: {
        signalSource: signals,
        spawn: (specification) => {
          spawned.push(specification)
          return children[spawned.length - 1]!.process
        },
      },
    })

    await vi.waitFor(() => expect(spawned).toHaveLength(3))
    expect(spawned).toEqual([
      { name: 'app', command: 'node', args: ['server.mjs'], env: { APP: 'yes' } },
      {
        name: 'realtime',
        command: 'centrifugo-custom',
        args: ['--config=/app/realtime.json'],
        env: expect.objectContaining({
          EXTRA: 'value',
          CENTRIFUGO_HTTP_API_KEY: 'api',
          CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY: 'secret',
          CENTRIFUGO_ENGINE_TYPE: 'redis',
        }),
      },
      {
        name: 'proxy',
        command: 'caddy-custom',
        args: ['run', '--config', configPath, '--adapter', 'caddyfile'],
        env: { EXTRA: 'value', XDG_CONFIG_HOME: '/data/config', XDG_DATA_HOME: '/data/data' },
      },
    ])
    expect(await readFile(configPath, 'utf8')).toContain('reverse_proxy 127.0.0.1:8000')

    signals.emit('SIGTERM')
    await vi.waitFor(() => expect(children[2]!.kill).toHaveBeenCalledWith('SIGTERM'))
    expect(children[0]!.kill).not.toHaveBeenCalled()
    children[2]!.exit(0, 'SIGTERM')
    await vi.waitFor(() => expect(children[0]!.kill).toHaveBeenCalledWith('SIGTERM'))
    expect(children[1]!.kill).not.toHaveBeenCalled()
    children[0]!.exit(0, 'SIGTERM')
    await vi.waitFor(() => expect(children[1]!.kill).toHaveBeenCalledWith('SIGTERM'))
    children[1]!.exit(0, 'SIGTERM')
    await expect(running).resolves.toBe(0)
    await rm(directory, { recursive: true })
  })

  it('force kills the entire realtime stack when a shutdown phase exceeds the shared timeout', async () => {
    vi.useFakeTimers()
    const signals = new EventEmitter() as EventEmitter & Pick<NodeJS.Process, 'off' | 'once'>
    const children = { app: child(), realtime: child(), proxy: child() }
    const { directory, running } = await startRealtimeStack(children, signals, 10)
    signals.emit('SIGTERM')
    expect(children.proxy.kill).toHaveBeenCalledWith('SIGTERM')
    expect(children.app.kill).not.toHaveBeenCalledWith('SIGTERM')
    await vi.advanceTimersByTimeAsync(10)
    await expect(running).resolves.toBe(0)
    expect(
      [children.proxy, children.app, children.realtime].every((value) => value.kill.mock.calls.some(([signal]) => signal === 'SIGKILL')),
    ).toBe(true)
    vi.useRealTimers()
    await rm(directory, { recursive: true })
  })

  it('tears down realtime siblings immediately when one stack process fails', async () => {
    const signals = new EventEmitter() as EventEmitter & Pick<NodeJS.Process, 'off' | 'once'>
    const children = { app: child(), realtime: child(), proxy: child() }
    const { directory, running } = await startRealtimeStack(children, signals)
    children.app.exit(2)
    await vi.waitFor(() => expect(children.realtime.kill).toHaveBeenCalledWith('SIGTERM'))
    expect(children.proxy.kill).toHaveBeenCalledWith('SIGTERM')
    children.realtime.exit(0, 'SIGTERM')
    children.proxy.exit(0, 'SIGTERM')
    await expect(running).resolves.toBe(2)
    await rm(directory, { recursive: true })
  })

  it('force kills realtime siblings that outlive the shutdown timeout after one stack process fails', async () => {
    vi.useFakeTimers()
    const signals = new EventEmitter() as EventEmitter & Pick<NodeJS.Process, 'off' | 'once'>
    const children = { app: child(), realtime: child(), proxy: child() }
    const { directory, running } = await startRealtimeStack(children, signals, 10)
    children.app.exit(2)
    await vi.advanceTimersByTimeAsync(10)
    await expect(running).resolves.toBe(2)
    expect([children.realtime.kill.mock.lastCall, children.proxy.kill.mock.lastCall]).toEqual([['SIGKILL'], ['SIGKILL']])
    vi.useRealTimers()
    await rm(directory, { recursive: true })
  })

  it('rejects invalid runtime configuration before spawning', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ras-stack-runtime-invalid-'))
    await expect(
      runRealtimeStack({
        app: { command: ' ' },
        centrifugo: { configPath: '/app/realtime.json', environment: { apiKey: 'api' } },
        caddy: { configPath: join(directory, 'Caddyfile') },
        supervisor: { spawn: () => expect.unreachable() },
      }),
    ).rejects.toThrow('runtime process app must have a command')
    await rm(directory, { recursive: true })
    expect(() => caddyRealtimeProxy({ publicPort: 0 })).toThrow('publicPort must be a valid TCP port')
    expect(() => caddyRealtimeProxy({ websocketPath: '//connection/' })).toThrow(
      'websocketPath must be a normalized absolute directory path',
    )
    expect(() => centrifugoEnvironment({ apiKey: ' ' })).toThrow('apiKey is required')
    expect(() => caddyRuntimeEnvironment({ configHome: 'relative' })).toThrow('configHome must be an absolute path')
  })
})

function child() {
  const process = new EventEmitter() as Omit<ChildProcess, 'exitCode' | 'signalCode'> & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
  }
  const kill = vi.fn((_signal?: NodeJS.Signals) => true)
  process.kill = kill
  process.exitCode = null
  process.signalCode = null
  const exit = (code: number | null, signal: NodeJS.Signals | null = null) => {
    process.exitCode = code
    process.signalCode = signal
    process.emit('exit', code, signal)
  }
  return { exit, kill, process }
}

async function startRealtimeStack(
  children: Record<'app' | 'realtime' | 'proxy', ReturnType<typeof child>>,
  signals: EventEmitter & Pick<NodeJS.Process, 'off' | 'once'>,
  shutdownTimeoutMs = 10_000,
) {
  const directory = await mkdtemp(join(tmpdir(), 'ras-stack-runtime-phases-'))
  const spawned: string[] = []
  const running = runRealtimeStack({
    app: { command: 'app' },
    centrifugo: { command: 'realtime', configPath: '/app/realtime.json', environment: { apiKey: 'api' } },
    caddy: { command: 'proxy', configPath: join(directory, 'Caddyfile') },
    supervisor: {
      signalSource: signals,
      shutdownTimeoutMs,
      spawn: ({ name }) => {
        spawned.push(name)
        return children[name as keyof typeof children].process
      },
    },
  })
  await vi.waitFor(() => expect(spawned).toEqual(['app', 'realtime', 'proxy']))
  return { directory, running }
}

describe('persisted realtime secret', () => {
  it('generates the secret once at the configured file and exports it to the environment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ras-stack-realtime-secret-'))
    const environment: NodeJS.ProcessEnv = { APP_REALTIME_SECRET_FILE: join(directory, 'realtime-secret') }
    const secret = persistedRealtimeSecret(environment, { prefix: 'APP_' })
    expect(secret).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(environment.APP_REALTIME_SECRET).toBe(secret)
    expect(await readFile(join(directory, 'realtime-secret'), 'utf8')).toBe(secret)
    expect(persistedRealtimeSecret({ ...environment, APP_REALTIME_SECRET: undefined }, { prefix: 'APP_' })).toBe(secret)
  })

  it('keeps a secret the environment already carries', () => {
    const environment: NodeJS.ProcessEnv = { REALTIME_SECRET: 'configured', REALTIME_SECRET_FILE: '/nonexistent/realtime-secret' }
    expect(persistedRealtimeSecret(environment)).toBe('configured')
  })
})
