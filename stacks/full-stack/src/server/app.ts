/// <reference lib="esnext.disposable" />

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import * as authSchema from '../db/authSchema'
import { databaseFile, openDatabase } from '../db/database'
import { upload } from '../db/schema'
import { createAuth } from './auth'
import { createRealtime } from './realtime'
import { channelPolicy } from './realtimeChannels'
import { currentUser } from './session'
import { createTelemetry } from './telemetry'
import { createUploads } from './uploads'

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
    const database = resources.adopt(openDatabase(databaseFile()), (db) => {
      db.$client.close()
    })
    // better-sqlite3 transactions are synchronous and Better Auth's are not, so the adapter's `transaction` option stays off.
    const auth = createAuth(drizzleAdapter(database, { provider: 'sqlite', schema: authSchema }))
    const realtime = resources.adopt(
      createRealtime(async (request) => {
        const user = await currentUser(request)
        return user ? { id: user.id, info: { name: user.name } } : undefined
      }, channelPolicy),
      (instance) => instance.close(),
    )
    const uploads = resources.adopt(
      createUploads({
        owner: async (request) => (await currentUser(request))?.id,
        complete: (owner, finished) => {
          database
            .insert(upload)
            .values({ id: finished.id, ownerId: owner, filename: finished.metadata?.filename ?? '', size: finished.size ?? 0 })
            .onConflictDoNothing()
            .run()
          realtime.publish(`user:${owner}`, { type: 'upload.finished', id: finished.id })
        },
      }),
      (instance) => instance.close(),
    )
    return { telemetry, database, auth, realtime, uploads, close: () => resources.disposeAsync() }
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
