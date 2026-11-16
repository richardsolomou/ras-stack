#!/usr/bin/env node
import { runPreviewCli } from './preview/cli.js'

export async function runRasCli(arguments_: string[]): Promise<void> {
  const [command, ...rest] = arguments_
  if (command !== 'preview') {
    console.error('usage: ras preview <state|dokploy> [arguments]')
    process.exitCode = 2
    return
  }
  try {
    await runPreviewCli(rest)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (import.meta.main) await runRasCli(process.argv.slice(2))
