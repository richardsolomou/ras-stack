#!/usr/bin/env node
import { runAssetsCli } from './build/cli.js'
import { runChangesetsCli } from './changesets/cli.js'
import { runPreviewCli } from './preview/cli.js'
import { parseRealtimeDevArguments, runRealtimeDev } from './runtime/dev.js'

const commands = {
  assets: runAssetsCli,
  changesets: runChangesetsCli,
  preview: runPreviewCli,
  realtime: (arguments_: string[]) => runRealtimeDev(parseRealtimeDevArguments(arguments_)),
} as const

export type RasCommand = keyof typeof commands

export function parseRasCommand(arguments_: string[]): { arguments: string[]; command: RasCommand } | undefined {
  const [command, ...argumentsRest] = arguments_
  if (!(command && Object.hasOwn(commands, command))) return undefined
  return { arguments: argumentsRest, command: command as RasCommand }
}

export async function runRasCli(arguments_: string[]): Promise<void> {
  const parsed = parseRasCommand(arguments_)
  if (!parsed) {
    console.error('usage: ras <assets|changesets|preview|realtime> [arguments]')
    process.exitCode = 2
    return
  }
  try {
    await commands[parsed.command](parsed.arguments)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (import.meta.main) await runRasCli(process.argv.slice(2))
