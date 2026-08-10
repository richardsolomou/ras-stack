import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createManagedPostHogServerTelemetry,
  createPostHogRpcLogger,
  createPostHogServerClient,
  installPostHogServerTelemetryShutdown,
  shutdownPostHogServerClient,
} from './server.js'

const { capture, captureException, construct, emit, exporterConstruct, logShutdown, processorConstruct, providerConstruct, shutdown } =
  vi.hoisted(() => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    construct: vi.fn(),
    emit: vi.fn(),
    exporterConstruct: vi.fn(),
    logShutdown: vi.fn(async () => undefined),
    processorConstruct: vi.fn(),
    providerConstruct: vi.fn(),
    shutdown: vi.fn(async () => undefined),
  }))

vi.mock('posthog-node', () => ({
  PostHog: class {
    _shutdown = shutdown
    capture = capture
    captureException = captureException
    constructor(...arguments_: unknown[]) {
      construct(...arguments_)
    }
  },
}))

vi.mock('@opentelemetry/exporter-logs-otlp-http', () => ({
  OTLPLogExporter: class {
    readonly test = true
    constructor(...arguments_: unknown[]) {
      exporterConstruct(...arguments_)
    }
  },
}))

vi.mock('@opentelemetry/resources', () => ({ resourceFromAttributes: (attributes: unknown) => ({ attributes }) }))

vi.mock('@opentelemetry/sdk-logs', () => ({
  BatchLogRecordProcessor: class {
    readonly test = true
    constructor(...arguments_: unknown[]) {
      processorConstruct(...arguments_)
    }
  },
  LoggerProvider: class {
    constructor(...arguments_: unknown[]) {
      providerConstruct(...arguments_)
    }
    getLogger() {
      return { emit }
    }
    shutdown = logShutdown
  },
}))

const environment = {
  projectToken: 'phc_test',
  host: 'https://us.i.posthog.com',
  uiHost: 'https://us.posthog.com',
  assetsHost: 'https://us-assets.i.posthog.com',
}

describe('PostHog server integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not load a client when telemetry is unconfigured', async () => {
    expect(await createPostHogServerClient(undefined)).toBeUndefined()
    expect(construct).not.toHaveBeenCalled()
  })

  it('creates the native client with exception autocapture and explicit overrides', async () => {
    const client = await createPostHogServerClient(
      {
        projectToken: 'phc_test',
        host: 'https://us.i.posthog.com',
        uiHost: 'https://us.posthog.com',
        assetsHost: 'https://us-assets.i.posthog.com',
      },
      { flushAt: 1, flushInterval: 0 },
    )
    expect(client).toBeDefined()
    expect(construct).toHaveBeenCalledWith('phc_test', {
      host: 'https://us.i.posthog.com',
      enableExceptionAutocapture: true,
      flushAt: 1,
      flushInterval: 0,
    })
  })

  it('awaits the SDK shutdown boundary', async () => {
    const client = await createPostHogServerClient({
      projectToken: 'phc_test',
      host: 'https://us.i.posthog.com',
      uiHost: 'https://us.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
    })
    await shutdownPostHogServerClient(client, 5_000)
    expect(shutdown).toHaveBeenCalledWith(5_000)
  })

  it('rejects an invalid shutdown timeout', async () => {
    await expect(shutdownPostHogServerClient(undefined, -1)).rejects.toThrow('timeoutMs must be a non-negative integer')
  })

  it('keeps managed telemetry disabled without loading optional SDKs', async () => {
    const telemetry = createManagedPostHogServerTelemetry({ environment: undefined, serviceName: 'test' })
    await telemetry.start()
    await telemetry.capture('person', 'event')
    await telemetry.exception(new Error('failure'))
    await telemetry.log({ body: 'request completed' })
    expect(construct).not.toHaveBeenCalled()
    expect(providerConstruct).not.toHaveBeenCalled()
  })

  it('captures analytics, exceptions, and structured logs through one lifecycle', async () => {
    const telemetry = createManagedPostHogServerTelemetry({
      environment,
      serviceName: 'test-service',
      serviceVersion: '1.2.3',
      deploymentEnvironment: 'test',
    })
    await telemetry.capture('person', 'request_completed', { count: 2 })
    const failure = new Error('failure')
    await telemetry.exception(failure, 'person', { action: 'save' })
    await telemetry.log({ body: 'request completed', severityText: 'info', attributes: { count: 2 } })
    expect(capture).toHaveBeenCalledWith({ distinctId: 'person', event: 'request_completed', properties: { count: 2 } })
    expect(captureException).toHaveBeenCalledWith(failure, 'person', { action: 'save' })
    expect(exporterConstruct).toHaveBeenCalledWith({
      url: 'https://us.i.posthog.com/i/v1/logs',
      headers: { Authorization: 'Bearer phc_test' },
    })
    expect(providerConstruct).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: {
          attributes: {
            'service.name': 'test-service',
            'service.version': '1.2.3',
            'deployment.environment': 'test',
          },
        },
      }),
    )
    expect(emit).toHaveBeenCalledWith({
      body: 'request completed',
      severityText: 'info',
      attributes: { count: 2 },
    })
  })

  it('retries failed initialization without failing application work', async () => {
    const diagnostic = vi.fn()
    construct.mockImplementationOnce(() => {
      throw new Error('startup failed')
    })
    const telemetry = createManagedPostHogServerTelemetry({ environment, serviceName: 'test', onError: diagnostic })
    await expect(telemetry.capture('person', 'first')).resolves.toBeUndefined()
    await telemetry.capture('person', 'second')
    expect(construct).toHaveBeenCalledTimes(2)
    expect(capture).toHaveBeenCalledWith({ distinctId: 'person', event: 'second' })
    expect(diagnostic).toHaveBeenCalledTimes(1)
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ message: 'startup failed' }))
  })

  it('correlates RPC exceptions and logs with trusted request context', async () => {
    const telemetry = createManagedPostHogServerTelemetry({ environment, serviceName: 'test' })
    const logError = vi.fn()
    const logger = createPostHogRpcLogger(telemetry, {
      logError,
      resolveAuthenticatedDistinctId: async () => 'person-1',
    })
    const failure = new Error('secret failure')
    const request = new Request('https://example.com/private?token=secret', {
      method: 'POST',
      headers: { 'x-posthog-distinct-id': 'person-1', 'x-posthog-session-id': 'session-1' },
    })
    await logger(failure, { method: 'POST', path: '/private' }, request)
    const properties = { $session_id: 'session-1', request_method: 'POST', request_path: '/private' }
    expect(logError).toHaveBeenCalledWith(failure, { method: 'POST', path: '/private' })
    expect(captureException).toHaveBeenCalledWith(failure, 'person-1', properties)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'server function failed',
        attributes: { ...properties, posthogDistinctId: 'person-1' },
      }),
    )
  })

  it('captures RPC failures when the application logger throws', async () => {
    const telemetry = createManagedPostHogServerTelemetry({ environment, serviceName: 'test' })
    const logger = createPostHogRpcLogger(telemetry, {
      logError: () => {
        throw new Error('logger failed')
      },
    })
    const failure = new Error('request failed')
    await logger(failure, { method: 'POST', path: '/action' })
    expect(captureException).toHaveBeenCalledWith(failure, 'server', { request_method: 'POST', request_path: '/action' })
  })

  it('flushes clients once and ignores captures after shutdown', async () => {
    const telemetry = createManagedPostHogServerTelemetry({ environment, serviceName: 'test' })
    await telemetry.start()
    await telemetry.shutdown(5_000)
    await telemetry.shutdown(5_000)
    await telemetry.capture('person', 'late')
    expect(shutdown).toHaveBeenCalledTimes(1)
    expect(shutdown).toHaveBeenCalledWith(5_000)
    expect(logShutdown).toHaveBeenCalledTimes(1)
    expect(capture).not.toHaveBeenCalled()
  })

  it('bounds a stuck log exporter during shutdown', async () => {
    const diagnostic = vi.fn()
    logShutdown.mockImplementationOnce(() => new Promise(() => undefined))
    const telemetry = createManagedPostHogServerTelemetry({ environment, serviceName: 'test', onError: diagnostic })
    await telemetry.start()
    await telemetry.shutdown(0)
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ message: 'PostHog log shutdown timed out after 0ms' }))
  })

  it('flushes once before restoring the process signal', async () => {
    const listeners = new Map<string, () => void>()
    const target = {
      pid: 123,
      on: vi.fn((signal: string, listener: () => void) => listeners.set(signal, listener)),
      off: vi.fn((signal: string) => listeners.delete(signal)),
      kill: vi.fn(),
    }
    const finish = Promise.withResolvers<void>()
    const shutdownTelemetry = { shutdown: vi.fn(() => finish.promise) }
    const remove = installPostHogServerTelemetryShutdown(shutdownTelemetry, target)
    listeners.get('SIGTERM')?.()
    listeners.get('SIGINT')?.()
    expect(target.kill).not.toHaveBeenCalled()
    finish.resolve()
    await finish.promise
    await Promise.resolve()
    expect(shutdownTelemetry.shutdown).toHaveBeenCalledTimes(1)
    expect(target.kill).toHaveBeenCalledWith(123, 'SIGTERM')
    expect(listeners.size).toBe(0)
    remove()
  })
})
