import type { NitroAppPlugin } from 'nitro/types'
import type { App } from './app'

// `app.ts`'s key. Nitro bundles plugins apart from the routes, so importing `closeApp` would load a second copy of the
// composition root and everything it imports; the instance itself is shared through `globalThis`.
const appKey = Symbol.for('app.server')

/**
 * Closes the app's resources once Nitro has stopped accepting requests and drained the ones in flight, which it does on
 * `SIGTERM` and `SIGINT`, so no request loses its database connection mid-way.
 */
const shutdown: NitroAppPlugin = (nitro) => {
  nitro.hooks.hook('close', async () => {
    try {
      await (globalThis as typeof globalThis & { [appKey]?: App })[appKey]?.close()
    } catch (error) {
      console.error({ event: 'shutdown_failed', error })
      process.exitCode = 1
    }
  })
}

export default shutdown
