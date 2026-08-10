import { parseRealtimeDevArguments, runRealtimeDev } from './dev.js'

export async function runRealtimeCli(arguments_: string[]): Promise<void> {
  try {
    await runRealtimeDev(parseRealtimeDevArguments(arguments_))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
