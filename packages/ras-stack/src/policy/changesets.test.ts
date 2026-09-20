import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkRepositoryPolicy, syncRepositoryPolicy } from './index.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function repository(changesets = true) {
  const root = await mkdtemp(join(tmpdir(), 'ras-changesets-'))
  roots.push(root)
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
  await writeFile(join(root, 'ras-stack.policy.json'), JSON.stringify({ changesets }))
  await mkdir(join(root, '.changeset'))
  await syncRepositoryPolicy(root, 'write')
  return root
}

describe('changeset policy validation', () => {
  it.each(['---\n---\n', '---\r\n"app": patch\r\n---\r\nFix it.\r\n', '---\napp: none\n---\n'])(
    'accepts upstream changeset syntax: %j',
    async (contents) => {
      const root = await repository()
      await writeFile(join(root, '.changeset/change.md'), contents)
      expect(await checkRepositoryPolicy(root)).toEqual([])
    },
  )

  it('does not require a changeset when there are no releases', async () => {
    const root = await repository()
    await writeFile(join(root, '.changeset/README.md'), 'Instructions, not a changeset.')
    expect(await checkRepositoryPolicy(root)).toEqual([])
  })

  it.each(['No frontmatter.', '---\napp: invalid\n---\n', '---\n- app\n---\n'])('rejects malformed changesets: %j', async (contents) => {
    const root = await repository()
    await writeFile(join(root, '.changeset/change.md'), contents)
    expect(await checkRepositoryPolicy(root)).toEqual(['.changeset/change.md: missing or invalid frontmatter'])
  })

  it('rejects unknown packages without rewriting the changeset', async () => {
    const root = await repository()
    await writeFile(join(root, '.changeset/change.md'), '---\nother: patch\n---\nFix it.\n')
    await syncRepositoryPolicy(root, 'write')
    expect(await checkRepositoryPolicy(root)).toEqual(['.changeset/change.md: unknown package "other"'])
  })

  it('recognizes workspace packages rather than only the root manifest', async () => {
    const root = await repository()
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await mkdir(join(root, 'packages/library'), { recursive: true })
    await writeFile(join(root, 'packages/library/package.json'), JSON.stringify({ name: '@app/library', version: '1.0.0' }))
    await writeFile(join(root, '.changeset/change.md'), '---\n"@app/library": minor\n---\nAdd it.\n')
    expect(await checkRepositoryPolicy(root)).toEqual([])
  })

  it('does not inspect changesets when their policy is disabled', async () => {
    const root = await repository(false)
    await writeFile(join(root, '.changeset/change.md'), 'invalid')
    expect(await checkRepositoryPolicy(root)).toEqual([])
  })
})
