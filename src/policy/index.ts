import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseDocument, stringify } from 'yaml'

const changesetsPolicy = {
  $schema: 'https://unpkg.com/@changesets/config@3.1.2/schema.json',
  changelog: '@changesets/cli/changelog',
  commit: false,
  fixed: [],
  linked: [],
  access: 'public',
  baseBranch: 'main',
  updateInternalDependencies: 'patch',
  ignore: [],
}

const dependabotPolicy = {
  version: 2,
  updates: [
    {
      'package-ecosystem': 'npm',
      directory: '/',
      schedule: { interval: 'weekly' },
      cooldown: { 'default-days': 7 },
      groups: { 'javascript-dependencies': { patterns: ['*'] } },
    },
    {
      'package-ecosystem': 'github-actions',
      directory: '/',
      schedule: { interval: 'weekly' },
      cooldown: { 'default-days': 7 },
    },
  ],
}

type PolicySelection = boolean | { overrides?: Record<string, unknown> }

export type RepositoryPolicy = {
  changesets?: PolicySelection
  dependabot?: PolicySelection
  pnpm?: false | { minimumReleaseAge?: number }
  adoption?: false | AdoptionPolicy
}

export type AdoptionPolicy = {
  minimumWorkflowRasStackVersion?: string
  node?: string
  pnpm?: string
  just?: string
  requiredReferences?: string[]
}

export type AdoptionSnapshot = {
  manifest: Record<string, unknown>
  files: Map<string, string>
}

export async function syncRepositoryPolicy(root: string, mode: 'check' | 'write') {
  const config = repositoryPolicy(await readFile(join(root, 'ras-stack.policy.json'), 'utf8'))
  const files = await renderedPolicyFiles(root, config)
  const compared = await Promise.all(
    [...files].map(async ([path, expected]) => {
      const absolute = join(root, path)
      const actual = await readFile(absolute, 'utf8').catch(() => undefined)
      if (actual === expected) return undefined
      if (mode === 'write') {
        await mkdir(dirname(absolute), { recursive: true })
        await writeFile(absolute, expected)
      }
      return path
    }),
  )
  return compared.filter((path) => path !== undefined)
}

export async function checkRepositoryPolicy(root: string) {
  const files = await syncRepositoryPolicy(root, 'check')
  const config = repositoryPolicy(await readFile(join(root, 'ras-stack.policy.json'), 'utf8'))
  return [...files.map((path) => `policy drift: ${path}`), ...(config.adoption ? await adoptionDrift(root, config.adoption) : [])]
}

export async function syncAdoptionPolicy(root: string, mode: 'check' | 'write') {
  const config = repositoryPolicy(await readFile(join(root, 'ras-stack.policy.json'), 'utf8'))
  if (!config.adoption) return []
  const files = await renderedAdoptionFiles(root, config.adoption)
  const changed = await Promise.all(
    [...files].map(async ([path, expected]) => {
      const absolute = join(root, path)
      const actual = await readFile(absolute, 'utf8')
      if (actual === expected) return undefined
      if (mode === 'write') await writeFile(absolute, expected)
      return path
    }),
  )
  return changed.filter((path) => path !== undefined)
}

export async function adoptionDrift(root: string, policy: AdoptionPolicy) {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as Record<string, unknown>
  const files = await adoptionFiles(root)
  return adoptionSnapshotDrift({ manifest, files }, policy)
}

export function adoptionSnapshotDrift(snapshot: AdoptionSnapshot, policy: AdoptionPolicy) {
  const drift: string[] = []
  const { manifest, files } = snapshot
  if (policy.node && manifest.engines && plainObject(manifest.engines) && manifest.engines.node !== policy.node) {
    drift.push(`toolchain drift: package.json engines.node must be ${policy.node}`)
  }
  if (policy.pnpm && manifest.packageManager !== `pnpm@${policy.pnpm}`) {
    drift.push(`toolchain drift: package.json packageManager must be pnpm@${policy.pnpm}`)
  }
  const rasStackVersion = dependencyVersion(manifest, 'ras-stack')

  const workflows = new Map([...files].filter(([path]) => path.startsWith('.github/') && /\.ya?ml$/.test(path)))
  for (const [path, source] of workflows) {
    if (rasStackVersion || policy.minimumWorkflowRasStackVersion) {
      for (const match of source.matchAll(/richardsolomou\/ras-stack\/[^\s'"}]+@v(\d+\.\d+\.\d+)/g)) {
        const version = match[1]
        if (version && rasStackVersion && version !== rasStackVersion) {
          drift.push(`ras-stack drift: ${path} uses v${version}, package.json uses ${rasStackVersion}`)
        } else if (
          version &&
          policy.minimumWorkflowRasStackVersion &&
          compareVersions(version, policy.minimumWorkflowRasStackVersion) < 0
        ) {
          drift.push(`ras-stack drift: ${path} uses v${version}, minimum is v${policy.minimumWorkflowRasStackVersion}`)
        }
      }
    }
  }
  if (
    policy.just &&
    ![...workflows.values()].some(
      (source) => source.includes(`just-version: '${policy.just}'`) || source.includes(`just-version: ${policy.just}`),
    )
  ) {
    drift.push(`toolchain drift: no workflow declares just-version ${policy.just}`)
  }
  for (const reference of policy.requiredReferences ?? []) {
    if (![...files.values()].some((source) => source.includes(reference))) {
      drift.push(`shared config drift: no configuration references ${reference}`)
    }
  }
  return [...new Set(drift)]
}

export async function renderedPolicyFiles(root: string, config: RepositoryPolicy) {
  const files = new Map<string, string>()
  if (config.changesets) {
    files.set('.changeset/config.json', `${JSON.stringify(selectedPolicy(changesetsPolicy, config.changesets), null, 2)}\n`)
  }
  if (config.dependabot) {
    files.set('.github/dependabot.yml', stringify(selectedPolicy(dependabotPolicy, config.dependabot), { lineWidth: 0, singleQuote: true }))
  }
  if (config.pnpm) {
    const path = join(root, 'pnpm-workspace.yaml')
    const document = parseDocument(await readFile(path, 'utf8').catch(() => ''))
    document.set('minimumReleaseAge', config.pnpm.minimumReleaseAge ?? 10_080)
    files.set('pnpm-workspace.yaml', document.toString({ lineWidth: 0 }))
  }
  return files
}

function repositoryPolicy(source: string): RepositoryPolicy {
  const value = JSON.parse(source) as unknown
  if (!plainObject(value)) throw new Error('ras-stack.policy.json must contain an object')
  for (const name of ['changesets', 'dependabot'] as const) validateSelection(name, value[name])
  const pnpm = value.pnpm
  if (pnpm !== undefined && pnpm !== false) {
    if (!plainObject(pnpm)) throw new Error('pnpm policy must be false or an object')
    const age = pnpm.minimumReleaseAge
    if (age !== undefined && (typeof age !== 'number' || !Number.isInteger(age) || age < 0)) {
      throw new Error('pnpm.minimumReleaseAge must be a non-negative integer')
    }
  }
  const adoption = value.adoption
  if (adoption !== undefined && adoption !== false) {
    if (!plainObject(adoption)) throw new Error('adoption policy must be false or an object')
    for (const key of ['minimumWorkflowRasStackVersion', 'node', 'pnpm', 'just']) {
      if (adoption[key] !== undefined && typeof adoption[key] !== 'string') throw new Error(`adoption.${key} must be a string`)
    }
    if (adoption.requiredReferences !== undefined && !stringArray(adoption.requiredReferences)) {
      throw new Error('adoption.requiredReferences must be an array of strings')
    }
  }
  return value
}

function dependencyVersion(manifest: Record<string, unknown>, name: string) {
  for (const field of ['dependencies', 'devDependencies']) {
    const dependencies = manifest[field]
    const value = plainObject(dependencies) ? dependencies[name] : undefined
    if (typeof value === 'string') return /\d+\.\d+\.\d+/.exec(value)?.[0]
  }
  return undefined
}

function compareVersions(left: string, right: string) {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return 0
}

async function textFiles(directory: string, root = directory): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const results = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return textFiles(path, root)
      if (/\.ya?ml$/.test(entry.name)) return new Map([[path.slice(root.length + 1), await readFile(path, 'utf8')]])
      return new Map<string, string>()
    }),
  )
  for (const result of results) {
    for (const [path, source] of result) files.set(path, source)
  }
  return files
}

async function adoptionFiles(root: string) {
  const files = await textFiles(join(root, '.github'), root)
  const entries = await readdir(root, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile() || !/^(?:ras-stack\.policy|oxlint|tsconfig(?:\.[^.]+)*)\.json$/.test(entry.name)) return
      files.set(entry.name, await readFile(join(root, entry.name), 'utf8'))
    }),
  )
  return files
}

async function renderedAdoptionFiles(root: string, policy: AdoptionPolicy) {
  const files = new Map<string, string>()
  const manifestPath = join(root, 'package.json')
  const manifestSource = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestSource) as Record<string, unknown>
  if (policy.node) {
    const engines = plainObject(manifest.engines) ? manifest.engines : {}
    manifest.engines = { ...engines, node: policy.node }
  }
  if (policy.pnpm) manifest.packageManager = `pnpm@${policy.pnpm}`
  const renderedManifest = `${JSON.stringify(manifest, null, 2)}\n`
  if (renderedManifest !== manifestSource) files.set('package.json', renderedManifest)

  const workflowVersion = dependencyVersion(manifest, 'ras-stack')
  const workflows = await textFiles(join(root, '.github'), root)
  for (const [path, source] of workflows) {
    let rendered = source
    if (workflowVersion) {
      rendered = rendered.replace(/(richardsolomou\/ras-stack\/[^\s'"}]+@v)(\d+\.\d+\.\d+)/g, `$1${workflowVersion}`)
    } else if (policy.minimumWorkflowRasStackVersion) {
      rendered = rendered.replace(/(richardsolomou\/ras-stack\/[^\s'"}]+@v)(\d+\.\d+\.\d+)/g, (reference, prefix, current) =>
        compareVersions(current, policy.minimumWorkflowRasStackVersion!) < 0
          ? `${prefix}${policy.minimumWorkflowRasStackVersion}`
          : reference,
      )
    }
    if (policy.just) {
      rendered = rendered.replace(/(just-version:\s*)(['"]?)\d+\.\d+\.\d+\2/g, `$1$2${policy.just}$2`)
      rendered = rendered.replace(
        /(richardsolomou\/ras-stack\/actions\/setup-just@[^\n]+\n(?:(?!\n\s*-\s+uses:)[\s\S]){0,300}?\n\s+version:\s*)(['"]?)\d+\.\d+\.\d+\2/g,
        `$1$2${policy.just}$2`,
      )
    }
    if (rendered !== source) files.set(path, rendered)
  }
  return files
}

function validateSelection(name: string, value: unknown) {
  if (value === undefined || typeof value === 'boolean') return
  if (!plainObject(value) || (value.overrides !== undefined && !plainObject(value.overrides))) {
    throw new Error(`${name} policy must be a boolean or an object with overrides`)
  }
}

function selectedPolicy(base: Record<string, unknown>, selection: Exclude<PolicySelection, false>) {
  return selection === true ? base : deepMerge(base, selection.overrides ?? {})
}

function deepMerge(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(overrides)])].map((key) => {
      const left = base[key]
      const right = overrides[key]
      return [key, plainObject(left) && plainObject(right) ? deepMerge(left, right) : right === undefined ? left : right]
    }),
  )
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
