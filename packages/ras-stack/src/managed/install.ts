/* oxlint-disable no-await-in-loop -- Generated files and rollback steps are published in order. */
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exists, json, readJson, writeAtomic } from './files.js'
import { packageVersion, writeEnvironment } from './environment.js'
import type { RasConfig } from './model.js'
import { installationPlan, planFingerprint } from './plan.js'
import type { InstallationPlan } from './plan.js'
import { hookMarker, pnpmHook } from './pnpm.js'
import { runPnpm } from './process.js'

export async function loadPlan(root: string): Promise<InstallationPlan> {
  const config = (await import(`${pathToFileURL(join(root, 'ras.config.ts')).href}?load=${Date.now()}`)) as { default: RasConfig }
  return installationPlan(config.default)
}

async function checkConsumer(root: string, plan: InstallationPlan): Promise<void> {
  const manifest = await readJson<{
    packageManager?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }>(join(root, 'package.json'))
  if (manifest.packageManager && !/^pnpm@(?:1[1-9]|[2-9]\d)\./.test(manifest.packageManager))
    throw new Error('Managed integrations require pnpm 11 or newer')
  if (!manifest.dependencies?.['ras-stack'] && !manifest.devDependencies?.['ras-stack'])
    throw new Error('Install ras-stack in this package before selecting managed integrations')
  for (const name of Object.keys(plan.dependencies)) {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const) {
      if (Object.hasOwn(manifest[field] ?? {}, name)) throw new Error(`${name} is declared in ${field}; remove it before RAS can own it`)
    }
  }
  for (const name of ['.ras', 'node_modules', 'ras.lock', 'pnpm-lock.yaml', '.pnpmfile.cjs', '.prettierignore']) {
    if ((await exists(join(root, name))) && (await lstat(join(root, name))).isSymbolicLink())
      throw new Error(`${name} must not be a symbolic link`)
  }
  if (await exists(join(root, '.pnpmfile.mjs')))
    throw new Error(
      'Managed installation requires exclusive ownership of the pnpm hook; remove .pnpmfile.mjs or retain the existing installation mode',
    )
  if (await exists(join(root, '.ras'))) {
    const state = await readJson<{ owner?: string }>(join(root, '.ras/state.json')).catch(() => undefined)
    if (state?.owner !== 'ras-stack') throw new Error('Refusing to replace a consumer-owned .ras directory')
  }
  if (!(await exists(join(root, 'pnpm-workspace.yaml')))) {
    let parent = dirname(root)
    while (parent !== dirname(parent)) {
      if (await exists(join(parent, 'pnpm-workspace.yaml'))) throw new Error('Run managed commands from the pnpm workspace root')
      parent = dirname(parent)
    }
  }
  const hook = await optionalFile(join(root, '.pnpmfile.cjs'))
  if (hook && !hook.startsWith(hookMarker)) throw new Error('Refusing to replace a consumer-owned .pnpmfile.cjs')
}

async function optionalFile(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function hasFormatterIgnore(contents: string | undefined): boolean {
  return contents?.trimEnd().split('\n').at(-1)?.trim() === '/.pnpmfile.cjs'
}

function lockContents(plan: InstallationPlan): string {
  return json({ version: 1, fingerprint: planFingerprint(plan), plan })
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
  const backups = new Map<string, string | undefined>()
  let installing = false
  try {
    await checkConsumer(root, plan)
    for (const file of ['.pnpmfile.cjs', 'ras.lock', 'pnpm-lock.yaml', '.prettierignore'])
      backups.set(file, await optionalFile(join(root, file)))
    if (options.frozen) {
      if (
        backups.get('ras.lock') !== lockContents(plan) ||
        backups.get('.pnpmfile.cjs') !== pnpmHook(plan) ||
        !backups.get('pnpm-lock.yaml') ||
        !hasFormatterIgnore(backups.get('.prettierignore'))
      )
        throw new Error(
          'Managed lockfiles are missing or outdated; run ras install and commit ras.lock, .pnpmfile.cjs, .prettierignore, and pnpm-lock.yaml',
        )
    } else {
      await writeAtomic(join(root, '.pnpmfile.cjs'), pnpmHook(plan))
      await writeAtomic(join(root, 'ras.lock'), lockContents(plan))
      const ignored = backups.get('.prettierignore') ?? ''
      if (!hasFormatterIgnore(ignored))
        await writeAtomic(join(root, '.prettierignore'), `${ignored}${ignored && !ignored.endsWith('\n') ? '\n' : ''}/.pnpmfile.cjs\n`)
    }
    installing = true
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
    await repairManagedLinks(root, plan)
    await verifyInstalled(root, plan)
    await generateEnvironment(root, plan)
  } catch (error) {
    if (!options.frozen) {
      for (const [file, contents] of backups) {
        if (contents === undefined) await rm(join(root, file), { force: true })
        else await writeAtomic(join(root, file), contents)
      }
    }
    if (installing && backups.get('pnpm-lock.yaml')) {
      try {
        await runPnpm(['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--config.confirmModulesPurge=false'], root)
      } catch (rollbackError) {
        throw new Error(
          `RAS installation failed (${error instanceof Error ? error.message : String(error)}) and rollback failed; lockfiles were restored`,
          { cause: rollbackError },
        )
      }
    }
    throw error
  } finally {
    await rm(guard, { recursive: true, force: true })
  }
}

async function generateEnvironment(root: string, plan: InstallationPlan): Promise<void> {
  const stage = await mkdtemp(join(root, '.ras-generate-'))
  const target = join(root, '.ras')
  const backup = `${stage}-previous`
  let previous = false
  try {
    await writeEnvironment(stage, plan)
    if (await exists(target)) {
      await rename(target, backup)
      previous = true
    }
    try {
      await rename(stage, target)
    } catch (error) {
      if (previous) await rename(backup, target)
      throw error
    }
  } finally {
    await rm(stage, { recursive: true, force: true })
    await rm(backup, { recursive: true, force: true })
  }
}

export async function preparedPlan(root: string): Promise<InstallationPlan> {
  if (await exists(join(root, '.ras-install.lock'))) throw new Error('A RAS install is in progress')
  const plan = await loadPlan(root)
  await checkConsumer(root, plan)
  if (
    (await optionalFile(join(root, 'ras.lock'))) !== lockContents(plan) ||
    (await optionalFile(join(root, '.pnpmfile.cjs'))) !== pnpmHook(plan)
  )
    throw new Error('Managed dependencies are outdated; run ras install')
  await verifyInstalled(root, plan)
  const state = await readJson<{ rasVersion: string; plan: InstallationPlan }>(join(root, '.ras/state.json')).catch(() => undefined)
  if (!state || state.rasVersion !== (await packageVersion()) || planFingerprint(state.plan) !== planFingerprint(plan))
    await generateEnvironment(root, plan)
  return plan
}

async function verifyInstalled(root: string, plan: InstallationPlan): Promise<void> {
  for (const [name, version] of Object.entries(plan.dependencies)) {
    const installed = await readJson<{ version: string }>(join(root, 'node_modules', name, 'package.json')).catch(() => undefined)
    if (installed?.version !== version) throw new Error(`Managed ${name}@${version} is not installed; run ras install --frozen-lockfile`)
  }
}

async function repairManagedLinks(root: string, plan: InstallationPlan): Promise<void> {
  const packages = dirname(await realpath(join(root, 'node_modules/ras-stack')))
  for (const name of Object.keys(plan.dependencies)) {
    const destination = join(root, 'node_modules', name)
    if (await exists(destination)) continue
    const source = join(packages, name)
    await mkdir(dirname(destination), { recursive: true })
    await symlink(
      process.platform === 'win32' ? source : relative(dirname(destination), source),
      destination,
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  }
}
