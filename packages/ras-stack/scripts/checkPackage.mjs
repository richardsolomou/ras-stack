import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const bin = (name) => path.join(root, 'node_modules/.bin', name)
const consumer = mkdtempSync(path.join(tmpdir(), 'ras-package-'))
const installed = path.join(consumer, 'node_modules/ras-stack')

try {
  const archive = path.join(consumer, 'ras-stack.tgz')
  execFileSync('pnpm', ['pack', '--out', archive], { cwd: root, stdio: 'inherit' })
  execFileSync('tar', ['-xzf', archive, '-C', consumer])
  mkdirSync(path.dirname(installed), { recursive: true })
  // The package has no dependencies, so unpacking it is the whole install.
  renameSync(path.join(consumer, 'package'), installed)
  writeFileSync(path.join(consumer, 'package.json'), '{ "type": "module" }\n')

  writeFileSync(path.join(consumer, 'index.ts'), 'export const value = 1\n')
  for (const preset of readdirSync(path.join(installed, 'config/typescript'))) {
    // The consumer installs no type packages, so it clears the preset's `types` and compiles only the extends chain and options.
    const tsconfig = {
      extends: `./node_modules/ras-stack/config/typescript/${preset}`,
      compilerOptions: { types: [] },
      files: ['index.ts'],
    }
    writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify(tsconfig))
    execFileSync(bin('tsc'), ['--noEmit', '-p', consumer], { stdio: 'inherit' })
  }

  for (const preset of readdirSync(path.join(installed, 'config/oxlint'))) {
    writeFileSync(path.join(consumer, '.oxlintrc.json'), JSON.stringify({ extends: [`./node_modules/ras-stack/config/oxlint/${preset}`] }))
    execFileSync(bin('oxlint'), ['--deny-warnings', 'index.ts'], { cwd: consumer, stdio: 'inherit' })
  }

  const exported = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', "console.log(Object.keys(await import('ras-stack/preview/dokploy')).sort().join(','))"],
    { cwd: consumer, encoding: 'utf8' },
  )
  assert.equal(exported.trim(), 'DokployClient,dokployPreviewFromEnvironment,loadPreviewAppSecrets,pullRequestNumber')

  const preview = spawnSync(process.execPath, [path.join(installed, 'dist/cli.js'), 'preview', 'queued'], {
    cwd: consumer,
    encoding: 'utf8',
  })
  assert.equal(preview.status, 1)
  assert.match(preview.stderr, /preview state must be/)

  console.log('Packed ras-stack resolves its presets, preview export, and ras preview')
} finally {
  rmSync(consumer, { recursive: true, force: true })
}
