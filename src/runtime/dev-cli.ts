#!/usr/bin/env node
import { parseRealtimeDevArguments, runRealtimeDev } from './dev.js'

try {
  await runRealtimeDev(parseRealtimeDevArguments(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
