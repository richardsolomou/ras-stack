import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'ras-stack-peer-floor-'))

try {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  execFileSync('pnpm', ['pack', '--pack-destination', temporary], { cwd: root, stdio: 'inherit' })
  const archive = path.join(
    temporary,
    readdirSync(temporary).find((file) => file.endsWith('.tgz')),
  )
  const floors = {
    '@opentelemetry/api-logs': '0.221.0',
    '@opentelemetry/exporter-logs-otlp-http': '0.221.0',
    '@opentelemetry/resources': '2.10.0',
    '@opentelemetry/sdk-logs': '0.221.0',
    '@posthog/react': '1.1.0',
    '@tanstack/react-query': '5.62.8',
    '@tanstack/react-start': '1.168.10',
    'better-sqlite3': '12.0.0',
    centrifuge: '5.0.0',
    'drizzle-orm': '0.45.0',
    nodemailer: '9.0.0',
    postgres: '3.4.0',
    'posthog-js': '1.407.0',
    'posthog-node': '5.47.0',
    react: '19.0.0',
    'react-dom': '19.0.0',
    'tus-js-client': '4.0.0',
  }
  for (const [name, version] of Object.entries(floors)) {
    if (name === 'react-dom') continue
    if (!(name in manifest.peerDependencies)) throw new Error(`Peer floor lists an unknown dependency: ${name}`)
    const declared = lowerBound(manifest.peerDependencies[name])
    if (declared !== version) throw new Error(`Peer floor for ${name} is ${version}, but the declared lower bound is ${declared}`)
  }
  for (const name of Object.keys(manifest.peerDependencies)) {
    if (!(name in floors)) throw new Error(`Declared peer dependency has no floor test: ${name}`)
  }
  writeFileSync(
    path.join(temporary, 'package.json'),
    JSON.stringify({ private: true, type: 'module', dependencies: { ...floors, 'ras-stack': `file:${archive}` } }),
  )
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: temporary, stdio: 'inherit' })
  const imports = Object.keys(manifest.exports).filter((entrypoint) => !entrypoint.startsWith('./config/'))
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
