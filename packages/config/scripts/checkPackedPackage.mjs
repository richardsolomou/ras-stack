import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const consumer = mkdtempSync(join(tmpdir(), 'ras-config-'))
try {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (manifest.dependencies || manifest.peerDependencies || manifest.bin)
    throw new Error('Configuration must not install runtime dependencies or commands')
  const archive = join(consumer, 'config.tgz')
  execFileSync('pnpm', ['pack', '--out', archive], { cwd: root, stdio: 'inherit' })
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: {
        'ras-stack-config': `file:${archive}`,
        ...Object.fromEntries(Object.entries(manifest.devDependencies).filter(([name]) => name !== 'ras-stack-config')),
      },
    }),
  )
  cpSync(join(root, 'test/consumer'), consumer, { recursive: true })
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: consumer, stdio: 'inherit' })
  for (const file of ['tsconfig.json', 'tsconfig-bundler.json', 'tsconfig-node-bundler.json', 'tsconfig-library.json']) {
    execFileSync('npx', ['tsc', '-p', file], { cwd: consumer, stdio: 'inherit' })
  }
  for (const name of ['oxlint', 'oxlint/application', 'oxlint/tanstack', 'oxlint/domain', 'oxlint/layers']) {
    const config = join(consumer, 'node_modules/ras-stack-config/config', `${name}.json`)
    execFileSync('npx', ['oxlint', '--config', config, '--print-config'], { cwd: consumer, stdio: 'pipe' })
  }
  writeFileSync(join(consumer, 'invalid.ts'), 'export const value: string = undefined\n')
  writeFileSync(
    join(consumer, 'tsconfig-invalid.json'),
    JSON.stringify({ extends: 'ras-stack-config/config/typescript/bundler', compilerOptions: { noEmit: true }, include: ['invalid.ts'] }),
  )
  let rejected = false
  try {
    execFileSync('npx', ['tsc', '-p', 'tsconfig-invalid.json'], { cwd: consumer, stdio: 'pipe' })
  } catch (error) {
    if (![1, 2].includes(error.status) || !error.stdout.toString().includes('error TS2322:')) throw error
    rejected = true
  }
  if (!rejected) throw new Error('Packed configuration lost strict null checking')
} finally {
  rmSync(consumer, { recursive: true, force: true })
}
