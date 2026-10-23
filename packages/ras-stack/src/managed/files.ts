import { randomUUID } from 'node:crypto'
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises'

export async function readJson<T>(file: string | URL): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function writeAtomic(file: string, contents: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, contents, { flag: 'wx' })
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}
