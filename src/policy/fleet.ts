import type { AdoptionPolicy, AdoptionSnapshot } from './index.js'
import { adoptionSnapshotDrift } from './index.js'

export type FleetRepository = {
  repository: string
  ref?: string
  adoption: AdoptionPolicy
}

export type FleetConfig = {
  repositories: FleetRepository[]
}

export type FleetResult = {
  repository: string
  ref: string
  drift: string[]
}

export function fleetConfig(source: unknown): FleetConfig {
  if (!source || typeof source !== 'object' || !('repositories' in source) || !Array.isArray(source.repositories)) {
    throw new Error('fleet configuration must contain a repositories array')
  }
  if (source.repositories.length === 0 || source.repositories.length > 100) {
    throw new Error('fleet configuration must contain between 1 and 100 repositories')
  }
  for (const entry of source.repositories) {
    if (!entry || typeof entry !== 'object') throw new Error('each fleet repository must be an object')
    if (!('repository' in entry) || typeof entry.repository !== 'string' || !/^[a-z\d][\w.-]*\/[a-z\d][\w.-]*$/i.test(entry.repository)) {
      throw new Error('each fleet repository must use an owner/name identifier')
    }
    if ('ref' in entry && entry.ref !== undefined && typeof entry.ref !== 'string') {
      throw new Error('fleet repository ref must be a string')
    }
    if (!('adoption' in entry) || !entry.adoption || typeof entry.adoption !== 'object') {
      throw new Error('each fleet repository must declare an adoption policy')
    }
  }
  return source as FleetConfig
}

export async function inspectFleet(
  config: FleetConfig,
  load: (repository: string, ref: string) => Promise<AdoptionSnapshot> = loadGitHubAdoptionSnapshot,
) {
  return Promise.all(
    config.repositories.map(async ({ repository, ref = 'main', adoption }) => ({
      repository,
      ref,
      drift: adoptionSnapshotDrift(await load(repository, ref), adoption),
    })),
  )
}

export function fleetMarkdown(results: FleetResult[]) {
  const healthy = results.filter((result) => result.drift.length === 0).length
  const lines = [`# ras-stack fleet health`, '', `${healthy}/${results.length} repositories conform to their declared adoption policy.`, '']
  for (const result of results) {
    lines.push(`## ${result.drift.length === 0 ? '✅' : '❌'} ${result.repository}@${result.ref}`, '')
    if (result.drift.length === 0) lines.push('No drift detected.', '')
    else for (const message of result.drift) lines.push(`- ${message}`)
    if (result.drift.length > 0) lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export async function loadGitHubAdoptionSnapshot(repository: string, ref: string): Promise<AdoptionSnapshot> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  const tree = await githubJson<GitTree>(
    `https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    headers,
  )
  if (tree.truncated) throw new Error(`${repository}@${ref}: GitHub returned a truncated tree`)
  const selected = tree.tree.filter((entry) => entry.type === 'blob' && entry.sha && selectedMetadataPath(entry.path))
  const sources = await Promise.all(
    selected.map(async (entry) => {
      const blob = await githubJson<GitBlob>(`https://api.github.com/repos/${repository}/git/blobs/${entry.sha}`, headers)
      if (blob.encoding !== 'base64') throw new Error(`${repository}@${ref}:${entry.path}: unsupported GitHub blob encoding`)
      return [entry.path, Buffer.from(blob.content.replaceAll('\n', ''), 'base64').toString('utf8')] as const
    }),
  )
  const files = new Map(sources)
  const manifestSource = files.get('package.json')
  if (!manifestSource) throw new Error(`${repository}@${ref}: package.json was not found`)
  return { manifest: JSON.parse(manifestSource) as Record<string, unknown>, files }
}

function selectedMetadataPath(path: string) {
  return (
    path === 'package.json' ||
    path === 'ras-stack.policy.json' ||
    path === 'oxlint.json' ||
    /^tsconfig(?:\.[^.]+)*\.json$/.test(path) ||
    /^\.github\/.*\.ya?ml$/.test(path)
  )
}

async function githubJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`GitHub request failed with ${response.status}: ${url}`)
  return (await response.json()) as T
}

type GitTree = { truncated: boolean; tree: { path: string; type: string; sha?: string }[] }
type GitBlob = { encoding: string; content: string }
