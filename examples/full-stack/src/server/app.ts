import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { persistedSecret } from 'ras-stack/auth'
import { bundledDirectory } from 'ras-stack/database'
import { openDrizzleSqlite } from 'ras-stack/database/sqlite'
import { createSmtpDelivery, smtpConfigFromEnvironment } from 'ras-stack/email'
import { postHogEnvironment } from 'ras-stack/posthog'
import { createManagedPostHogServerTelemetry } from 'ras-stack/posthog/server'
import { CentrifugoPublisher } from 'ras-stack/realtime'
import { globalSingleton } from 'ras-stack/server'
import { createAuth } from './auth'
import { loadEnvironment } from './environment'
import { OutboxWorker } from './outbox'
import * as schema from './schema'
import { UploadStore } from './uploads'

export function app() {
  return globalSingleton('ras-stack.example.full-stack', createApp)
}

function createApp() {
  const environment = loadEnvironment()
  mkdirSync(environment.dataDirectory, { recursive: true })
  const database = openDrizzleSqlite({
    file: path.join(environment.dataDirectory, 'example.sqlite'),
    schema,
    migrationsFolder: bundledDirectory({
      developmentUrl: new URL('../../drizzle', import.meta.url),
      production: import.meta.env.PROD,
      name: 'drizzle',
    }),
  })
  const smtp = smtpConfigFromEnvironment()
  const email = smtp ? createSmtpDelivery(smtp) : undefined
  let publishFailure: unknown
  const publisher = new CentrifugoPublisher({
    apiUrl: environment.centrifugoApiUrl,
    apiKey: environment.centrifugoApiKey,
    maxConcurrentChannels: 1,
    maxPendingChannels: 32,
    onError: (error, channel) => {
      publishFailure = error
      console.error({ event: 'example_realtime_publish_failed', channel, error })
    },
  })
  const telemetry = createManagedPostHogServerTelemetry({
    environment: postHogEnvironment({
      projectToken: process.env.VITE_POSTHOG_PROJECT_TOKEN,
      host: process.env.VITE_POSTHOG_HOST,
    }),
    serviceName: 'ras-stack-example',
    deploymentEnvironment: process.env.NODE_ENV,
    onError: (error) => console.error({ event: 'example_telemetry_failed', error }),
  })
  const auth = createAuth({
    database,
    email,
    environment,
    secret: persistedSecret({ directory: environment.dataDirectory, environmentKey: 'BETTER_AUTH_SECRET' }),
  })
  const outbox = new OutboxWorker({
    database,
    enabled: environment.realtimeEnabled,
    onError: (error) => console.error({ event: 'example_outbox_drain_failed', error }),
    publish: async (channel, payload) => {
      publishFailure = undefined
      if (!publisher.publish(channel, payload)) throw new Error('Realtime publisher rejected the outbox item')
      await publisher.idle()
      if (publishFailure) throw publishFailure
    },
  })
  const uploadStore = new UploadStore({
    database,
    directory: path.join(environment.dataDirectory, 'uploads'),
    globalMaxFiles: environment.uploadGlobalMaxFiles,
    globalQuotaBytes: environment.uploadGlobalQuotaBytes,
    maxBytes: environment.uploadMaxBytes,
    onError: (error) => console.error({ event: 'example_upload_cleanup_failed', error }),
    quotaBytes: environment.uploadQuotaBytes,
  })
  void telemetry.start()
  outbox.start()
  uploadStore.startCleanup()
  const application = { auth, database, email, environment, outbox, publisher, telemetry, uploadStore }
  if (!process.env.VITEST) installShutdown(application)
  return application
}

const closing = new WeakMap<object, Promise<void>>()

export function closeApp(value = app()) {
  const existing = closing.get(value)
  if (existing) return existing
  const promise = (async () => {
    const failures: unknown[] = []
    try {
      await value.outbox.close()
    } catch (error) {
      failures.push(error)
    }
    for (const result of await Promise.allSettled([value.uploadStore.close(), value.publisher.close(), value.telemetry.shutdown()])) {
      if (result.status === 'rejected') failures.push(result.reason)
    }
    try {
      value.database.$client.close()
    } catch (error) {
      failures.push(error)
    }
    if (failures.length) throw new AggregateError(failures, 'Failed to close the full-stack example cleanly')
  })()
  closing.set(value, promise)
  return promise
}

function installShutdown(application: ReturnType<typeof createApp>) {
  let started = false
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      if (started) return
      started = true
      void closeApp(application).then(
        () => process.exit(0),
        (error) => {
          console.error({ event: 'example_shutdown_failed', error })
          process.exit(1)
        },
      )
    })
  }
}
