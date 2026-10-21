import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const consumer = mkdtempSync(path.join(tmpdir(), 'ras-managed-package-'))
const serverOnly = mkdtempSync(path.join(tmpdir(), 'ras-managed-server-'))
const configured = mkdtempSync(path.join(tmpdir(), 'ras-configured-vite-'))
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
    "import {defineConfig,tanstackStart,spacetimeDB,betterAuth,sqlite,postgres,libsql,email,uploads,realtime,posthog,typescript,oxlint,oxfmt,vite,vitest} from 'ras-stack/config'\nexport default defineConfig({integrations:[tanstackStart,spacetimeDB,betterAuth,sqlite,postgres,libsql,email,uploads,realtime,posthog.react,posthog.server],tooling:[typescript.browser,oxlint.application,oxfmt,vite,vitest]})\n",
  )
  exec('pnpm', ['install', '--no-frozen-lockfile'])
  exec('pnpm', ['exec', 'ras', 'install'])
  assert.equal(existsSync(path.join(consumer, '.prettierignore')), false)
  writeFileSync(path.join(consumer, '.oxfmtrc.json'), json({ ignorePatterns: ['/.pnpmfile.cjs'] }))
  const hookBeforeFormatting = readFileSync(path.join(consumer, '.pnpmfile.cjs'), 'utf8')
  exec('pnpm', ['exec', 'ras', 'exec', '--', 'oxfmt', '--write', '.pnpmfile.cjs', 'ras.config.ts'])
  assert.equal(readFileSync(path.join(consumer, '.pnpmfile.cjs'), 'utf8'), hookBeforeFormatting)
  exec('pnpm', ['exec', 'ras', 'prepare'])
  writeFileSync(path.join(consumer, '.oxfmtrc.json'), json({ semi: false, ignorePatterns: ['/.pnpmfile.cjs'] }))
  exec('pnpm', ['exec', 'ras', 'exec', '--', 'oxfmt', '--write', '.pnpmfile.cjs', 'ras.config.ts'])
  assert.equal(readFileSync(path.join(consumer, '.pnpmfile.cjs'), 'utf8'), hookBeforeFormatting)
  exec('pnpm', ['exec', 'ras', 'prepare'])
  const packageJson = JSON.parse(readFileSync(path.join(consumer, 'node_modules/ras-stack/package.json'), 'utf8'))
  assert.equal(packageJson.peerDependencies, undefined)
  assert.equal(existsSync(path.join(consumer, 'node_modules/ras-stack-config')), false)
  assert.deepEqual(Object.keys(packageJson.bin), ['ras'])
  const cli = spawnSync('pnpm', ['exec', 'ras'], { cwd: consumer, encoding: 'utf8' })
  assert.equal(cli.status, 2)
  assert.ok(cli.stderr.includes('usage: ras <install|prepare|'))
  writeFileSync(
    path.join(consumer, 'imports.mjs'),
    Object.keys(packageJson.exports)
      .map((entrypoint) => `await import('ras-stack/${entrypoint.slice(2)}')`)
      .join('\n'),
  )
  exec('node', ['imports.mjs'])
  for (const entrypoint of Object.values(packageJson.exports)) {
    readFileSync(path.join(consumer, 'node_modules/ras-stack', entrypoint.types))
    const sourceMap = JSON.parse(readFileSync(path.join(consumer, 'node_modules/ras-stack', `${entrypoint.default}.map`), 'utf8'))
    assert.ok(sourceMap.sourcesContent?.every((source) => typeof source === 'string'))
  }
  writeFileSync(path.join(consumer, 'tsconfig.json'), json({ extends: './.ras/tsconfig.json', include: ['./*.ts', './*.tsx'] }))
  writeFileSync(path.join(consumer, 'index.html'), '<script type="module" src="/main.tsx"></script>\n')
  writeFileSync(
    path.join(consumer, 'main.tsx'),
    `import {createElement} from 'react'
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query'
import {Identity} from 'spacetimedb'
import {FaCheck} from 'react-icons/fa'
import {useAuthAction} from 'ras-stack/auth/react'
import {classifySignInFailure} from 'ras-stack/auth/client'
import {PostHogBetterAuthIdentity,PostHogIntegration} from 'ras-stack/posthog/react'
import {createSameOriginRealtimeClient} from 'ras-stack/realtime/client'
import {useConnectedRealtimeClient} from 'ras-stack/realtime/react'
void classifySignInFailure
void PostHogBetterAuthIdentity
void PostHogIntegration
void createSameOriginRealtimeClient
void useConnectedRealtimeClient
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
  mkdirSync(path.join(consumer, 'presets'))
  for (const [preset, source] of [
    ['tanstack', "export const value: string = 'configuration resolved'\n"],
    ['bundler', "export const indexed: Record<string, string> = { value: 'configuration resolved' }\nexport const value = indexed.value\n"],
    ['library', 'export type Configuration = { enabled?: boolean }\nexport const configuration: Configuration = {}\n'],
  ]) {
    writeFileSync(path.join(consumer, `presets/${preset}.ts`), source)
    writeFileSync(
      path.join(consumer, `presets/tsconfig-${preset}.json`),
      json({
        extends: `../node_modules/ras-stack/config/typescript/${preset}.json`,
        compilerOptions: { noEmit: true, ...(preset === 'tanstack' ? { types: ['node'] } : {}) },
        include: [`${preset}.ts`],
      }),
    )
    exec('pnpm', ['exec', 'ras', 'typecheck', '-p', `presets/tsconfig-${preset}.json`])
  }
  for (const preset of ['oxlint', 'oxlint/application', 'oxlint/tanstack', 'oxlint/domain', 'oxlint/layers'])
    execFileSync(
      'pnpm',
      ['exec', 'ras', 'exec', '--', 'oxlint', '--config', `node_modules/ras-stack/config/${preset}.json`, '--print-config'],
      { cwd: consumer, stdio: 'pipe' },
    )
  writeFileSync(path.join(consumer, 'presets/invalid.ts'), 'export const value: string = undefined\n')
  writeFileSync(
    path.join(consumer, 'presets/tsconfig-invalid.json'),
    json({
      extends: '../node_modules/ras-stack/config/typescript/bundler.json',
      compilerOptions: { noEmit: true },
      include: ['invalid.ts'],
    }),
  )
  const invalid = spawnSync('pnpm', ['exec', 'ras', 'typecheck', '-p', 'presets/tsconfig-invalid.json'], {
    cwd: consumer,
    encoding: 'utf8',
  })
  assert.notEqual(invalid.status, 0)
  assert.ok(invalid.stdout.includes('error TS2322:'))
  const browserBundle = readdirSync(path.join(consumer, 'dist/assets'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(path.join(consumer, 'dist/assets', file), 'utf8'))
    .join('\n')
  assert.equal(browserBundle.includes('node:crypto'), false)
  const manifest = JSON.parse(readFileSync(path.join(consumer, 'package.json'), 'utf8'))
  assert.deepEqual(Object.keys(manifest.dependencies), ['ras-stack', 'react-icons'])
  const before = readFileSync(path.join(consumer, 'pnpm-lock.yaml'), 'utf8')
  rmSync(path.join(consumer, 'node_modules'), { recursive: true, force: true })
  exec('pnpm', ['install', '--frozen-lockfile'])
  exec('pnpm', ['exec', 'ras', 'install', '--frozen-lockfile'])
  assert.equal(readFileSync(path.join(consumer, 'pnpm-lock.yaml'), 'utf8'), before)
  exec('pnpm', ['exec', 'ras', 'test'])
  writeFileSync(
    path.join(serverOnly, 'package.json'),
    json({
      name: 'managed-server-consumer',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.15.0',
      dependencies: { 'ras-stack': `file:${archive}` },
    }),
  )
  writeFileSync(path.join(serverOnly, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 0\n')
  writeFileSync(
    path.join(serverOnly, 'ras.config.ts'),
    "import {defineConfig,typescript,posthog} from 'ras-stack/config'\nexport default defineConfig({integrations:[posthog.server],tooling:[typescript.library]})\n",
  )
  writeFileSync(path.join(serverOnly, 'server.ts'), "import {postHogEnvironment} from 'ras-stack/posthog'\nvoid postHogEnvironment({})\n")
  writeFileSync(path.join(serverOnly, 'tsconfig.json'), json({ extends: './.ras/tsconfig.json', include: ['server.ts'] }))
  for (const args of [
    ['install', '--no-frozen-lockfile'],
    ['exec', 'ras', 'install'],
    ['exec', 'ras', 'typecheck'],
  ])
    execFileSync('pnpm', args, { cwd: serverOnly, stdio: 'inherit' })
  assert.equal(existsSync(path.join(serverOnly, 'node_modules/posthog-js')), false)
  assert.equal(existsSync(path.join(serverOnly, 'node_modules/react')), false)
  assert.equal(readFileSync(path.join(serverOnly, 'pnpm-lock.yaml'), 'utf8').includes('spacetimedb'), false)
  writeFileSync(
    path.join(configured, 'package.json'),
    json({ private: true, type: 'module', packageManager: 'pnpm@11.15.0', dependencies: { 'ras-stack': `file:${archive}` } }),
  )
  writeFileSync(path.join(configured, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 0\nallowBuilds:\n  esbuild: true\n')
  writeFileSync(
    path.join(configured, 'ras.config.ts'),
    "import {defineConfig,react,vite,tailwind} from 'ras-stack/config'\nexport default defineConfig({integrations:[react],tooling:[vite,tailwind.animations]})\n",
  )
  mkdirSync(path.join(configured, 'src'))
  writeFileSync(path.join(configured, 'index.html'), '<div id="app"></div><script type="module" src="/src/main.tsx"></script>\n')
  writeFileSync(
    path.join(configured, 'src/main.tsx'),
    "import {createRoot} from 'react-dom/client'\nimport styles from './styles.css?url'\ncreateRoot(document.getElementById('app')!).render(<><link rel=\"stylesheet\" href={styles}/><div className=\"probe\">Configured</div></>)\n",
  )
  writeFileSync(path.join(configured, 'src/styles.css'), '.probe { @apply p-4; }\n')
  for (const args of [
    ['install', '--no-frozen-lockfile'],
    ['exec', 'ras', 'install'],
    ['exec', 'ras', 'build'],
  ])
    execFileSync('pnpm', args, { cwd: configured, stdio: 'inherit' })
  assert.equal(existsSync(path.join(configured, 'vite.config.ts')), false)
  const css = readdirSync(path.join(configured, 'dist/assets'))
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(path.join(configured, 'dist/assets', file), 'utf8'))
    .join('\n')
  assert.match(css, /\.probe\{[^}]*padding:/)
  assert.equal(css.includes('@apply'), false)
} finally {
  rmSync(configured, { recursive: true, force: true })
  rmSync(serverOnly, { recursive: true, force: true })
  rmSync(consumer, { recursive: true, force: true })
}
