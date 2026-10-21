#!/usr/bin/env node
import { runAssetsCli } from './build/cli.js'
import { runChangesetsCli } from './changesets/cli.js'
import { runManagedCli } from './managed/cli.js'
import { runPreviewCli } from './preview/cli.js'
import { parseRealtimeDevArguments, runRealtimeDev } from './runtime/dev.js'

const commands = {
  typecheck: (arguments_: string[]) => runManagedCli('typecheck', arguments_),
  lint: (arguments_: string[]) => runManagedCli('lint', arguments_),
  format: (arguments_: string[]) => runManagedCli('format', arguments_),
  dev: (arguments_: string[]) => runManagedCli('dev', arguments_),
  build: (arguments_: string[]) => runManagedCli('build', arguments_),
  test: (arguments_: string[]) => runManagedCli('test', arguments_),
  e2e: (arguments_: string[]) => runManagedCli('e2e', arguments_),
  exec: (arguments_: string[]) => runManagedCli('exec', arguments_),
  audit: (arguments_: string[]) => runManagedCli('audit', arguments_),
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
    console.error('usage: ras <typecheck|lint|format|dev|build|test|e2e|exec|audit|assets|changesets|preview|realtime> [arguments]')
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
