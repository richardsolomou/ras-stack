import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

for (const [file, prefix] of [
  ['packages/ras-stack/package.json', 'v'],
  ['packages/config/package.json', 'config-v'],
]) {
  const current = JSON.parse(readFileSync(file, 'utf8')).version
  let previous
  try {
    previous = JSON.parse(execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).version
  } catch {
    previous = undefined
  }
  if (current !== previous) {
    if (!/^\d+\.\d+\.\d+$/.test(current)) throw new Error(`Unsupported release version: ${current}`)
    process.stdout.write(`${prefix}${current}\n`)
    process.exit(0)
  }
}
throw new Error('Versioning did not change a publishable package')
