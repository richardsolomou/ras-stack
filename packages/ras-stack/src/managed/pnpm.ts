import { parsePkgAndParentSelector } from '@pnpm/parse-overrides'
import { satisfies } from 'semver'
import { dirname, join } from 'node:path'
import { exists, readJson } from './files.js'
import { checkConsumer, loadPlan } from './install.js'
import { prepareEnvironment } from './environment.js'
import type { InstallationPlan } from './plan.js'

interface Settings {
  dir?: string
  lockfileDir?: string
  overrides?: Record<string, string>
  allowBuilds?: Record<string, boolean>
  [key: string]: unknown
}

interface Manifest {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export function createHooks(plan: InstallationPlan, consumer: string, version: string, consumerVersion?: string) {
  return {
    updateConfig(config: Settings): Settings {
      const managed: Record<string, string> = { 'ras-stack': version, ...plan.dependencies, ...plan.devDependencies }
      for (const [selector, replacement] of Object.entries(config.overrides ?? {})) {
        const { parentPkg, targetPkg } = parsePkgAndParentSelector(selector)
        if (
          parentPkg &&
          (parentPkg.name !== consumer ||
            (parentPkg.bareSpecifier !== undefined && (!consumerVersion || !satisfies(consumerVersion, parentPkg.bareSpecifier))))
        )
          continue
        const selected = managed[targetPkg.name]
        if (!selected || targetPkg.bareSpecifier === '') continue
        if (targetPkg.bareSpecifier !== undefined && !satisfies(selected, targetPkg.bareSpecifier, { includePrerelease: true })) continue
        if (replacement !== selected) throw new Error(`Consumer override conflicts with managed ${targetPkg.name}@${selected}: ${selector}`)
      }
      for (const name of plan.allowBuilds) if (config.allowBuilds?.[name] === false) throw new Error(`Consumer build policy denies ${name}`)
      const settings = { ...config, optimisticRepeatInstall: false }
      if (plan.allowBuilds.length)
        settings.allowBuilds = { ...config.allowBuilds, ...Object.fromEntries(plan.allowBuilds.map((name) => [name, true])) }
      return settings
    },
    readPackage(pkg: Manifest): Manifest {
      if (pkg.name === consumer) {
        pkg.dependencies = { ...pkg.dependencies, 'ras-stack': version, ...plan.dependencies }
        pkg.devDependencies = { ...pkg.devDependencies, ...plan.devDependencies }
      }
      return pkg
    },
  }
}

async function workspaceRoot(start = process.cwd()): Promise<string> {
  let root = start
  // oxlint-disable-next-line no-await-in-loop -- Check ancestor directories in order.
  while (!(await exists(join(root, 'pnpm-workspace.yaml')))) {
    const parent = dirname(root)
    if (parent === root) throw new Error('Run pnpm from a workspace with a RAS config dependency')
    root = parent
  }
  return root
}

const selections = new Map<string, Promise<{ plan: InstallationPlan; hooks: ReturnType<typeof createHooks> }>>()

function selection(root: string) {
  let selected = selections.get(root)
  if (!selected) {
    selected = (async () => {
      const plan = await loadPlan(root)
      const consumer = await checkConsumer(root, plan)
      const [{ version }, { version: consumerVersion }] = await Promise.all([
        readJson<{ version: string }>(new URL('../../package.json', import.meta.url)),
        readJson<{ version?: string }>(join(root, 'package.json')),
      ])
      return { plan, hooks: createHooks(plan, consumer, version, consumerVersion) }
    })()
    selections.set(root, selected)
  }
  return selected
}

export const hooks = {
  async updateConfig(config: Settings): Promise<Settings> {
    const root = await workspaceRoot(config.lockfileDir ?? config.dir)
    const { plan, hooks: selected } = await selection(root)
    const settings = selected.updateConfig(config)
    await prepareEnvironment(root, plan)
    return settings
  },
  async readPackage(pkg: Manifest): Promise<Manifest> {
    const { hooks: selected } = await selection(await workspaceRoot())
    return selected.readPackage(pkg)
  },
}
