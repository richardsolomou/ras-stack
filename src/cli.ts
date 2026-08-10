#!/usr/bin/env node
import { runAssetsCli } from './build/cli.js'
import { runPolicyCli } from './policy/cli.js'
import { runPreviewCli } from './preview/cli.js'
import { runRealtimeCli } from './runtime/dev-cli.js'

const commands = {
  assets: runAssetsCli,
  policy: runPolicyCli,
  preview: runPreviewCli,
  realtime: runRealtimeCli,
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
    console.error('usage: ras <assets|policy|preview|realtime> [arguments]')
    process.exitCode = 2
    return
  }
  await commands[parsed.command](parsed.arguments)
}

if (import.meta.main) await runRasCli(process.argv.slice(2))
