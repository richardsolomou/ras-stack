import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export { runRealtimeDev, type RealtimeDevOptions } from './dev.js'

export type RuntimeProcess = {
  name: string
  command: string
  args?: readonly string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

type SignalSource = Pick<NodeJS.Process, 'off' | 'once'>
type SpawnProcess = (process: RuntimeProcess) => ChildProcess

export type SupervisorOptions = {
  shutdownTimeoutMs?: number
  signalSource?: SignalSource
  spawn?: SpawnProcess
}

export async function superviseProcesses(processes: readonly RuntimeProcess[], options: SupervisorOptions = {}) {
  if (processes.length === 0) throw new Error('at least one runtime process is required')
  const names = new Set<string>()
  for (const process of processes) {
    if (!process.name.trim()) throw new Error('runtime process names must not be empty')
    if (!process.command.trim()) throw new Error(`runtime process ${process.name} must have a command`)
    if (names.has(process.name)) throw new Error(`duplicate runtime process name: ${process.name}`)
    names.add(process.name)
  }

  const signalSource = options.signalSource ?? process
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 0) {
    throw new Error('shutdownTimeoutMs must be a non-negative integer')
  }
  const spawnProcess =
    options.spawn ??
    ((specification: RuntimeProcess) =>
      spawn(specification.command, [...(specification.args ?? [])], {
        cwd: specification.cwd,
        env: specification.env ?? process.env,
        stdio: 'inherit',
      }))
  const children = new Map<ChildProcess, string>()
  let settled = false
  let resolveResult!: (value: number) => void
  const result = new Promise<number>((resolve) => {
    resolveResult = resolve
  })

  const finish = async (status: number) => {
    if (settled) return
    settled = true
    signalSource.off('SIGINT', onSignal)
    signalSource.off('SIGTERM', onSignal)
    await stopChildren([...children.keys()], shutdownTimeoutMs)
    resolveResult(status)
  }
  const onSignal = () => void finish(0)
  signalSource.once('SIGINT', onSignal)
  signalSource.once('SIGTERM', onSignal)

  try {
    for (const specification of processes) {
      const child = spawnProcess(specification)
      children.set(child, specification.name)
      child.once('error', () => void finish(1))
      child.once('exit', (code) => void finish(code && code > 0 ? code : 1))
    }
  } catch (error) {
    await finish(1)
    throw error
  }
  return result
}

async function stopChildren(children: ChildProcess[], timeoutMs: number) {
  const running = children.filter((child) => child.exitCode === null && child.signalCode === null)
  if (running.length === 0) return
  const exited = Promise.all(running.map((child) => new Promise<void>((resolve) => child.once('exit', () => resolve())))).then(
    () => 'exited' as const,
  )
  for (const child of running) child.kill('SIGTERM')
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  const outcome = await Promise.race([exited, timeout])
  if (timer) clearTimeout(timer)
  if (outcome === 'timeout') {
    for (const child of running) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
}

export type CentrifugoEnvironmentOptions = {
  apiKey: string
  clientTokenSecret?: string
  subscriptionTokenSecret?: string
  allowedOrigins?: string
  redisUrl?: string
}

export type RealtimeStackOptions = {
  app: Omit<RuntimeProcess, 'name'>
  centrifugo: {
    command?: string
    configPath: string
    cwd?: string
    env?: NodeJS.ProcessEnv
    environment: CentrifugoEnvironmentOptions
  }
  caddy: {
    command?: string
    configPath: string
    cwd?: string
    env?: NodeJS.ProcessEnv
    proxy?: CaddyRealtimeProxyOptions
    runtime?: CaddyRuntimeEnvironmentOptions
  }
  supervisor?: SupervisorOptions
}

export async function runRealtimeStack(options: RealtimeStackOptions) {
  const configPath = absolutePath(options.caddy.configPath, 'caddy.configPath')
  const centrifugoConfigPath = absolutePath(options.centrifugo.configPath, 'centrifugo.configPath')
  await mkdir(path.dirname(configPath), { recursive: true })
  await writeFile(configPath, caddyRealtimeProxy(options.caddy.proxy), 'utf8')
  return superviseProcesses(
    [
      { name: 'app', ...options.app },
      {
        name: 'realtime',
        command: options.centrifugo.command ?? 'centrifugo',
        args: [`--config=${centrifugoConfigPath}`],
        ...(options.centrifugo.cwd ? { cwd: options.centrifugo.cwd } : {}),
        env: { ...options.centrifugo.env, ...centrifugoEnvironment(options.centrifugo.environment) },
      },
      {
        name: 'proxy',
        command: options.caddy.command ?? 'caddy',
        args: ['run', '--config', configPath, '--adapter', 'caddyfile'],
        ...(options.caddy.cwd ? { cwd: options.caddy.cwd } : {}),
        env: { ...options.caddy.env, ...caddyRuntimeEnvironment(options.caddy.runtime) },
      },
    ],
    options.supervisor,
  )
}

export function centrifugoEnvironment(options: CentrifugoEnvironmentOptions): NodeJS.ProcessEnv {
  const apiKey = requiredValue(options.apiKey, 'apiKey')
  const clientTokenSecret = options.clientTokenSecret?.trim()
  const subscriptionTokenSecret = options.subscriptionTokenSecret?.trim()
  return {
    CENTRIFUGO_HTTP_API_KEY: apiKey,
    CENTRIFUGO_CLIENT_ALLOWED_ORIGINS: options.allowedOrigins?.trim() || '*',
    CENTRIFUGO_HTTP_SERVER_ADDRESS: '127.0.0.1',
    CENTRIFUGO_HEALTH_ENABLED: 'true',
    ...(clientTokenSecret ? { CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY: clientTokenSecret } : {}),
    ...(subscriptionTokenSecret
      ? {
          CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_ENABLED: 'true',
          CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY: subscriptionTokenSecret,
        }
      : {}),
    ...(options.redisUrl
      ? { CENTRIFUGO_ENGINE_TYPE: 'redis', CENTRIFUGO_ENGINE_REDIS_ADDRESS: requiredValue(options.redisUrl, 'redisUrl') }
      : {}),
  }
}

export type CaddyRuntimeEnvironmentOptions = { configHome?: string; dataHome?: string }

export function caddyRuntimeEnvironment(options: CaddyRuntimeEnvironmentOptions = {}): NodeJS.ProcessEnv {
  const configHome = absolutePath(options.configHome ?? '/tmp/caddy-config', 'configHome')
  const dataHome = absolutePath(options.dataHome ?? '/tmp/caddy-data', 'dataHome')
  return { XDG_CONFIG_HOME: configHome, XDG_DATA_HOME: dataHome }
}

export type CaddyRealtimeProxyOptions = { publicPort?: number; appPort?: number; realtimePort?: number; websocketPath?: string }

export function caddyRealtimeProxy(options: CaddyRealtimeProxyOptions = {}) {
  const publicPort = port(options.publicPort ?? 3000, 'publicPort')
  const appPort = port(options.appPort ?? 3001, 'appPort')
  const realtimePort = port(options.realtimePort ?? 8000, 'realtimePort')
  const websocketPath = options.websocketPath ?? '/connection/'
  if (!/^\/[A-Za-z0-9._~/-]+\/$/.test(websocketPath) || websocketPath.includes('//')) {
    throw new Error('websocketPath must be a normalized absolute directory path')
  }
  return `{
\tservers {
\t\ttrusted_proxies static private_ranges
\t\ttrusted_proxies_strict
\t}
}

:${publicPort} {
\troute {
\t\t@foreignWebSocketOrigin \`{path}.startsWith('${websocketPath}') && {http.request.header.Origin} != '' && {http.request.header.Origin} != 'http://' + {http.request.hostport} && {http.request.header.Origin} != 'https://' + {http.request.hostport}\`
\t\trespond @foreignWebSocketOrigin 403

\t\thandle ${websocketPath}* {
\t\t\treverse_proxy 127.0.0.1:${realtimePort}
\t\t}

\t\thandle {
\t\t\treverse_proxy 127.0.0.1:${appPort}
\t\t}
\t}
}
`
}

function requiredValue(value: string, name: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function port(value: number, name: string) {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error(`${name} must be a valid TCP port`)
  return value
}

function absolutePath(value: string, name: string) {
  if (!path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`)
  return value
}
