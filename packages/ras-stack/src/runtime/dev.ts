import { spawn, type StdioOptions } from 'node:child_process'
import { once } from 'node:events'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { errorHasCode } from '../server/errors.js'
import { centrifugoEnvironment, port, requiredValue } from './stack.js'

const runtimeImage =
  'ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.4@sha256:183261400ef822d3dfb7ae9391dc3836d343e01de41ab131df6a42751f87288e'

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
type RunCommand = (command: string, args: readonly string[], stdio?: StdioOptions) => Promise<CommandResult>
type RealtimeDevDependencies = { run?: RunCommand }

export async function runRealtimeDev(options: RealtimeDevOptions, dependencies: RealtimeDevDependencies = {}) {
  const configPath = path.resolve(options.configPath)
  try {
    await access(configPath)
  } catch (error) {
    throw new Error(`realtime config is unavailable: ${configPath}`, { cause: error })
  }
  const containerName = dockerName(options.containerName)
  const publicPort = port(options.port, 'port')
  const bindAddress = dockerBindAddress(options.bindAddress ?? '127.0.0.1')
  const origin = httpUrl(options.origin, 'origin')
  const secret = requiredValue(options.secret, 'secret')
  const connectProxyEndpoint = options.connectProxyEndpoint ? httpEndpoint(options.connectProxyEndpoint) : undefined
  const run = dependencies.run ?? runCommand
  // Docker publishes the port to the container's network interface, which a loopback-only listener would not accept.
  const { CENTRIFUGO_HTTP_SERVER_ADDRESS: _loopback, ...centrifugo } = centrifugoEnvironment({
    apiKey: secret,
    clientTokenSecret: secret,
    subscriptionTokenSecret: secret,
    allowedOrigins: origin,
  })
  const environment = {
    ...centrifugo,
    CENTRIFUGO_VAR_PROXY_SECRET: secret,
    ...(connectProxyEndpoint ? { CENTRIFUGO_CLIENT_PROXY_CONNECT_ENDPOINT: connectProxyEndpoint } : {}),
  }

  try {
    if (options.detached) await run('docker', ['rm', '--force', containerName], 'ignore')
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
      ...Object.entries(environment).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
      '-v',
      `${configPath}:/centrifugo/config.json:ro`,
      runtimeImage,
      '/usr/local/bin/centrifugo',
      '--config=/centrifugo/config.json',
    ])
    if (result.code !== 0) throw new Error(`Docker exited with status ${result.code}`)
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) {
      throw new Error('Docker is required but was not found', { cause: error })
    }
    throw error
  }
}

export function parseRealtimeDevArguments(arguments_: readonly string[]): RealtimeDevOptions {
  const { values } = parseArgs({
    args: [...arguments_],
    options: {
      config: { type: 'string' },
      name: { type: 'string' },
      port: { type: 'string' },
      'bind-address': { type: 'string' },
      origin: { type: 'string' },
      secret: { type: 'string' },
      'connect-proxy-endpoint': { type: 'string' },
      detach: { type: 'boolean' },
    },
    strict: true,
  })
  return {
    configPath: requiredValue(values.config, '--config'),
    containerName: requiredValue(values.name, '--name'),
    port: Number(requiredValue(values.port, '--port')),
    ...(values['bind-address'] ? { bindAddress: values['bind-address'] } : {}),
    origin: requiredValue(values.origin, '--origin'),
    secret: requiredValue(values.secret, '--secret'),
    ...(values.detach ? { detached: true } : {}),
    ...(values['connect-proxy-endpoint'] ? { connectProxyEndpoint: values['connect-proxy-endpoint'] } : {}),
  }
}

async function runCommand(command: string, args: readonly string[], stdio: StdioOptions = 'inherit') {
  const [code] = (await once(spawn(command, [...args], { stdio }), 'exit')) as [number | null]
  return { code: code ?? 1 }
}

function dockerName(value: string) {
  const normalized = requiredValue(value, 'containerName')
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(normalized)) throw new Error('containerName is invalid')
  return normalized
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
