import path from 'node:path'
import { fileURLToPath, type URL } from 'node:url'

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
