import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { CentrifugoPublisher } from 'ras-stack/realtime'
import { globalSingleton } from 'ras-stack/server'
import { openDrizzleSqlite, type OpenDrizzleSqliteOptions } from 'ras-stack/database/sqlite'
import { smtpConfigFromEnvironment } from 'ras-stack/email'
import { persistedSecret } from 'ras-stack/auth'
import { postHogEnvironment } from 'ras-stack/posthog'
import { createManagedPostHogServerTelemetry, installPostHogServerTelemetryShutdown } from 'ras-stack/posthog/server'
import * as schema from './schema'

const dataDirectory = () => path.resolve(process.env.DATA_DIR ?? '.data/example-full-stack')

export function app() {
  return globalSingleton('ras-stack.example.full-stack', () => createApp())
}

function createApp() {
  const directory = dataDirectory()
  mkdirSync(directory, { recursive: true })
  const options: OpenDrizzleSqliteOptions<typeof schema> = { file: path.join(directory, 'example.sqlite'), schema }
  const database = openDrizzleSqlite(options)
  database.$client.exec(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)
  const publisher = new CentrifugoPublisher({
    apiUrl: process.env.CENTRIFUGO_API_URL ?? '',
    apiKey: process.env.CENTRIFUGO_API_KEY ?? '',
    onError: (error, channel) => console.error({ event: 'example_realtime_publish_failed', channel, error }),
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
  if (!process.env.VITEST) installPostHogServerTelemetryShutdown(telemetry)
  void telemetry.start()
  return {
    database,
    publisher,
    authSecret: persistedSecret({ directory, filename: 'session.secret' }),
    emailConfigured: Boolean(smtpConfigFromEnvironment()),
    telemetry,
  }
}
