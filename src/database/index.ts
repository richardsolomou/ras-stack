import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

export type BundledDirectoryOptions = {
  developmentUrl: URL
  production: boolean
  productionEntry?: string
  name: string
}

export function bundledDirectory(options: BundledDirectoryOptions) {
  if (!options.production) return fileURLToPath(options.developmentUrl)
  const entry = options.productionEntry ?? process.argv[1]
  if (!entry) throw new Error('production entrypoint is required to resolve a bundled directory')
  return path.join(path.dirname(entry), options.name)
}

export type DatabaseTarget = { provider: 'sqlite'; file: string } | { provider: 'postgres'; url: string }

export function databaseTarget(options: { databaseUrl?: string; sqliteFile: string }): DatabaseTarget {
  const configured = options.databaseUrl?.trim()
  if (!configured) return { provider: 'sqlite', file: options.sqliteFile }
  const url = new URL(configured)
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('database URL must use a postgres:// or postgresql:// URL')
  }
  return { provider: 'postgres', url: configured }
}
