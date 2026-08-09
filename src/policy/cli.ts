#!/usr/bin/env node
import { syncRepositoryPolicy } from './index.js'

const command = process.argv[2]
if (command !== 'check' && command !== 'sync') {
  console.error('usage: ras-stack-policy <check|sync>')
  process.exitCode = 2
} else {
  const changed = await syncRepositoryPolicy(process.cwd(), command === 'check' ? 'check' : 'write')
  if (command === 'check' && changed.length > 0) {
    for (const path of changed) console.error(`policy drift: ${path}`)
    console.error('run ras-stack-policy sync and commit the result')
    process.exitCode = 1
  } else if (command === 'sync') {
    for (const path of changed) console.log(`updated ${path}`)
  }
}
