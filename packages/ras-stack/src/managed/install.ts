import { lstat, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exists, readJson } from './files.js'
import { environmentMarker } from './environment.js'
import { installationPlan } from './plan.js'
import type { RasConfig } from './model.js'
import type { InstallationPlan } from './plan.js'

export async function loadPlan(root: string): Promise<InstallationPlan> {
  const resolver = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'ras-stack/config') return { url: new URL('../config.js', import.meta.url).href, shortCircuit: true }
      return nextResolve(specifier, context)
    },
  })
  try {
    const config = (await import(`${pathToFileURL(join(root, 'ras.config.ts')).href}?load=${randomUUID()}`)) as { default: RasConfig }
    return installationPlan(config.default)
  } finally {
    resolver.deregister()
  }
}

export async function checkConsumer(root: string): Promise<string> {
  const manifest = await readJson<{
    name?: string
    packageManager?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }>(join(root, 'package.json'))
  if (!manifest.name || manifest.name === 'ras-stack') throw new Error('The consuming package needs a unique name in package.json')
  const manager = manifest.packageManager?.match(/^pnpm@(\d+)\.(\d+)\./)
  if (!manager || Number(manager[1]) < 11) throw new Error('Managed integrations require pnpm 11 or newer')
  await Promise.all(
    ['.ras', 'node_modules', 'pnpm-lock.yaml'].map(async (name) => {
      if ((await exists(join(root, name))) && (await lstat(join(root, name))).isSymbolicLink())
        throw new Error(`${name} must not be a symbolic link`)
    }),
  )
  if ((await exists(join(root, '.ras'))) && (await readFile(join(root, '.ras/.gitignore'), 'utf8').catch(() => '')) !== environmentMarker)
    throw new Error('Refusing to replace a consumer-owned .ras directory')
  let parent = dirname(root)
  while (parent !== dirname(parent)) {
    // oxlint-disable-next-line no-await-in-loop -- Walk ancestors in order.
    if (await exists(join(parent, 'pnpm-workspace.yaml'))) throw new Error('Run managed commands from the pnpm workspace root')
    parent = dirname(parent)
  }
  return manifest.name
}

export async function preparedPlan(root: string): Promise<InstallationPlan> {
  const plan = await loadPlan(root)
  await checkConsumer(root)
  await Promise.all(
    Object.entries({ ...plan.dependencies, ...plan.devDependencies }).map(async ([name, version]) => {
      const installed = await readJson<{ version: string }>(join(root, 'node_modules', name, 'package.json')).catch(() => undefined)
      if (installed?.version !== version) throw new Error(`Managed ${name}@${version} is not installed; run ras sync`)
    }),
  )
  return plan
}
