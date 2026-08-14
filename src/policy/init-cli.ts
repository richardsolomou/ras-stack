import confirm from '@inquirer/confirm'
import select from '@inquirer/select'
import { applyRepositoryInit, INIT_STEPS, planRepositoryInit, type InitStepName, type PlannedFile, type TypeScriptPreset } from './init.js'

const PRESETS: readonly TypeScriptPreset[] = ['library', 'bundler', 'node-bundler', 'browser', 'tanstack']

export type InitPrompts = {
  confirm: (options: { message: string; default: boolean }) => Promise<boolean>
  select: (options: { message: string; choices: readonly TypeScriptPreset[] }) => Promise<TypeScriptPreset>
}

const consolePrompts: InitPrompts = {
  confirm: (options) => confirm(options),
  select: (options) => select({ message: options.message, choices: options.choices.map((value) => ({ value })) }),
}

export async function runInitCli(arguments_: string[], prompts: InitPrompts = consolePrompts): Promise<void> {
  const unknown = arguments_.find((argument) => argument !== '--yes' && argument !== '--dry-run')
  if (unknown) {
    console.error('usage: ras init [--yes] [--dry-run]')
    process.exitCode = 2
    return
  }
  const accepted = arguments_.includes('--yes')
  const dryRun = arguments_.includes('--dry-run')
  if (!accepted && prompts === consolePrompts && !process.stdin.isTTY) {
    console.error('ras init asks questions and needs a terminal. Pass --yes to accept every step instead.')
    process.exitCode = 2
    return
  }

  try {
    const steps: InitStepName[] = []
    let preset: TypeScriptPreset = 'library'
    for (const step of INIT_STEPS) {
      // Each step is offered in turn so a repository can adopt one part without the rest.
      // oxlint-disable-next-line no-await-in-loop
      if (!accepted && !(await prompts.confirm({ message: `${step.title}? (${step.detail})`, default: true }))) continue
      steps.push(step.name)
      // oxlint-disable-next-line no-await-in-loop
      if (step.name === 'typescript' && !accepted) preset = await prompts.select({ message: 'TypeScript preset', choices: PRESETS })
    }
    if (steps.length === 0) {
      console.log('Nothing selected.')
      return
    }

    const planned = await planRepositoryInit(process.cwd(), { steps, typescriptPreset: preset })
    const writable = accepted ? planned : await confirmOverwrites(prompts, planned)

    if (dryRun) {
      for (const file of writable) console.log(`${file.existing === undefined ? 'create' : 'replace'} ${file.path}`)
      console.log('Nothing written because --dry-run was requested.')
      return
    }

    for (const path of await applyRepositoryInit(process.cwd(), writable)) console.log(`wrote ${path}`)
    if (steps.includes('policy')) console.log('Run ras policy check to confirm the generated files stay in step.')
  } catch (error) {
    // Ctrl-C during a question is a decision to stop, not a crash worth a stack trace.
    if ((error as { name?: string }).name !== 'ExitPromptError') throw error
    console.error('Nothing written.')
    process.exitCode = 130
  }
}

async function confirmOverwrites(prompts: InitPrompts, planned: readonly PlannedFile[]) {
  const writable: PlannedFile[] = []
  for (const file of planned) {
    if (file.existing === undefined || file.existing === file.contents) {
      writable.push(file)
      continue
    }
    // Replacing is the destructive branch, so it is asked one file at a time and defaults to keeping what is there.
    // oxlint-disable-next-line no-await-in-loop
    if (await prompts.confirm({ message: `${file.path} already exists. Replace it?`, default: false })) writable.push(file)
  }
  return writable
}
