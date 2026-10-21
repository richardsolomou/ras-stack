import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { checkConsumer, loadPlan } from './install.js'
import { writeEnvironment } from './environment.js'
import { exists } from './files.js'
import type { InstallationPlan } from './plan.js'

interface Settings {
  lockfileDir?: string
  dir?: string
  overrides?: Record<string, string>
  allowBuilds?: Record<string, boolean>
  [key: string]: unknown
}
interface Manifest {
  name?: string
  version?: string
  dependencies?: Record<string, string>
}

export function createHooks(plan: InstallationPlan, consumer: string, version: string) {
  return {
    updateConfig(config: Settings): Settings {
      for (const [name, selected] of Object.entries({ 'ras-stack': version, ...plan.dependencies })) {
        if (config.overrides?.[name] && config.overrides[name] !== selected)
          throw new Error(`Consumer override conflicts with managed ${name}`)
      }
      for (const name of plan.allowBuilds) {
        if (config.allowBuilds?.[name] === false) throw new Error(`Consumer build policy denies ${name}`)
      }
      return {
        ...config,
        allowBuilds: {
          ...Object.fromEntries(Object.keys(plan.dependencies).map((name) => [name, false])),
          ...config.allowBuilds,
          ...Object.fromEntries(plan.allowBuilds.map((name) => [name, true])),
        },
      }
    },
    readPackage(pkg: Manifest): Manifest {
      if (pkg.name === consumer) pkg.dependencies = { ...pkg.dependencies, 'ras-stack': version, ...plan.dependencies }
      else if (pkg.name === 'ras-stack' && pkg.version === version) pkg.dependencies = { ...pkg.dependencies, ...plan.dependencies }
      return pkg
    },
  }
}

const selections = new Map<string, Promise<{ plan: InstallationPlan; hooks: ReturnType<typeof createHooks> }>>()

function selection(root: string) {
  let selected = selections.get(root)
  if (!selected) {
    selected = (async () => {
      const plan = await loadPlan(root)
      const consumer = await checkConsumer(root, plan)
      const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
      return { plan, hooks: createHooks(plan, consumer, version) }
    })()
    selections.set(root, selected)
  }
  return selected
}

async function workspaceRoot(): Promise<string> {
  let root = process.cwd()
  // oxlint-disable-next-line no-await-in-loop -- Find the nearest workspace before loading its selections.
  while (!(await exists(join(root, 'pnpm-workspace.yaml')))) {
    const parent = dirname(root)
    if (parent === root) throw new Error('Run pnpm from a workspace with a RAS config dependency')
    root = parent
  }
  return root
}

export const hooks = {
  async updateConfig(config: Settings): Promise<Settings> {
    const root = config.lockfileDir ?? config.dir
    if (!root) throw new Error('pnpm did not provide the workspace directory')
    const { plan, hooks: selected } = await selection(root)
    const settings = selected.updateConfig(config)
    await writeEnvironment(join(root, '.ras'), plan)
    return settings
  },
  async readPackage(pkg: Manifest): Promise<Manifest> {
    const { hooks: selected } = await selection(await workspaceRoot())
    return selected.readPackage(pkg)
  },
}
