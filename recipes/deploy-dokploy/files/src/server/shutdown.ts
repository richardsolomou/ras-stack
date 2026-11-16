import type { NitroAppPlugin } from 'nitro/types'
import { closeApp } from './app'

/**
 * Closes the app's resources once Nitro has stopped accepting requests and drained the ones in flight, which it does on
 * `SIGTERM` and `SIGINT`, so no request loses its database connection mid-way.
 */
const shutdown: NitroAppPlugin = (nitro) => {
  nitro.hooks.hook('close', async () => {
    try {
      await closeApp()
    } catch (error) {
      console.error({ event: 'shutdown_failed', error })
      process.exitCode = 1
    }
  })
}

export default shutdown
