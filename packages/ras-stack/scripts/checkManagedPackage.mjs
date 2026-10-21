import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const consumer = mkdtempSync(path.join(tmpdir(), 'ras-managed-package-'))
const archive = path.join(consumer, 'ras-stack.tgz')
const json = (value) => `${JSON.stringify(value, null, 2)}\n`
const exec = (command, args) => execFileSync(command, args, { cwd: consumer, stdio: 'inherit' })

try {
  execFileSync('pnpm', ['pack', '--out', archive], { cwd: root, stdio: 'inherit' })
  writeFileSync(
    path.join(consumer, 'package.json'),
    json({
      name: 'managed-package-consumer',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.15.0',
      dependencies: { 'ras-stack': `file:${archive}`, 'react-icons': '5.7.0' },
    }),
  )
  writeFileSync(
    path.join(consumer, 'pnpm-workspace.yaml'),
    'minimumReleaseAge: 0\nallowBuilds:\n  core-js: false\n  protobufjs: false\n  esbuild: true\n  unrs-resolver: true\n',
  )
  writeFileSync(
    path.join(consumer, 'ras.config.ts'),
    "import {defineConfig,tanstackQuery,spacetimeDB,typescript,oxlint,oxfmt,vite,vitest} from 'ras-stack/config'\nexport default defineConfig({integrations:[tanstackQuery,spacetimeDB],tooling:[typescript.browser,oxlint.application,oxfmt,vite,vitest]})\n",
  )
  exec('pnpm', ['install', '--no-frozen-lockfile'])
  exec('pnpm', ['exec', 'ras', 'install'])
  const hookBeforeFormatting = readFileSync(path.join(consumer, '.pnpmfile.cjs'), 'utf8')
  exec('pnpm', ['exec', 'ras', 'exec', '--', 'oxfmt', '--write', '.pnpmfile.cjs', 'ras.config.ts'])
  assert.equal(readFileSync(path.join(consumer, '.pnpmfile.cjs'), 'utf8'), hookBeforeFormatting)
  exec('pnpm', ['exec', 'ras', 'prepare'])
  writeFileSync(path.join(consumer, '.oxfmtrc.json'), json({ semi: false }))
  exec('pnpm', ['exec', 'ras', 'exec', '--', 'oxfmt', '--write', '.pnpmfile.cjs', 'ras.config.ts'])
  assert.equal(readFileSync(path.join(consumer, '.pnpmfile.cjs'), 'utf8'), hookBeforeFormatting)
  exec('pnpm', ['exec', 'ras', 'prepare'])
  writeFileSync(path.join(consumer, 'tsconfig.json'), json({ extends: './.ras/tsconfig.json', include: ['./*.ts', './*.tsx'] }))
  writeFileSync(path.join(consumer, 'index.html'), '<script type="module" src="/main.tsx"></script>\n')
  writeFileSync(
    path.join(consumer, 'main.tsx'),
    `import {createElement} from 'react'
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query'
import {Identity} from 'spacetimedb'
import {FaCheck} from 'react-icons/fa'
import {useAuthAction} from 'ras-stack/auth/react'
export function Probe(){const {busy}=useAuthAction();const query=useQuery({queryKey:['probe'],queryFn:async()=>42,initialData:42});return createElement('div',null,String(query.data)+String(busy),createElement(FaCheck))}
export const tree=createElement(QueryClientProvider,{client:new QueryClient()},createElement(Probe))
export const identity: Identity = Identity.fromString('0'.repeat(64))
`,
  )
  writeFileSync(
    path.join(consumer, 'main.test.ts'),
    `import {expect,it} from 'vitest'
import {renderToString} from 'react-dom/server'
import {tree,identity} from './main'
it('shares React across application, Query, third-party peers, and RAS hooks',()=>expect(renderToString(tree)).toContain('42false'))
it('loads the original SpacetimeDB import',()=>expect(identity.toHexString()).toBe('0'.repeat(64)))
`,
  )
  exec('pnpm', ['exec', 'ras', 'typecheck'])
  exec('pnpm', ['exec', 'ras', 'test'])
  writeFileSync(
    path.join(consumer, 'vite.config.ts'),
    `import {defineConfig} from 'vite'
// This fixture emits only browser code, so React server/client directives have no role.
export default defineConfig({build:{rollupOptions:{onwarn(warning,warn){if(warning.code==='MODULE_LEVEL_DIRECTIVE'&&warning.message.includes('use client'))return;warn(warning)}}}})
`,
  )
  exec('pnpm', ['exec', 'ras', 'build'])
  exec('pnpm', ['exec', 'ras', 'lint', 'main.tsx', 'main.test.ts'])
  const manifest = JSON.parse(readFileSync(path.join(consumer, 'package.json'), 'utf8'))
  assert.deepEqual(Object.keys(manifest.dependencies), ['ras-stack', 'react-icons'])
  const before = readFileSync(path.join(consumer, 'pnpm-lock.yaml'), 'utf8')
  rmSync(path.join(consumer, 'node_modules'), { recursive: true, force: true })
  exec('pnpm', ['install', '--frozen-lockfile'])
  exec('pnpm', ['exec', 'ras', 'install', '--frozen-lockfile'])
  assert.equal(readFileSync(path.join(consumer, 'pnpm-lock.yaml'), 'utf8'), before)
  exec('pnpm', ['exec', 'ras', 'test'])
} finally {
  rmSync(consumer, { recursive: true, force: true })
}
