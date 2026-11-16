/// <reference lib="esnext.disposable" />

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import * as authSchema from '../db/authSchema'
import { databaseFile, openDatabase } from '../db/database'
import { createAuth } from './auth'
import { createTelemetry } from './telemetry'

export type App = ReturnType<typeof createApp>

const appKey = Symbol.for('app.server')
type AppGlobal = typeof globalThis & { [appKey]?: App }

/**
 * The server's long-lived resources, created on first use. The instance lives on `globalThis`, so Vite's
 * development module reloads reuse it instead of opening a second set of connections.
 */
export function app(): App {
  const scope = globalThis as AppGlobal
  return (scope[appKey] ??= createApp())
}

function createApp() {
  // Each resource registers its cleanup as it is created, and closing runs them in reverse.
  const resources = new AsyncDisposableStack()
  try {
    // First, so it closes last and records the others closing.
    const telemetry = resources.adopt(createTelemetry(), (created) => created.shutdown())
    // Awaited where it is used. The handled copy keeps a failed migration from crashing the process before the health check reports it.
    const database = openDatabase(databaseFile())
    const opened = database.catch(() => undefined)
    resources.defer(async () => (await opened)?.$client.close())
    const auth = database.then((db) => createAuth(drizzleAdapter(db, { provider: 'sqlite', schema: authSchema })))
    // Handled for the same reason; the auth route and session helpers still see the failure when they await it.
    auth.catch(() => undefined)
    return { telemetry, database, auth, close: () => resources.disposeAsync() }
  } catch (error) {
    disposeInBackground(resources)
    throw error
  }
}

/** Closes what a failed `createApp` already opened, so retrying on the next `app()` call does not leak a set per attempt. */
function disposeInBackground(resources: AsyncDisposableStack) {
  resources.disposeAsync().catch((cause: unknown) => {
    console.error('closing a partially created app failed', cause)
  })
}

/** Closes the current instance, if any; the next `app()` call creates a fresh one. */
export async function closeApp() {
  const scope = globalThis as AppGlobal
  const current = scope[appKey]
  delete scope[appKey]
  await current?.close()
}
