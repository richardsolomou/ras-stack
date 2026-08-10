import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fleetConfig, fleetMarkdown, inspectFleet } from './fleet.js'
import { checkRepositoryPolicy, syncAdoptionPolicy, syncRepositoryPolicy } from './index.js'

export async function runPolicyCli(arguments_: string[]): Promise<void> {
  const [command, argument] = arguments_
  if (command !== 'check' && command !== 'sync' && command !== 'fleet') {
    console.error('usage: ras policy <check|sync|fleet> [adoption]')
    process.exitCode = 2
    return
  }

  if (command === 'fleet') {
    const path = resolve(argument ?? 'ras-stack.fleet.json')
    const config = fleetConfig(JSON.parse(await readFile(path, 'utf8')))
    const results = await inspectFleet(config)
    process.stdout.write(fleetMarkdown(results))
    if (results.some((result) => result.drift.length > 0)) process.exitCode = 1
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
