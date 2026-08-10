import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'ras-stack-package-'))
const serverOnly = mkdtempSync(path.join(tmpdir(), 'ras-stack-posthog-server-'))

try {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  exec('pnpm', ['pack', '--pack-destination', temporary], root)
  const archive = path.join(
    temporary,
    readdirSync(temporary).find((file) => file.endsWith('.tgz')),
  )

  writeFileSync(
    path.join(temporary, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: {
        '@posthog/react': packageJson.devDependencies['@posthog/react'],
        '@tanstack/react-query': packageJson.devDependencies['@tanstack/react-query'],
        '@tanstack/react-start': packageJson.devDependencies['@tanstack/react-start'],
        'better-sqlite3': packageJson.devDependencies['better-sqlite3'],
        centrifuge: packageJson.devDependencies.centrifuge,
        'drizzle-orm': packageJson.devDependencies['drizzle-orm'],
        nodemailer: packageJson.devDependencies.nodemailer,
        postgres: packageJson.devDependencies.postgres,
        'posthog-js': packageJson.devDependencies['posthog-js'],
        'posthog-node': packageJson.devDependencies['posthog-node'],
        react: packageJson.devDependencies.react,
        'ras-stack': `file:${archive}`,
        'tus-js-client': packageJson.devDependencies['tus-js-client'],
      },
      devDependencies: { vite: packageJson.devDependencies.vite },
    }),
  )
  exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], temporary)

  const imports = Object.keys(packageJson.exports).filter((entrypoint) => !entrypoint.startsWith('./config/'))
  writeFileSync(
    path.join(temporary, 'imports.mjs'),
    imports.map((entrypoint) => `await import('ras-stack/${entrypoint.slice(2)}')`).join('\n'),
  )
  exec('node', ['imports.mjs'], temporary)

  writeFileSync(
    path.join(temporary, 'browser.js'),
    "import { classifySignInFailure } from 'ras-stack/auth/client'\nimport { useAuthAction } from 'ras-stack/auth/react'\nimport { postHogBrowserHeaders, postHogBrowserOptions } from 'ras-stack/posthog/client'\nimport { PostHogIntegration } from 'ras-stack/posthog/react'\nimport { sameOriginWebSocketUrl } from 'ras-stack/realtime/client'\nimport { useConnectedRealtimeClient } from 'ras-stack/realtime/react'\nvoid classifySignInFailure\nvoid useAuthAction\nvoid postHogBrowserHeaders\nvoid postHogBrowserOptions\nvoid PostHogIntegration\nvoid sameOriginWebSocketUrl\nvoid useConnectedRealtimeClient\n",
  )
  writeFileSync(path.join(temporary, 'index.html'), '<script type="module" src="/browser.js"></script>\n')
  exec('npx', ['vite', 'build', '--outDir', 'browser-dist'], temporary)
  const browserBundle = readdirSync(path.join(temporary, 'browser-dist', 'assets'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(path.join(temporary, 'browser-dist', 'assets', file), 'utf8'))
    .join('\n')
  if (browserBundle.includes('node:crypto')) throw new Error('browser bundle contains node:crypto')

  writeFileSync(
    path.join(serverOnly, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: {
        'ras-stack': `file:${archive}`,
        typescript: packageJson.devDependencies.typescript,
      },
    }),
  )
  writeFileSync(path.join(serverOnly, 'server.ts'), "import { postHogEnvironment } from 'ras-stack/posthog'\nvoid postHogEnvironment({})\n")
  writeFileSync(
    path.join(serverOnly, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', noEmit: true, strict: true } }),
  )
  exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], serverOnly)
  if (existsSync(path.join(serverOnly, 'node_modules', 'posthog-js'))) throw new Error('server-only consumer installed posthog-js')
  exec('npx', ['tsc'], serverOnly)

  for (const definition of exportedFiles(packageJson, 'types')) assertFile(temporary, definition)
  for (const executable of Object.values(packageJson.bin)) assertFile(temporary, executable)
  for (const implementation of exportedFiles(packageJson, 'default')) {
    assertFile(temporary, implementation)
    const sourceMap = JSON.parse(readFileSync(path.join(temporary, 'node_modules', 'ras-stack', `${implementation}.map`), 'utf8'))
    if (!sourceMap.sourcesContent?.every((source) => typeof source === 'string'))
      throw new Error(`${implementation}.map omits source content`)
  }
} finally {
  rmSync(temporary, { force: true, recursive: true })
  rmSync(serverOnly, { force: true, recursive: true })
}

function exec(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

function exportedFiles(packageJson, condition) {
  return Object.values(packageJson.exports)
    .filter((value) => typeof value === 'object' && condition in value)
    .map((value) => value[condition])
}

function assertFile(consumer, relativePath) {
  readFileSync(path.join(consumer, 'node_modules', 'ras-stack', relativePath))
}
