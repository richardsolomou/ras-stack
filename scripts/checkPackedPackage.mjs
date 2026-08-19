import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'ras-stack-package-'))
const serverOnly = mkdtempSync(path.join(tmpdir(), 'ras-stack-posthog-server-'))

try {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const archive = path.join(temporary, 'ras-stack.tgz')
  const createArchive = path.join(temporary, 'create-ras-app.tgz')
  exec('pnpm', ['pack', '--out', archive], root)
  exec('pnpm', ['pack', '--out', createArchive], path.join(root, 'packages/create-ras-app'))

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
        'create-ras-app': `file:${createArchive}`,
        'ras-stack': `file:${archive}`,
        'tus-js-client': packageJson.devDependencies['tus-js-client'],
      },
      devDependencies: { vite: packageJson.devDependencies.vite },
    }),
  )
  exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], temporary)

  if (JSON.stringify(Object.keys(packageJson.bin)) !== JSON.stringify(['ras']))
    throw new Error('package must install only the ras executable')
  const createPackage = JSON.parse(readFileSync(path.join(temporary, 'node_modules/create-ras-app/package.json'), 'utf8'))
  if (createPackage.version !== packageJson.version) throw new Error('packed create-ras-app is not versioned with ras-stack')
  if (createPackage.dependencies['ras-stack'] !== `^${packageJson.version}`)
    throw new Error('create-ras-app does not target its matching ras-stack version')
  if (JSON.stringify(createPackage.bin) !== JSON.stringify({ 'create-ras-app': './cli.js' }))
    throw new Error('create-ras-app must install only its named executable')
  const dlxDirectory = path.join(temporary, 'dlx-starter')
  exec(
    'pnpm',
    ['--silent', 'dlx', '--package', archive, '--package', createArchive, 'create-ras-app', dlxDirectory, '--dry-run'],
    temporary,
  )
  if (existsSync(dlxDirectory)) throw new Error('pnpm dlx create-ras-app did not forward --dry-run')
  const cli = spawnSync('npx', ['ras'], { cwd: temporary, encoding: 'utf8' })
  if (cli.status !== 2 || !cli.stderr.includes('usage: ras <assets|create|init|policy|preview|realtime>'))
    throw new Error(`installed ras executable returned an unexpected result: ${cli.status}\n${cli.stderr}`)

  const createUsage = spawnSync('npx', ['create-ras-app'], { cwd: temporary, encoding: 'utf8' })
  if (createUsage.status !== 2 || !createUsage.stderr.includes('usage: ras create <directory> [--dry-run]'))
    throw new Error(`installed create-ras-app executable returned an unexpected result: ${createUsage.status}\n${createUsage.stderr}`)
  const dryRunDirectory = path.join(temporary, 'dry-run-starter')
  const dryRun = spawnSync('npx', ['create-ras-app', dryRunDirectory, '--dry-run'], { cwd: temporary, encoding: 'utf8' })
  if (dryRun.status !== 0 || dryRun.stdout.trim() !== dryRunDirectory || existsSync(dryRunDirectory))
    throw new Error(`create-ras-app did not forward --dry-run: ${dryRun.status}\n${dryRun.stdout}\n${dryRun.stderr}`)

  exec('npx', ['create-ras-app', 'starter'], temporary)
  const starterDirectory = path.join(temporary, 'starter')
  const occupied = spawnSync('npx', ['create-ras-app', 'starter'], { cwd: temporary, encoding: 'utf8' })
  if (occupied.status === 0 || !occupied.stderr.includes('Destination must be an empty directory'))
    throw new Error(`create-ras-app swallowed a scaffold failure: ${occupied.status}\n${occupied.stderr}`)
  const starterFile = path.join(starterDirectory, 'package.json')
  const starter = JSON.parse(readFileSync(starterFile, 'utf8'))
  if (starter.dependencies['ras-stack'] !== `^${packageJson.version}`)
    throw new Error('installed starter does not target the packed version')
  const gitignore = readFileSync(path.join(starterDirectory, '.gitignore'), 'utf8')
  if (!gitignore.includes('.data/')) throw new Error('installed starter is missing generated-state ignores')
  assertEnvironmentIgnores(gitignore, '.gitignore')
  assertEnvironmentIgnores(readFileSync(path.join(starterDirectory, '.dockerignore'), 'utf8'), '.dockerignore')
  const workspace = readFileSync(path.join(starterDirectory, 'pnpm-workspace.yaml'), 'utf8')
  if (!workspace.includes('  - ras-stack')) throw new Error('installed starter can age-gate its newly published ras-stack version')
  if (!workspace.includes('  - create-ras-app')) throw new Error('installed starter can age-gate a newly published create-ras-app version')
  const dockerfile = readFileSync(path.join(starterDirectory, 'Dockerfile'), 'utf8')
  if (dockerfile.includes('../../') || dockerfile.includes('examples/full-stack') || dockerfile.includes('COPY dist '))
    throw new Error('installed starter Dockerfile still depends on the ras-stack monorepo')
  const starterArchive = path.join(starterDirectory, 'ras-stack.tgz')
  copyFileSync(archive, starterArchive)
  starter.dependencies['ras-stack'] = 'file:./ras-stack.tgz'
  writeFileSync(starterFile, `${JSON.stringify(starter, null, 2)}\n`)
  exec('npm', ['install', '--no-audit', '--no-fund'], starterDirectory)
  exec('npm', ['run', 'build'], starterDirectory)
  if (process.env.CI || process.env.RAS_STACK_PACKAGE_CHECK_DOCKER === '1') {
    exec('docker', ['build', '--target', 'build', '-t', 'ras-stack-packed-starter:test', '.'], starterDirectory)
  }

  const imports = Object.keys(packageJson.exports).filter((entrypoint) => !entrypoint.startsWith('./config/'))
  writeFileSync(
    path.join(temporary, 'imports.mjs'),
    imports.map((entrypoint) => `await import('ras-stack/${entrypoint.slice(2)}')`).join('\n'),
  )
  exec('node', ['imports.mjs'], temporary)

  writeFileSync(
    path.join(temporary, 'browser.js'),
    "import { classifySignInFailure } from 'ras-stack/auth/client'\nimport { useAuthAction } from 'ras-stack/auth/react'\nimport { postHogBrowserHeaders, postHogBrowserOptions } from 'ras-stack/posthog/client'\nimport { PostHogBetterAuthIdentity, PostHogIntegration } from 'ras-stack/posthog/react'\nimport { sameOriginWebSocketUrl } from 'ras-stack/realtime/client'\nimport { useConnectedRealtimeClient } from 'ras-stack/realtime/react'\nvoid classifySignInFailure\nvoid useAuthAction\nvoid postHogBrowserHeaders\nvoid postHogBrowserOptions\nvoid PostHogBetterAuthIdentity\nvoid PostHogIntegration\nvoid sameOriginWebSocketUrl\nvoid useConnectedRealtimeClient\n",
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

  assertLegacyCreateBootstrap(temporary)
  await assertCreateCancellation(temporary)
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

function assertEnvironmentIgnores(contents, filename) {
  if (!contents.includes('.env\n.env.*\n!.env.example\n'))
    throw new Error(`installed starter ${filename} does not safely exclude environment secrets`)
}

async function assertCreateCancellation(consumer) {
  const started = path.join(consumer, 'delegated-create-started')
  const completed = path.join(consumer, 'delegated-create-completed')
  const createEntrypoint = path.join(consumer, 'node_modules', 'ras-stack', 'dist', 'create', 'index.js')
  writeFileSync(
    createEntrypoint,
    "import { writeFileSync } from 'node:fs'\nexport async function runCreateCli([started, completed]) {\n  writeFileSync(started, 'started')\n  await new Promise((resolve) => setTimeout(resolve, 300))\n  writeFileSync(completed, 'completed')\n}\n",
  )
  const wrapper = path.join(consumer, 'node_modules', 'create-ras-app', 'cli.js')
  const wrapperProcess = spawn(process.execPath, [wrapper, started, completed], { stdio: 'ignore' })
  const exit = new Promise((resolve, reject) => {
    wrapperProcess.once('error', reject)
    wrapperProcess.once('exit', (status, signal) => resolve({ signal, status }))
  })
  try {
    await waitForFile(started)
    wrapperProcess.kill('SIGTERM')
    const result = await exit
    await delay(500)
    if (process.platform === 'win32' ? result.status === 0 : result.signal !== 'SIGTERM')
      throw new Error(`create-ras-app did not preserve termination: ${JSON.stringify(result)}`)
    if (existsSync(completed)) throw new Error('in-process create continued after create-ras-app was terminated')
  } finally {
    if (wrapperProcess.exitCode === null && wrapperProcess.signalCode === null) wrapperProcess.kill('SIGKILL')
  }
}

function assertLegacyCreateBootstrap(consumer) {
  const destination = path.join(consumer, 'legacy-dry-run-starter')
  const manifestFile = path.join(consumer, 'node_modules', 'ras-stack', 'package.json')
  const source = readFileSync(manifestFile, 'utf8')
  const manifest = JSON.parse(source)
  manifest.version = '0.40.0'
  delete manifest.exports['./create']
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  try {
    const result = spawnSync('npx', ['create-ras-app', destination, '--dry-run'], { cwd: consumer, encoding: 'utf8' })
    if (result.status !== 0 || result.stdout.trim() !== destination || existsSync(destination))
      throw new Error(`create-ras-app bootstrap fallback failed: ${result.status}\n${result.stdout}\n${result.stderr}`)
  } finally {
    writeFileSync(manifestFile, source)
  }
}

async function waitForFile(file, attempts = 100) {
  if (existsSync(file)) return
  if (attempts === 0) throw new Error('delegated create did not start')
  await delay(20)
  await waitForFile(file, attempts - 1)
}
