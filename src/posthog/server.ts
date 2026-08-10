import type { PostHog, PostHogOptions } from 'posthog-node'
import type { RpcErrorContext, RpcLogger } from '../server/rpc.js'
import type { PostHogEnvironment } from './config.js'
import { postHogRequestContext } from './request.js'

type LogProvider = InstanceType<(typeof import('@opentelemetry/sdk-logs'))['LoggerProvider']>

export type PostHogLogValue = string | number | boolean | null | PostHogLogValue[]

export type PostHogLogRecord = {
  body: string
  severityText?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  timestamp?: number
  attributes?: Record<string, unknown>
}

export type ManagedPostHogServerTelemetryOptions = {
  environment: PostHogEnvironment | undefined
  serviceName: string
  serviceVersion?: string
  deploymentEnvironment?: string
  clientOptions?: Omit<PostHogOptions, 'host'>
  onError?: (error: unknown) => void
}

export type PostHogServerTelemetry = ReturnType<typeof createManagedPostHogServerTelemetry>

export type PostHogRpcLoggerOptions = {
  logError?: (error: unknown, context: RpcErrorContext) => void
  resolveAuthenticatedDistinctId?: (request: Request) => string | undefined | Promise<string | undefined>
  allowAnonymousDistinctId?: boolean
  fallbackDistinctId?: string
}

type PostHogShutdownProcess = {
  pid: number
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void
  kill(pid: number, signal: 'SIGINT' | 'SIGTERM'): void
}

export async function createPostHogServerClient(
  environment: PostHogEnvironment | undefined,
  options: Omit<PostHogOptions, 'host'> = {},
): Promise<PostHog | undefined> {
  if (!environment) return undefined
  const { PostHog } = await import('posthog-node')
  return new PostHog(environment.projectToken, {
    host: environment.host,
    enableExceptionAutocapture: true,
    ...options,
  })
}

export async function shutdownPostHogServerClient(client: PostHog | undefined, timeoutMs = 10_000) {
  assertShutdownTimeout(timeoutMs)
  // oxlint-disable-next-line no-underscore-dangle -- posthog-node's async shutdown API is named `_shutdown`.
  await client?._shutdown(timeoutMs)
}

export function createManagedPostHogServerTelemetry(options: ManagedPostHogServerTelemetryOptions) {
  let client: Promise<PostHog | undefined> | undefined
  let logProvider: Promise<LogProvider | undefined> | undefined
  let closed = false

  const report = (error: unknown) => {
    try {
      options.onError?.(error)
    } catch {}
  }

  const getClient = () => {
    if (closed || !options.environment) return undefined
    if (!client) {
      const pending = createPostHogServerClient(options.environment, options.clientOptions)
      client = pending
      void pending.catch(() => {
        if (client === pending) client = undefined
      })
    }
    return client
  }

  const getLogProvider = () => {
    if (closed || !options.environment) return undefined
    if (!logProvider) {
      const pending = createPostHogLogProvider(options)
      logProvider = pending
      void pending.catch(() => {
        if (logProvider === pending) logProvider = undefined
      })
    }
    return logProvider
  }

  const safely = async (work: () => void | Promise<void>) => {
    if (closed || !options.environment) return
    try {
      await work()
    } catch (error) {
      report(error)
    }
  }

  return {
    async start() {
      await safely(async () => {
        await Promise.all([getClient(), getLogProvider()])
      })
    },
    async capture(distinctId: string, event: string, properties?: Record<string, unknown>) {
      await safely(async () => {
        const value = await getClient()
        value?.capture({ distinctId, event, ...(properties ? { properties } : {}) })
      })
    },
    async exception(error: unknown, distinctId = 'server', properties?: Record<string, unknown>) {
      await safely(async () => {
        const value = await getClient()
        value?.captureException(error, distinctId, properties)
      })
    },
    async log(record: PostHogLogRecord) {
      await safely(async () => {
        const provider = await getLogProvider()
        const attributes = boundedAttributes(record.attributes)
        provider?.getLogger(options.serviceName).emit({
          body: boundedString(record.body),
          ...(record.severityText ? { severityText: record.severityText } : {}),
          ...(record.timestamp === undefined ? {} : { timestamp: record.timestamp }),
          ...(attributes ? { attributes } : {}),
        })
      })
    },
    async shutdown(timeoutMs = 10_000) {
      if (closed) return
      assertShutdownTimeout(timeoutMs)
      closed = true
      const results = await Promise.allSettled([
        client?.then((value) => shutdownPostHogServerClient(value, timeoutMs)),
        logProvider?.then((value) => shutdownPostHogLogProvider(value, timeoutMs)),
      ])
      for (const result of results) if (result.status === 'rejected') report(result.reason)
    },
  }
}

export function createPostHogRpcLogger(telemetry: PostHogServerTelemetry, options: PostHogRpcLoggerOptions = {}): RpcLogger {
  return async (error, context, request) => {
    try {
      options.logError?.(error, context)
    } catch {}
    let authenticatedDistinctId: string | undefined
    if (request && options.resolveAuthenticatedDistinctId) {
      try {
        authenticatedDistinctId = await options.resolveAuthenticatedDistinctId(request)
      } catch {}
    }
    const correlation = request
      ? postHogRequestContext(request, {
          ...(authenticatedDistinctId ? { authenticatedDistinctId } : {}),
          ...(options.allowAnonymousDistinctId === undefined ? {} : { allowAnonymousDistinctId: options.allowAnonymousDistinctId }),
        })
      : { properties: {} }
    const distinctId = correlation.distinctId ?? options.fallbackDistinctId ?? 'server'
    const properties = {
      ...correlation.properties,
      ...(context.method ? { request_method: context.method } : {}),
      ...(context.path ? { request_path: context.path } : {}),
    }
    await Promise.all([
      telemetry.exception(error, distinctId, properties),
      telemetry.log({
        body: 'server function failed',
        severityText: 'error',
        attributes: { ...properties, posthogDistinctId: distinctId },
      }),
    ])
  }
}

export function installPostHogServerTelemetryShutdown(
  telemetry: Pick<PostHogServerTelemetry, 'shutdown'>,
  target: PostHogShutdownProcess = process,
) {
  let shuttingDown = false
  const listeners = new Map<'SIGINT' | 'SIGTERM', () => void>()
  const remove = () => {
    for (const [signal, listener] of listeners) target.off(signal, listener)
    listeners.clear()
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const listener = () => {
      if (shuttingDown) return
      shuttingDown = true
      void telemetry
        .shutdown()
        .catch(() => undefined)
        .finally(() => {
          remove()
          target.kill(target.pid, signal)
        })
    }
    listeners.set(signal, listener)
    target.on(signal, listener)
  }
  return remove
}

async function createPostHogLogProvider(options: ManagedPostHogServerTelemetryOptions): Promise<LogProvider | undefined> {
  if (!options.environment) return undefined
  const [{ OTLPLogExporter }, { resourceFromAttributes }, { BatchLogRecordProcessor, LoggerProvider }] = await Promise.all([
    import('@opentelemetry/exporter-logs-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/sdk-logs'),
  ])
  const exporter = new OTLPLogExporter({
    url: `${options.environment.host.replace(/\/$/, '')}/i/v1/logs`,
    headers: { Authorization: `Bearer ${options.environment.projectToken}` },
  })
  return new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': options.serviceName,
      ...(options.serviceVersion ? { 'service.version': options.serviceVersion } : {}),
      ...(options.deploymentEnvironment ? { 'deployment.environment': options.deploymentEnvironment } : {}),
    }),
    processors: [new BatchLogRecordProcessor({ exporter })],
  })
}

function boundedAttributes(attributes: Record<string, unknown> | undefined) {
  if (!attributes) return undefined
  return Object.fromEntries(
    Object.entries(attributes)
      .slice(0, 64)
      .map(([key, value]) => [key.slice(0, 128), boundedLogValue(value, 0)])
      .filter((entry): entry is [string, PostHogLogValue] => entry[1] !== undefined),
  )
}

function boundedLogValue(value: unknown, depth: number): PostHogLogValue | undefined {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return boundedString(value)
  if (depth >= 3) return '[Truncated]'
  if (Array.isArray(value)) {
    return value
      .slice(0, 32)
      .map((entry) => boundedLogValue(entry, depth + 1))
      .filter((entry): entry is PostHogLogValue => entry !== undefined)
  }
  if (value === undefined) return undefined
  try {
    return boundedString(JSON.stringify(value))
  } catch {
    return '[Unserializable value]'
  }
}

function boundedString(value: string) {
  return value.slice(0, 2_048)
}

async function shutdownPostHogLogProvider(provider: LogProvider | undefined, timeoutMs: number) {
  if (!provider) return
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      provider.shutdown(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`PostHog log shutdown timed out after ${timeoutMs}ms`)), timeoutMs)
        timeout.unref?.()
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function assertShutdownTimeout(timeoutMs: number) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('timeoutMs must be a non-negative integer')
}
