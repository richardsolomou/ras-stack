import { readdir, readFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { describe, expect, it } from 'vitest'

const tooling = ['build', 'changesets', 'managed', 'preview', 'vite']
const application = [
  'auth',
  'conformance',
  'database',
  'email',
  'posthog',
  'realtime',
  'runtime',
  'server',
  'spacetime',
  'tanstack',
  'uploads',
]

describe('module boundaries', () => {
  it('classifies every module directory as application or tooling', async () => {
    const entries = await readdir(new URL('.', import.meta.url), { withFileTypes: true })

    expect(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted(),
    ).toEqual([...application, ...tooling].toSorted())
  })

  it('keeps repository tooling out of the application modules', async () => {
    const crossings = await Promise.all(application.map((directory) => toolingImports(directory)))

    expect(crossings.flat()).toEqual([])
  })

  it.each(['tanstack/client.ts', 'tanstack/middleware.ts'])('keeps %s safe for the client transform', async (file) => {
    expect(await serverOnlyImports(new URL(file, import.meta.url))).toEqual([])
  })
})

async function serverOnlyImports(entry: URL, visited = new Set<string>()): Promise<string[]> {
  if (visited.has(entry.href)) return []
  visited.add(entry.href)
  const source = await readFile(entry, 'utf8')
  // Type-only imports are erased before bundling, so only value imports reach the client.
  const specifiers = [...source.matchAll(/^(?:import|export)\s+(?!type\s)(?:[^;]*?\sfrom\s+)?'([^']+)'/gm)].map(
    ([, specifier]) => specifier ?? '',
  )
  const found = await Promise.all(
    specifiers.map(async (specifier) => {
      if (specifier.startsWith('.')) return serverOnlyImports(new URL(specifier.replace(/\.js$/, '.ts'), entry), visited)
      const serverOnly = isBuiltin(specifier) || specifier === '@tanstack/react-start/server'
      return serverOnly ? [`${entry.pathname.split('/src/').at(-1)} ${specifier}`] : []
    }),
  )
  return found.flat()
}

async function toolingImports(directory: string) {
  const base = new URL(`${directory}/`, import.meta.url)
  const files = (await readdir(base, { recursive: true })).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  const sources = await Promise.all(files.map(async (file) => [file, await readFile(new URL(file, base), 'utf8')] as const))
  return sources.flatMap(([file, source]) =>
    [...source.matchAll(/from '\.\.\/([^/']+)\/[^']+'/g)]
      .filter(([, target]) => tooling.includes(target ?? ''))
      .map(([specifier]) => `${directory}/${file} ${specifier}`),
  )
}
