import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'ras-stack-peer-floor-'))

try {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const archive = path.join(temporary, 'ras-stack.tgz')
  execFileSync('pnpm', ['pack', '--out', archive], { cwd: root, stdio: 'inherit' })
  const floors = Object.fromEntries(Object.entries(manifest.peerDependencies).map(([name, range]) => [name, lowerBound(range)]))
  floors['react-dom'] = floors.react
  writeFileSync(
    path.join(temporary, 'package.json'),
    JSON.stringify({ private: true, type: 'module', dependencies: { ...floors, 'ras-stack': `file:${archive}` } }),
  )
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: temporary, stdio: 'inherit' })
  const imports = Object.keys(manifest.exports)
  writeFileSync(
    path.join(temporary, 'imports.mjs'),
    imports.map((entrypoint) => `await import('ras-stack/${entrypoint.slice(2)}')`).join('\n'),
  )
  execFileSync('node', ['imports.mjs'], { cwd: temporary, stdio: 'inherit' })
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

function lowerBound(range) {
  const match = /^(?:>=|\^)(\d+(?:\.\d+){0,2})/.exec(range)
  if (!match) throw new Error(`Unsupported peer range for floor testing: ${range}`)
  return match[1].split('.').concat('0', '0').slice(0, 3).join('.')
}
