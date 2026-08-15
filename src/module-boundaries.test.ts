import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

// Repository tooling ships in the same package as the application modules, so only this boundary keeps an
// application from pulling `yaml` and the CI-only code in through an import it never meant to make.
const tooling = ['build', 'policy', 'preview']
const application = ['auth', 'conformance', 'database', 'email', 'posthog', 'realtime', 'runtime', 'server', 'tanstack', 'uploads']

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

  it('keeps the TanStack middleware entrypoint safe for the client transform', async () => {
    const source = await readFile(new URL('tanstack/middleware.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('@tanstack/react-start/server')
    expect(source).not.toContain('../server/index.js')
  })
})

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
