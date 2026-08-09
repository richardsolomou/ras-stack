#!/usr/bin/env node
import { checkRepositoryPolicy, syncRepositoryPolicy } from './index.js'

const command = process.argv[2]
if (command !== 'check' && command !== 'sync') {
  console.error('usage: ras-stack-policy <check|sync>')
  process.exitCode = 2
} else {
  const changed = command === 'check' ? await checkRepositoryPolicy(process.cwd()) : await syncRepositoryPolicy(process.cwd(), 'write')
  if (command === 'check' && changed.length > 0) {
    for (const message of changed) console.error(message)
    console.error('run ras-stack-policy sync and commit the result')
    process.exitCode = 1
  } else if (command === 'sync') {
    for (const path of changed) console.log(`updated ${path}`)
  }
}
