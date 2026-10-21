import { lstat, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exists, readJson, writeAtomic } from './files.js'
import { environmentMarker, writeEnvironment } from './environment.js'
import type { RasConfig } from './model.js'
import { installationPlan } from './plan.js'
import type { InstallationPlan } from './plan.js'
import { hookMarker, pnpmHook } from './pnpm.js'
import { runPnpm } from './process.js'

export async function loadPlan(root: string): Promise<InstallationPlan> {
  const config = (await import(`${pathToFileURL(join(root, 'ras.config.ts')).href}?load=${Date.now()}`)) as { default: RasConfig }
  return installationPlan(config.default)
}

async function checkConsumer(root: string, plan: InstallationPlan): Promise<string> {
  const manifest = await readJson<{
    name?: string
    packageManager?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }>(join(root, 'package.json'))
  if (!manifest.name || manifest.name === 'ras-stack') throw new Error('The consuming package needs a unique name in package.json')
  if (manifest.packageManager && !/^pnpm@(?:1[1-9]|[2-9]\d)\./.test(manifest.packageManager))
    throw new Error('Managed integrations require pnpm 11 or newer')
  if (!manifest.dependencies?.['ras-stack'] && !manifest.devDependencies?.['ras-stack'])
    throw new Error('Install ras-stack in this package before selecting managed integrations')
  for (const name of Object.keys(plan.dependencies)) {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const) {
      if (Object.hasOwn(manifest[field] ?? {}, name)) throw new Error(`${name} is declared in ${field}; remove it before RAS can own it`)
    }
  }
  await Promise.all(
    ['.ras', 'node_modules', 'pnpm-lock.yaml', '.pnpmfile.cjs'].map(async (name) => {
      if ((await exists(join(root, name))) && (await lstat(join(root, name))).isSymbolicLink())
        throw new Error(`${name} must not be a symbolic link`)
    }),
  )
  if (await exists(join(root, '.pnpmfile.mjs')))
    throw new Error('Managed installation requires exclusive ownership of the pnpm hook; remove .pnpmfile.mjs before adopting RAS')
  if ((await exists(join(root, '.ras'))) && (await optionalFile(join(root, '.ras/.gitignore'))) !== environmentMarker)
    throw new Error('Refusing to replace a consumer-owned .ras directory')
  if (!(await exists(join(root, 'pnpm-workspace.yaml')))) {
    let parent = dirname(root)
    while (parent !== dirname(parent)) {
      // oxlint-disable-next-line no-await-in-loop -- Walk ancestors in order.
      if (await exists(join(parent, 'pnpm-workspace.yaml'))) throw new Error('Run managed commands from the pnpm workspace root')
      parent = dirname(parent)
    }
  }
  const hook = await optionalFile(join(root, '.pnpmfile.cjs'))
  if (hook && !hook.startsWith(hookMarker)) throw new Error('Refusing to replace a consumer-owned .pnpmfile.cjs')
  return manifest.name
}

async function optionalFile(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export async function installManaged(
  root: string,
  plan: InstallationPlan,
  options: { frozen?: boolean; update?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  if (options.frozen && options.update) throw new Error('--frozen-lockfile and --update cannot be combined')
  const guard = join(root, '.ras-install.lock')
  await mkdir(guard).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new Error(`Another RAS install owns ${guard}; remove it only if that process has stopped`)
    throw error
  })
  try {
    const name = await checkConsumer(root, plan)
    const hook = pnpmHook(plan, name)
    if (options.frozen) {
      if ((await optionalFile(join(root, '.pnpmfile.cjs'))) !== hook || !(await exists(join(root, 'pnpm-lock.yaml'))))
        throw new Error('Managed installation is missing or outdated; run ras install and commit .pnpmfile.cjs and pnpm-lock.yaml')
    } else await writeAtomic(join(root, '.pnpmfile.cjs'), hook)
    await runPnpm(
      [
        'install',
        options.frozen ? '--frozen-lockfile' : '--no-frozen-lockfile',
        '--config.confirmModulesPurge=false',
        ...(options.update ? ['--force'] : []),
      ],
      root,
      options.signal,
    )
    await verifyInstalled(root, plan)
    await writeEnvironment(join(root, '.ras'), plan)
  } finally {
    await rm(guard, { recursive: true, force: true })
  }
}

export async function preparedPlan(root: string): Promise<InstallationPlan> {
  if (await exists(join(root, '.ras-install.lock'))) throw new Error('A RAS install is in progress')
  const plan = await loadPlan(root)
  const name = await checkConsumer(root, plan)
  if ((await optionalFile(join(root, '.pnpmfile.cjs'))) !== pnpmHook(plan, name))
    throw new Error('Managed dependencies are outdated; run ras install')
  await verifyInstalled(root, plan)
  await writeEnvironment(join(root, '.ras'), plan)
  return plan
}

async function verifyInstalled(root: string, plan: InstallationPlan): Promise<void> {
  await Promise.all(
    Object.entries(plan.dependencies).map(async ([name, version]) => {
      const installed = await readJson<{ version: string }>(join(root, 'node_modules', name, 'package.json')).catch(() => undefined)
      if (installed?.version !== version) throw new Error(`Managed ${name}@${version} is not installed; run ras install --update`)
    }),
  )
}
