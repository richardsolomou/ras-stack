import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { syncRepositoryPolicy } from './index.js'

describe('repository policy synchronization', () => {
  it('writes only selected policy files with local overrides', async () => {
    const root = await repository({
      changesets: { overrides: { access: 'restricted', privatePackages: { version: true, tag: true } } },
      dependabot: false,
    })
    await syncRepositoryPolicy(root, 'write')
    const changesets = JSON.parse(await readFile(join(root, '.changeset/config.json'), 'utf8'))
    expect(changesets.access).toBe('restricted')
    expect(changesets.privatePackages).toEqual({ version: true, tag: true })
    await expect(readFile(join(root, '.github/dependabot.yml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('detects committed output drift without writing it', async () => {
    const root = await repository({ dependabot: true })
    expect(await syncRepositoryPolicy(root, 'check')).toEqual(['.github/dependabot.yml'])
    await expect(readFile(join(root, '.github/dependabot.yml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves local pnpm settings and comments', async () => {
    const root = await repository({ pnpm: {} })
    await writeFile(
      join(root, 'pnpm-workspace.yaml'),
      '# Keep this local build policy.\nallowBuilds:\n  esbuild: true\nminimumReleaseAge: 0\n',
    )
    await syncRepositoryPolicy(root, 'write')
    const workspace = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(workspace).toContain('# Keep this local build policy.')
    expect(parseInt(workspace.match(/minimumReleaseAge: (\d+)/)?.[1] ?? '')).toBe(10_080)
    expect(workspace).toContain('esbuild: true')
  })

  it('allows an intentional pnpm age override', async () => {
    const root = await repository({ pnpm: { minimumReleaseAge: 0 } })
    await syncRepositoryPolicy(root, 'write')
    expect(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('minimumReleaseAge: 0')
  })

  it('rejects invalid policy configuration', async () => {
    const root = await repository({ pnpm: { minimumReleaseAge: -1 } })
    await expect(syncRepositoryPolicy(root, 'check')).rejects.toThrow('pnpm.minimumReleaseAge must be a non-negative integer')
  })
})

async function repository(policy: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'ras-stack-policy-'))
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'ras-stack.policy.json'), `${JSON.stringify(policy)}\n`)
  return root
}
