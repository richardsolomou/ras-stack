import { AsyncLocalStorage } from 'node:async_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import type { CaptureMetricOptions, PostHog, PostHogOptions, Span, StartSpanOptions } from 'posthog-node'
import type { RpcErrorContext, RpcLogger, RpcObserver } from '../server/rpc.js'
import { currentServerFunction } from '../server/server-function.js'
import type { PostHogEnvironment } from './config.js'
import { postHogRequestContext, type PostHogRequestContextOptions } from './request.js'

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
  resourceAttributes?: Record<string, string>
  clientOptions?: Omit<PostHogOptions, 'host'>
  onError?: (error: unknown) => void
}

export type PostHogServerTelemetry = ReturnType<typeof createManagedPostHogServerTelemetry>

export type PostHogTelemetryContext = {
  distinctId?: string
  sessionId?: string
  properties?: Record<string, unknown>
}

export type PostHogTraceSpan = Span | undefined

export type PostHogRpcLoggerOptions = {
  logError?: (error: unknown, context: RpcErrorContext) => void
  resolveAuthenticatedDistinctId?: (request: Request) => string | undefined | Promise<string | undefined>
  allowAnonymousDistinctId?: boolean
  fallbackDistinctId?: string
}

export type PostHogRpcObserverOptions = {
  metricPrefix?: string
  spanName?: string
}

type PostHogShutdownProcess = {
  pid: number
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void
  kill(pid: number, signal: 'SIGINT' | 'SIGTERM'): void
}

async function createPostHogServerClient(environment: PostHogEnvironment, options: Omit<PostHogOptions, 'host'>) {
  const { PostHog } = await import('posthog-node')
  return new PostHog(environment.projectToken, {
    host: environment.host,
    enableExceptionAutocapture: true,
    ...options,
  })
}

export function createManagedPostHogServerTelemetry(options: ManagedPostHogServerTelemetryOptions) {
  let client: Promise<PostHog> | undefined
  let logProvider: Promise<LogProvider> | undefined
  let closed = false
  const context = new AsyncLocalStorage<PostHogTelemetryContext>()

  const report = (error: unknown) => {
    try {
      options.onError?.(error)
    } catch {}
  }

  const getClient = () => {
    if (closed || !options.environment) return undefined
    if (!client) {
      const pending = createPostHogServerClient(options.environment, managedClientOptions(options))
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
      const pending = createPostHogLogProvider(options.environment, options)
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

  const loadClient = async () => {
    try {
      return await getClient()
    } catch (error) {
      report(error)
      return undefined
    }
  }

  async function withContext<T>(telemetryContext: PostHogTelemetryContext, work: () => T): Promise<Awaited<T>> {
    const inherited = context.getStore()
    const correlation = {
      ...(inherited?.distinctId ? { distinctId: inherited.distinctId } : {}),
      ...(inherited?.sessionId ? { sessionId: inherited.sessionId } : {}),
      ...telemetryContext,
    }
    const requestContext: PostHogTelemetryContext = {
      ...(correlation.distinctId ? { distinctId: correlation.distinctId } : {}),
      ...(correlation.sessionId ? { sessionId: correlation.sessionId } : {}),
      properties: {
        ...inherited?.properties,
        ...telemetryContext.properties,
        ...(correlation.sessionId ? { $session_id: correlation.sessionId } : {}),
      },
    }
    const run = () => context.run(requestContext, work)
    const value = await loadClient()
    return (value ? value.withContext(telemetryContext, run) : run()) as Awaited<T>
  }

  async function withRequestContext<T>(request: Request, requestOptions: PostHogRequestContextOptions, work: () => T): Promise<Awaited<T>> {
    return withContext(postHogRequestContext(request, requestOptions), work)
  }

  async function withSpan<T>(name: string, work: (span: PostHogTraceSpan) => T): Promise<Awaited<T>>
  async function withSpan<T>(name: string, spanOptions: StartSpanOptions, work: (span: PostHogTraceSpan) => T): Promise<Awaited<T>>
  async function withSpan<T>(
    name: string,
    optionsOrWork: StartSpanOptions | ((span: PostHogTraceSpan) => T),
    maybeWork?: (span: PostHogTraceSpan) => T,
  ): Promise<Awaited<T>> {
    const spanOptions = typeof optionsOrWork === 'function' ? undefined : optionsOrWork
    const work = typeof optionsOrWork === 'function' ? optionsOrWork : maybeWork!
    const value = await loadClient()
    if (!value) return work(undefined) as Awaited<T>
    return (spanOptions ? value.withSpan(name, spanOptions, work) : value.withSpan(name, work)) as Awaited<T>
  }

  const metrics = {
    count(name: string, value = 1, metricOptions?: CaptureMetricOptions) {
      return safely(async () => (await getClient())?.metrics.count(name, value, metricOptions))
    },
    gauge(name: string, value: number, metricOptions?: CaptureMetricOptions) {
      return safely(async () => (await getClient())?.metrics.gauge(name, value, metricOptions))
    },
    histogram(name: string, value: number, metricOptions?: CaptureMetricOptions) {
      return safely(async () => (await getClient())?.metrics.histogram(name, value, metricOptions))
    },
  }

  return {
    metrics,
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
    async exception(error: unknown, distinctId?: string, properties?: Record<string, unknown>) {
      await safely(async () => {
        const value = await getClient()
        const correlation = context.getStore()
        const capturedProperties = mergeProperties(serverFunctionProperties(), properties, correlation?.properties)
        value?.captureException(error, distinctId ?? correlation?.distinctId ?? 'server', capturedProperties)
      })
    },
    async log(record: PostHogLogRecord) {
      await safely(async () => {
        const provider = await getLogProvider()
        const correlation = context.getStore()
        const attributes = boundedAttributes(
          mergeProperties(serverFunctionProperties(), record.attributes, {
            ...(correlation?.distinctId ? { posthogDistinctId: correlation.distinctId } : {}),
            ...(correlation?.sessionId ? { sessionId: correlation.sessionId } : {}),
          }),
        )
        provider?.getLogger(options.serviceName).emit({
          body: boundedString(record.body),
          ...(record.severityText ? { severityText: record.severityText } : {}),
          ...(record.timestamp === undefined ? {} : { timestamp: record.timestamp }),
          ...(attributes ? { attributes } : {}),
        })
      })
    },
    async flush() {
      await safely(async () => {
        const [value, provider] = await Promise.all([getClient(), getLogProvider()])
        await Promise.all([value?.flush(), provider?.forceFlush()])
      })
    },
    async startSpan(name: string, spanOptions?: StartSpanOptions) {
      return (await loadClient())?.startSpan(name, spanOptions)
    },
    withContext,
    withRequestContext,
    withSpan,
    async shutdown(timeoutMs = 10_000) {
      if (closed) return
      assertShutdownTimeout(timeoutMs)
      closed = true
      const results = await Promise.allSettled([
        // oxlint-disable-next-line no-underscore-dangle -- posthog-node's async shutdown API is named `_shutdown`.
        client?.then((value) => value._shutdown(timeoutMs)),
        logProvider?.then((value) => shutdownPostHogLogProvider(value, timeoutMs)),
      ])
      for (const result of results) if (result.status === 'rejected') report(result.reason)
    },
  }
}

function managedClientOptions(options: ManagedPostHogServerTelemetryOptions): Omit<PostHogOptions, 'host'> {
  const { metrics, traces, ...clientOptions } = options.clientOptions ?? {}
  const service = {
    serviceName: options.serviceName,
    ...(options.serviceVersion ? { serviceVersion: options.serviceVersion } : {}),
    ...(options.deploymentEnvironment ? { environment: options.deploymentEnvironment } : {}),
    ...(options.resourceAttributes ? { resourceAttributes: options.resourceAttributes } : {}),
  }
  return {
    ...clientOptions,
    metrics: { ...service, ...metrics },
    traces: { ...service, ...traces },
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
      ...(context.function ? { server_function: context.function } : {}),
      ...(context.status === undefined ? {} : { response_status: context.status }),
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

export function createPostHogRpcObserver(
  telemetry: Pick<PostHogServerTelemetry, 'metrics' | 'withRequestContext' | 'withSpan'>,
  options: PostHogRpcObserverOptions = {},
): RpcObserver {
  const metricPrefix = options.metricPrefix ?? 'server_function'
  const spanName = options.spanName ?? 'server_function'
  return async function observe<T>(request: Request | undefined, work: () => Promise<T>) {
    if (!request) return work()
    const method = request.method.toUpperCase()
    const identity = currentServerFunction()
    // A function name is bounded by the application's code, unlike its URL or caller.
    const attributes = identity ? { method, function: identity.name } : { method }
    const parent = request.headers.get('traceparent')
    const settled = await telemetry.withRequestContext(request, {}, () =>
      telemetry.withSpan(spanName, { kind: 'server', ...(parent ? { parent } : {}) }, async (span) => {
        const startedAt = performance.now()
        span?.setAttribute('http.request.method', method)
        if (identity) {
          span?.setAttribute('code.function.name', identity.name)
          span?.setAttribute('code.file.path', identity.filename)
        }
        let outcome = 'error'
        try {
          const value = await work()
          outcome = 'success'
          return { value }
        } catch (error) {
          const status = responseStatus(error)
          if (status !== undefined) span?.setAttribute('http.response.status_code', status)
          if (status === undefined || status >= 500) throw error
          outcome = status >= 400 ? 'refused' : 'success'
          // Returning instead of throwing keeps an intended response from marking the span as failed.
          return { response: error }
        } finally {
          span?.setAttribute('server.function.outcome', outcome)
          await Promise.all([
            telemetry.metrics.count(`${metricPrefix}.requests`, 1, { attributes: { ...attributes, outcome } }),
            telemetry.metrics.histogram(`${metricPrefix}.duration`, Math.max(0, performance.now() - startedAt), {
              unit: 'ms',
              attributes,
            }),
          ])
        }
      }),
    )
    if ('response' in settled) throw settled.response
    return settled.value
  }
}

/** The status of a thrown `Response`, which `createRpc` rethrows as an `Error` whose cause is that response. */
function responseStatus(error: unknown) {
  const response = error instanceof Error ? error.cause : error
  return response instanceof Response ? response.status : undefined
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

async function createPostHogLogProvider(environment: PostHogEnvironment, options: ManagedPostHogServerTelemetryOptions) {
  const [{ OTLPLogExporter }, { resourceFromAttributes }, { BatchLogRecordProcessor, LoggerProvider }] = await Promise.all([
    import('@opentelemetry/exporter-logs-otlp-http'),
    import('@opentelemetry/resources'),
    import('@opentelemetry/sdk-logs'),
  ])
  const exporter = new OTLPLogExporter({
    url: `${environment.host.replace(/\/$/, '')}/i/v1/logs`,
    headers: { Authorization: `Bearer ${environment.projectToken}` },
  })
  return new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': options.serviceName,
      ...(options.serviceVersion ? { 'service.version': options.serviceVersion } : {}),
      ...(options.deploymentEnvironment ? { 'deployment.environment': options.deploymentEnvironment } : {}),
      ...options.resourceAttributes,
    }),
    processors: [new BatchLogRecordProcessor({ exporter })],
  })
}

/** Names the server function a log or exception was recorded in, so it reads without the request path's opaque id. */
function serverFunctionProperties() {
  const name = currentServerFunction()?.name
  return name ? { server_function: name } : undefined
}

function mergeProperties(...values: Array<Record<string, unknown> | undefined>) {
  const merged = Object.assign({}, ...values.filter(Boolean))
  return Object.keys(merged).length ? merged : undefined
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

async function shutdownPostHogLogProvider(provider: LogProvider, timeoutMs: number) {
  const timer = new AbortController()
  try {
    await Promise.race([
      provider.shutdown(),
      delay(timeoutMs, undefined, { ref: false, signal: timer.signal }).then(() => {
        throw new Error(`PostHog log shutdown timed out after ${timeoutMs}ms`)
      }),
    ])
  } finally {
    timer.abort()
  }
}

function assertShutdownTimeout(timeoutMs: number) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('timeoutMs must be a non-negative integer')
}
