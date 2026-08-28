import { checkRepositoryPolicy, syncRepositoryPolicy } from './index.js'

export async function runPolicyCli(arguments_: string[]): Promise<void> {
  const [command, extra] = arguments_
  // `adoption` used to be a second argument. Failing beats quietly running a repository sync somebody did not ask for.
  if ((command !== 'check' && command !== 'sync') || extra !== undefined) {
    console.error('usage: ras policy <check|sync>')
    process.exitCode = 2
    return
  }

  const changed = command === 'check' ? await checkRepositoryPolicy(process.cwd()) : await syncRepositoryPolicy(process.cwd(), 'write')
  if (command === 'check' && changed.length > 0) {
    for (const message of changed) console.error(message)
    console.error('run ras policy sync and commit the result')
    process.exitCode = 1
  } else if (command === 'sync') {
    for (const path of changed) console.log(`updated ${path}`)
  }
}
