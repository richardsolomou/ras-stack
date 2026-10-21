import { delimiter, join, resolve } from 'node:path'
import { exists } from './files.js'
import { commandPath } from './environment.js'
import { installManaged, loadPlan, preparedPlan } from './install.js'
import { runPnpm, runProcess } from './process.js'

export async function runManagedCli(command: string, arguments_: string[]): Promise<void> {
  const root = process.cwd()
  if (command === 'install') {
    if (arguments_.some((argument) => !['--frozen-lockfile', '--update'].includes(argument)))
      throw new Error('usage: ras install [--frozen-lockfile|--update]')
    const controller = new AbortController()
    const abort = () => controller.abort()
    process.once('SIGINT', abort)
    process.once('SIGTERM', abort)
    try {
      await installManaged(root, await loadPlan(root), {
        frozen: arguments_.includes('--frozen-lockfile'),
        update: arguments_.includes('--update'),
        signal: controller.signal,
      })
    } finally {
      process.off('SIGINT', abort)
      process.off('SIGTERM', abort)
    }
    return
  }
  const plan = await preparedPlan(root)
  if (command === 'prepare') {
    if (arguments_.length) throw new Error('usage: ras prepare')
    return
  }
  if (command === 'audit') {
    await runPnpm(['audit', ...arguments_], root)
    return
  }
  const env = {
    ...process.env,
    PATH: [join(root, 'node_modules/.bin'), process.env.PATH ?? ''].join(delimiter),
  }
  if (command === 'exec') {
    const [program, ...args] = arguments_[0] === '--' ? arguments_.slice(1) : arguments_
    if (!program) throw new Error('usage: ras exec [--] <program> [arguments]')
    await runProcess(program, args, root, { env })
    return
  }
  const selected = plan.commands[command]
  if (!selected) throw new Error(`No tool provides ras ${command}; select it in ras.config.ts`)
  const args = [...(selected.args ?? [])]
  if (
    command === 'typecheck' &&
    !arguments_.some((argument) => ['-p', '--project', '-b', '--build'].includes(argument) || argument.startsWith('--project='))
  ) {
    args.push('--project', (await exists(join(root, 'tsconfig.json'))) ? 'tsconfig.json' : '.ras/tsconfig.json')
  }
  if (command === 'lint' && plan.presets.oxlint.length) {
    const explicit = arguments_.some((argument) => ['-c', '--config'].includes(argument) || argument.startsWith('--config='))
    const local = await Promise.all(
      ['.oxlintrc.json', '.oxlintrc.jsonc', 'oxlint.config.ts', 'oxlint.config.mts'].map((file) => exists(join(root, file))),
    )
    if (!explicit && !local.some(Boolean))
      args.push('--config', '.ras/oxlint.json', '--ignore-pattern', 'node_modules/**', '--ignore-pattern', '.ras/**')
  }
  if (command === 'format' && arguments_.includes('--check') && args.includes('--write')) args.splice(args.indexOf('--write'), 1)
  await runProcess(process.execPath, [resolve(await commandPath(root, selected.package, selected.bin)), ...args, ...arguments_], root, {
    env,
  })
}
