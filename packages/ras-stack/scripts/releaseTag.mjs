import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const file = 'packages/ras-stack/package.json'
const current = JSON.parse(readFileSync(file, 'utf8')).version
let previous
try {
  previous = JSON.parse(execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).version
} catch {
  previous = undefined
}
if (current === previous) throw new Error('Versioning did not change ras-stack')
if (!/^\d+\.\d+\.\d+$/.test(current)) throw new Error(`Unsupported release version: ${current}`)
process.stdout.write(`v${current}\n`)
