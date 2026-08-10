import { checkRepositoryPolicy, syncAdoptionPolicy, syncRepositoryPolicy } from './index.js'

export async function runPolicyCli(arguments_: string[]): Promise<void> {
  const [command, argument] = arguments_
  if (command !== 'check' && command !== 'sync') {
    console.error('usage: ras policy <check|sync> [adoption]')
    process.exitCode = 2
    return
  }

  const adoption = argument === 'adoption'
  const changed = adoption
    ? await syncAdoptionPolicy(process.cwd(), command === 'check' ? 'check' : 'write')
    : command === 'check'
      ? await checkRepositoryPolicy(process.cwd())
      : await syncRepositoryPolicy(process.cwd(), 'write')
  if (command === 'check' && changed.length > 0) {
    for (const message of changed) console.error(message)
    console.error(`run ras policy sync${adoption ? ' adoption' : ''} and commit the result`)
    process.exitCode = 1
  } else if (command === 'sync') {
    for (const path of changed) console.log(`updated ${path}`)
  }
}
