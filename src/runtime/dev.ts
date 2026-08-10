import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'

const runtimeImage =
  'ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.0@sha256:5f82b2d53b93465bf91cc1bc90b292e94cbdd823cedd3f432dca94097e59163d'

export type RealtimeDevOptions = {
  configPath: string
  containerName: string
  port: number
  bindAddress?: string
  origin: string
  secret: string
  detached?: boolean
  connectProxyEndpoint?: string
}

type CommandResult = { code: number }
type RunCommand = (command: string, args: readonly string[]) => Promise<CommandResult>
type RealtimeDevDependencies = { remove?: (containerName: string) => Promise<void>; run?: RunCommand }

export async function runRealtimeDev(options: RealtimeDevOptions, dependencies: RealtimeDevDependencies = {}) {
  const configPath = path.resolve(options.configPath)
  try {
    await access(configPath)
  } catch (error) {
    throw new Error(`realtime config is unavailable: ${configPath}`, { cause: error })
  }
  const containerName = dockerName(options.containerName)
  const publicPort = tcpPort(options.port)
  const bindAddress = dockerBindAddress(options.bindAddress ?? '127.0.0.1')
  const origin = httpUrl(options.origin, 'origin')
  const secret = required(options.secret, 'secret')
  const connectProxyEndpoint = options.connectProxyEndpoint ? httpEndpoint(options.connectProxyEndpoint) : undefined
  const run = dependencies.run ?? runCommand
  const remove = dependencies.remove ?? removeContainer

  try {
    if (options.detached) await remove(containerName)
    const result = await run('docker', [
      'run',
      '--rm',
      ...(options.detached ? ['-d'] : []),
      '--name',
      containerName,
      '--add-host',
      'host.docker.internal:host-gateway',
      '-p',
      `${bindAddress}:${publicPort}:8000`,
      '-e',
      `CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY=${secret}`,
      '-e',
      'CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_ENABLED=true',
      '-e',
      `CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY=${secret}`,
      '-e',
      `CENTRIFUGO_HTTP_API_KEY=${secret}`,
      '-e',
      `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS=${origin}`,
      '-e',
      `CENTRIFUGO_VAR_PROXY_SECRET=${secret}`,
      ...(connectProxyEndpoint ? ['-e', `CENTRIFUGO_CLIENT_PROXY_CONNECT_ENDPOINT=${connectProxyEndpoint}`] : []),
      '-v',
      `${configPath}:/centrifugo/config.json:ro`,
      runtimeImage,
      '/usr/local/bin/centrifugo',
      '--config=/centrifugo/config.json',
      '--health.enabled',
    ])
    if (result.code !== 0) throw new Error(`Docker exited with status ${result.code}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Docker is required but was not found', { cause: error })
    }
    throw error
  }
}

export function parseRealtimeDevArguments(arguments_: readonly string[]): RealtimeDevOptions {
  const values = new Map<string, string>()
  let detached = false
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!
    if (argument === '--detach') {
      detached = true
      continue
    }
    if (!['--config', '--name', '--port', '--bind-address', '--origin', '--secret', '--connect-proxy-endpoint'].includes(argument)) {
      throw new Error(`unknown argument: ${argument}`)
    }
    const value = arguments_[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
    values.set(argument, value)
    index += 1
  }
  const connectProxyEndpoint = values.get('--connect-proxy-endpoint')
  const bindAddress = values.get('--bind-address')
  return {
    configPath: required(values.get('--config'), '--config'),
    containerName: required(values.get('--name'), '--name'),
    port: Number(required(values.get('--port'), '--port')),
    ...(bindAddress ? { bindAddress } : {}),
    origin: required(values.get('--origin'), '--origin'),
    secret: required(values.get('--secret'), '--secret'),
    ...(detached ? { detached: true } : {}),
    ...(connectProxyEndpoint ? { connectProxyEndpoint } : {}),
  }
}

async function runCommand(command: string, args: readonly string[]) {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => resolve({ code: code ?? 1 }))
  })
}

async function removeContainer(containerName: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', ['rm', '--force', containerName], { stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', () => resolve())
  })
}

function required(value: string | undefined, name: string) {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function dockerName(value: string) {
  const normalized = required(value, 'containerName')
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(normalized)) throw new Error('containerName is invalid')
  return normalized
}

function tcpPort(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error('port must be a valid TCP port')
  return value
}

function dockerBindAddress(value: string) {
  if (value !== '127.0.0.1' && value !== '0.0.0.0') throw new Error('bindAddress must be 127.0.0.1 or 0.0.0.0')
  return value
}

function httpUrl(value: string, name: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be an HTTP URL`)
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must be an HTTP origin`)
  }
  return parsed.origin
}

function httpEndpoint(value: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('connectProxyEndpoint must be an HTTP URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('connectProxyEndpoint must be an HTTP URL without credentials, query, or fragment')
  }
  return parsed.toString()
}
