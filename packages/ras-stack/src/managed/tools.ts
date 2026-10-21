import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolve } from 'import-meta-resolve'

export async function loadTool<T>(specifier: string): Promise<T> {
  return import(resolve(specifier, pathToFileURL(join(process.cwd(), 'package.json')).href)) as Promise<T>
}
