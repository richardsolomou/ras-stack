import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { persistedSecret, standardRateLimitOptions, standardSessionOptions } from 'ras-stack/auth'
import { openDrizzleSqlite, openSqliteClient, type OpenDrizzleSqliteOptions } from 'ras-stack/database/sqlite'
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
  const databaseFile = path.join(environment.dataDirectory, 'example.sqlite')
  prepareLegacyMessages(databaseFile)
  const options: OpenDrizzleSqliteOptions<typeof schema> = {
    file: databaseFile,
    schema,
    migrationsFolder: migrationsDirectory(),
  }
  const database = openDrizzleSqlite(options)
  importLegacyMessages(database.$client)
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
    secret: process.env.BETTER_AUTH_SECRET ?? persistedSecret({ directory: environment.dataDirectory, filename: 'auth.secret' }),
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

function prepareLegacyMessages(file: string) {
  const client = openSqliteClient(file)
  try {
    if (!tableExists(client, 'messages')) return
    const columns = client.pragma('table_info(messages)') as Array<{ name: string }>
    if (columns.some((column) => column.name === 'author_id')) return
    if (tableExists(client, 'messages_legacy')) throw new Error('Both messages and messages_legacy exist; refusing ambiguous migration')
    client.exec('ALTER TABLE messages RENAME TO messages_legacy')
  } finally {
    client.close()
  }
}

function importLegacyMessages(client: ReturnType<typeof openSqliteClient>) {
  if (!tableExists(client, 'messages_legacy')) return
  client.transaction(() => {
    const now = Date.now()
    client
      .prepare('INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, false, ?, ?)')
      .run('legacy-import', 'Legacy import', 'legacy-import@invalid.example', now, now)
    client.exec(`INSERT INTO messages (id, author_id, author, body, created_at)
      SELECT id, 'legacy-import', author, body, created_at FROM messages_legacy;
      DROP TABLE messages_legacy;`)
  })()
}

function tableExists(client: ReturnType<typeof openSqliteClient>, name: string) {
  return Boolean(client.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function migrationsDirectory() {
  const directories = [
    path.resolve(import.meta.dirname, 'drizzle'),
    path.resolve(import.meta.dirname, '..', 'drizzle'),
    path.resolve(process.cwd(), 'drizzle'),
  ]
  const directory = directories.find((candidate) => existsSync(path.join(candidate, 'meta', '_journal.json')))
  if (!directory) throw new Error(`Drizzle migrations are missing from ${directories.join(', ')}`)
  return directory
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

export { standardRateLimitOptions, standardSessionOptions }

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
