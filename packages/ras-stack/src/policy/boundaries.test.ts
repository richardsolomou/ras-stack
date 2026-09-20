import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function lint(file: string, specifier: string) {
  const root = await mkdtemp(join(tmpdir(), 'ras-boundaries-'))
  roots.push(root)
  await mkdir(dirname(join(root, file)), { recursive: true })
  await writeFile(join(root, file), `export * from '${specifier}'\n`)
  const config = join(root, 'oxlint.json')
  await writeFile(
    config,
    JSON.stringify({
      extends: ['domain', 'layers'].map((name) => fileURLToPath(new URL(`../../config/oxlint/${name}.json`, import.meta.url))),
    }),
  )
  try {
    execFileSync('oxlint', ['--config', config, join(root, file)], { cwd: root, encoding: 'utf8', stdio: 'pipe' })
    return ''
  } catch (error) {
    const failure = error as { stdout: string; stderr: string; status: number }
    if (failure.status !== 1) throw error
    return failure.stdout + failure.stderr
  }
}

describe('opt-in import boundaries', () => {
  it.each([
    ['src/core/model.ts', 'node:fs/promises'],
    ['src/core/nested/model.ts', 'fs/promises'],
    ['src/geometry/mesh.ts', 'react'],
    ['src/core/model.ts', '@tanstack/react-query'],
    ['src/core/model.ts', 'postgres'],
    ['src/core/model.ts', 'cheerio'],
    ['src/core/model.ts', 'html-to-text'],
    ['src/core/nested/model.ts', '../../server/app'],
    ['src/core/model.ts', '@/db/schema'],
    ['src/client/nested/page.ts', '../../server/app'],
    ['src/client/page.ts', '@/server/functionsInternal'],
    ['src/client/page.ts', '@/db/schema'],
    ['src/server/handler.ts', '@/client/page'],
    ['src/adapters/store.ts', '../server/app'],
    ['src/db/repository.ts', '../adapters/store'],
    ['src/contracts/request.ts', '../server/app'],
    ['src/routes/index.ts', './other'],
    ['src/routes/index.ts', '../routes/other'],
    ['src/routes/index.ts', '@/routes/other'],
  ])('rejects %s importing %s', async (file, specifier) => {
    expect(await lint(file, specifier)).toContain('no-restricted-imports')
  })

  it.each([
    ['src/core/model.ts', 'zod'],
    ['src/core/model.test.ts', 'node:fs'],
    ['src/client/page.spec.ts', '../server/app'],
    ['src/geometry/mesh.ts', 'manifold-3d'],
    ['src/geometry/mesh.ts', './types'],
    ['src/client/page.ts', '../server/functions'],
    ['src/client/page.ts', '../server/fns'],
    ['src/client/page.ts', '@/server/functions/accounts'],
    ['src/client/page.ts', '@/server/functions.ts'],
    ['src/server/handler.ts', '../core/model'],
    ['src/routes/index.ts', '../client/page'],
    ['src/other/module.ts', 'node:fs'],
  ])('allows %s importing %s', async (file, specifier) => {
    expect(await lint(file, specifier)).toBe('')
  })
})
