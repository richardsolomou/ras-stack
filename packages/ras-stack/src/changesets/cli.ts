import { checkChangesets } from './index.js'

export async function runChangesetsCli(arguments_: string[]): Promise<void> {
  if (arguments_.length !== 1 || arguments_[0] !== 'check') {
    console.error('usage: ras changesets check')
    process.exitCode = 2
    return
  }
  const errors = await checkChangesets(process.cwd())
  for (const message of errors) console.error(message)
  if (errors.length > 0) process.exitCode = 1
}
