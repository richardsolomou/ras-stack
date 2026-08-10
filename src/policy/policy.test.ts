import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adoptionDrift, syncAdoptionPolicy, syncRepositoryPolicy } from './index.js'

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

  it('detects workflow and toolchain versions that differ from the installed package', async () => {
    const root = await repository({})
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        dependencies: { 'ras-stack': '^0.7.0' },
        engines: { node: '>=22' },
        packageManager: 'pnpm@10.0.0',
      }),
    )
    await mkdir(join(root, '.github/workflows'), { recursive: true })
    await writeFile(join(root, '.github/workflows/ci.yml'), 'uses: richardsolomou/ras-stack/.github/workflows/check-js.yml@v0.6.0\n')
    expect(await adoptionDrift(root, { node: '>=24 <25', pnpm: '11.15.0', just: '1.58.0' })).toEqual([
      'toolchain drift: package.json engines.node must be >=24 <25',
      'toolchain drift: package.json packageManager must be pnpm@11.15.0',
      'ras-stack drift: .github/workflows/ci.yml uses v0.6.0, package.json uses 0.7.0',
      'toolchain drift: no workflow declares just-version 1.58.0',
    ])
  })

  it('accepts compatible versions and an intentional absent package dependency', async () => {
    const root = await repository({})
    await writeFile(join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24 <25' }, packageManager: 'pnpm@11.15.0' }))
    await mkdir(join(root, '.github/workflows'), { recursive: true })
    await writeFile(
      join(root, '.github/workflows/ci.yml'),
      "uses: richardsolomou/ras-stack/actions/setup-js@v0.8.3\njust-version: '1.58.0'\n",
    )
    expect(await adoptionDrift(root, { node: '>=24 <25', pnpm: '11.15.0', just: '1.58.0' })).toEqual([])
  })

  it('detects missing shared configuration references', async () => {
    const root = await repository({})
    await writeFile(join(root, 'package.json'), '{}')
    expect(await adoptionDrift(root, { requiredReferences: ['ras-stack/config/typescript/tanstack'] })).toEqual([
      'shared config drift: no configuration references ras-stack/config/typescript/tanstack',
    ])
  })

  it('synchronizes declared package, workflow, and toolchain versions', async () => {
    const root = await repository({
      adoption: {
        node: '>=24 <25',
        pnpm: '11.15.0',
        just: '1.58.0',
      },
    })
    await writeFile(
      join(root, 'package.json'),
      `${JSON.stringify(
        {
          dependencies: { 'ras-stack': '^0.22.0', react: '19.2.8' },
          engines: { node: '>=22' },
          packageManager: 'pnpm@10.0.0',
        },
        null,
        2,
      )}\n`,
    )
    await mkdir(join(root, '.github/workflows'), { recursive: true })
    await writeFile(
      join(root, '.github/workflows/ci.yml'),
      [
        'jobs:',
        '  check:',
        '    uses: richardsolomou/ras-stack/.github/workflows/check-js.yml@v0.8.0',
        '    with:',
        "      just-version: '1.57.0'",
        '  direct:',
        '    steps:',
        '      - uses: richardsolomou/ras-stack/actions/setup-just@v0.8.0',
        '        with:',
        "          version: '1.57.0'",
        '      - uses: richardsolomou/ras-stack/actions/setup-just@v0.8.0',
        '        with:',
        '          version: ${{ inputs.just-version }}',
        '',
      ].join('\n'),
    )

    expect(await syncAdoptionPolicy(root, 'write')).toEqual(['package.json', '.github/workflows/ci.yml'])
    expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))).toEqual({
      dependencies: { 'ras-stack': '^0.22.0', react: '19.2.8' },
      engines: { node: '>=24 <25' },
      packageManager: 'pnpm@11.15.0',
    })
    expect(await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')).toContain(
      'uses: richardsolomou/ras-stack/.github/workflows/check-js.yml@v0.22.0\n',
    )
    expect(await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')).toContain("just-version: '1.58.0'\n")
    expect(await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')).toContain("version: '1.58.0'\n")
    expect(await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')).toContain('version: ${{ inputs.just-version }}\n')
    expect(await syncAdoptionPolicy(root, 'check')).toEqual([])
  })

  it('uses the installed package version instead of an explicit workflow fallback', async () => {
    const root = await repository({
      adoption: { minimumWorkflowRasStackVersion: '0.18.0' },
    })
    await writeFile(join(root, 'package.json'), `${JSON.stringify({ devDependencies: { 'ras-stack': '0.8.2' } }, null, 2)}\n`)
    await mkdir(join(root, '.github/workflows'), { recursive: true })
    await writeFile(join(root, '.github/workflows/ci.yml'), 'uses: richardsolomou/ras-stack/actions/setup-js@v0.8.0\n')

    await syncAdoptionPolicy(root, 'write')

    expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).devDependencies['ras-stack']).toBe('0.8.2')
    expect(await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')).toContain('@v0.8.2')
  })

  it('uses the workflow fallback as a minimum without a package dependency', async () => {
    const root = await repository({ adoption: { minimumWorkflowRasStackVersion: '0.18.0' } })
    await writeFile(join(root, 'package.json'), '{}\n')
    await mkdir(join(root, '.github/workflows'), { recursive: true })
    await writeFile(
      join(root, '.github/workflows/ci.yml'),
      [
        'uses: richardsolomou/ras-stack/actions/setup-js@v0.8.0',
        'uses: richardsolomou/ras-stack/actions/setup-playwright@v0.27.0',
        '',
      ].join('\n'),
    )

    await syncAdoptionPolicy(root, 'write')

    const workflow = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')
    expect(workflow).toContain('setup-js@v0.18.0')
    expect(workflow).toContain('setup-playwright@v0.27.0')
  })

  it('reports workflow files without changing them in check mode', async () => {
    const root = await repository({ adoption: {} })
    await writeFile(join(root, 'package.json'), `${JSON.stringify({ dependencies: { 'ras-stack': '^0.8.2' } }, null, 2)}\n`)

    await mkdir(join(root, '.github/workflows'), { recursive: true })
    await writeFile(join(root, '.github/workflows/ci.yml'), 'uses: richardsolomou/ras-stack/actions/setup-js@v0.8.1\n')
    expect(await syncAdoptionPolicy(root, 'check')).toEqual(['.github/workflows/ci.yml'])
    expect(await readFile(join(root, 'package.json'), 'utf8')).toContain('^0.8.2')
  })

  it('aligns newer workflow references with the installed package', async () => {
    const root = await repository({ adoption: {} })
    await writeFile(join(root, 'package.json'), `${JSON.stringify({ dependencies: { 'ras-stack': '^0.22.0' } }, null, 2)}\n`)
    await mkdir(join(root, '.github/workflows'), { recursive: true })
    await writeFile(join(root, '.github/workflows/ci.yml'), 'uses: richardsolomou/ras-stack/actions/setup-js@v0.23.0\n')

    expect(await syncAdoptionPolicy(root, 'write')).toEqual(['.github/workflows/ci.yml'])
    expect(await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')).toContain('@v0.22.0')
  })
})

async function repository(policy: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'ras-stack-policy-'))
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'ras-stack.policy.json'), `${JSON.stringify(policy)}\n`)
  return root
}
