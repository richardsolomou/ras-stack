import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
  return value
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
