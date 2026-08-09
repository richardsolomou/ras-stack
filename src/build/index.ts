import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

export type ServerAsset = { source: string; destination: string }
export type ServerAssetsConfig = { outputDirectory: string; assets: ServerAsset[] }

export async function loadServerAssetsConfig(root: string, configFile = 'ras-stack.assets.json') {
  const source = JSON.parse(await readFile(path.resolve(root, configFile), 'utf8')) as unknown
  if (!source || typeof source !== 'object' || !('outputDirectory' in source) || !('assets' in source)) {
    throw new Error(`${configFile} must contain outputDirectory and assets`)
  }
  if (typeof source.outputDirectory !== 'string' || !Array.isArray(source.assets)) {
    throw new Error(`${configFile} must contain a string outputDirectory and an assets array`)
  }
  const assets = source.assets.map((asset, index) => {
    if (
      !asset ||
      typeof asset !== 'object' ||
      !('source' in asset) ||
      typeof asset.source !== 'string' ||
      !('destination' in asset) ||
      typeof asset.destination !== 'string'
    ) {
      throw new Error(`${configFile} assets[${index}] must contain string source and destination paths`)
    }
    return { source: asset.source, destination: asset.destination }
  })
  return { outputDirectory: source.outputDirectory, assets } satisfies ServerAssetsConfig
}

export async function syncServerAssets(root: string, config: ServerAssetsConfig) {
  const paths = assetPaths(root, config)
  await Promise.all(
    paths.map(async (asset) => {
      await manifest(asset.source)
      await rm(asset.destination, { force: true, recursive: true })
      await mkdir(path.dirname(asset.destination), { recursive: true })
      await cp(asset.source, asset.destination, { recursive: true })
    }),
  )
}

export async function checkServerAssets(root: string, config: ServerAssetsConfig) {
  const compared = await Promise.all(
    assetPaths(root, config).map(async (asset) => {
      const [source, destination] = await Promise.all([manifest(asset.source), manifest(asset.destination).catch(() => undefined)])
      return !destination || !equalManifest(source, destination) ? asset.label : undefined
    }),
  )
  return compared.filter((destination) => destination !== undefined)
}

function assetPaths(root: string, config: ServerAssetsConfig) {
  const repository = path.resolve(root)
  const output = containedPath(repository, config.outputDirectory, 'outputDirectory')
  const assets = config.assets.map((asset, index) => ({
    source: containedPath(repository, asset.source, `assets[${index}].source`),
    destination: containedPath(output, asset.destination, `assets[${index}].destination`),
    label: asset.destination,
  }))
  for (const [index, asset] of assets.entries()) {
    for (const other of assets.slice(index + 1)) {
      if (contains(asset.destination, other.destination) || contains(other.destination, asset.destination)) {
        throw new Error(`asset destinations must not overlap: ${asset.label} and ${other.label}`)
      }
    }
  }
  return assets
}

function contains(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function containedPath(parent: string, child: string, name: string) {
  if (!child.trim()) throw new Error(`${name} must not be empty`)
  const resolved = path.resolve(parent, child)
  const relative = path.relative(parent, resolved)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${name} must stay inside ${parent}`)
  }
  return resolved
}

async function manifest(root: string) {
  const files = new Map<string, string>()
  const visit = async (current: string) => {
    const info = await lstat(current)
    if (info.isSymbolicLink()) throw new Error(`server assets must not contain symbolic links: ${current}`)
    if (info.isFile()) {
      files.set(
        path.relative(root, current) || '.',
        createHash('sha256')
          .update(await readFile(current))
          .digest('hex'),
      )
      return
    }
    if (!info.isDirectory()) throw new Error(`server assets must contain only files and directories: ${current}`)
    const entries = await readdir(current)
    await Promise.all(entries.map((entry) => visit(path.join(current, entry))))
  }
  await visit(root)
  return files
}

function equalManifest(left: Map<string, string>, right: Map<string, string>) {
  return left.size === right.size && [...left].every(([name, digest]) => right.get(name) === digest)
}
