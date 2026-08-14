import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runInitCli, type InitPrompts } from './init-cli.js'
import { applyRepositoryInit, INIT_ADOPTION, INIT_STEPS, planRepositoryInit, type TypeScriptPreset } from './init.js'

const everyStep = INIT_STEPS.map((step) => step.name)

describe('repository initialization plan', () => {
  it('starts from the adoption versions this repository declares', async () => {
    const policy = JSON.parse(await readFile(new URL('../../ras-stack.policy.json', import.meta.url), 'utf8')) as {
      adoption: Record<string, string>
    }

    expect(INIT_ADOPTION).toEqual({ node: policy.adoption.node, pnpm: policy.adoption.pnpm, just: policy.adoption.just })
  })

  it('plans nothing for an empty selection', async () => {
    expect(await planRepositoryInit(await repository(), { steps: [] }, '1.2.3')).toEqual([])
  })

  it.each(INIT_STEPS)('plans the $name step on its own', async ({ name }) => {
    const planned = await planRepositoryInit(await repository(), { steps: [name] }, '1.2.3')

    expect(planned.length).toBeGreaterThan(0)
  })

  it('generates the policy selection alongside the files that policy produces', async () => {
    const planned = await planRepositoryInit(await repository(), { steps: ['policy'] }, '1.2.3')

    expect(planned.map((file) => file.path)).toEqual([
      'ras-stack.policy.json',
      '.changeset/config.json',
      '.github/dependabot.yml',
      'pnpm-workspace.yaml',
    ])
    expect(JSON.parse(planned[0]!.contents)).toMatchObject({
      adoption: { minimumRasStackVersion: '1.2.3', minimumWorkflowRasStackVersion: '1.2.3', node: INIT_ADOPTION.node },
    })
  })

  it('pins the generated workflow to the release that generated it', async () => {
    const [workflow] = await planRepositoryInit(await repository(), { steps: ['workflow'] }, '1.2.3')

    expect(workflow?.contents).toContain('uses: richardsolomou/ras-stack/.github/workflows/check-js.yml@v1.2.3')
  })

  it('keeps the rest of package.json when it sets the toolchain', async () => {
    const root = await repository({ name: 'example', scripts: { check: 'pnpm test' } })

    const [manifest] = await planRepositoryInit(root, { steps: ['toolchain'] }, '1.2.3')

    expect(JSON.parse(manifest!.contents)).toEqual({
      name: 'example',
      scripts: { check: 'pnpm test' },
      engines: { node: INIT_ADOPTION.node },
      packageManager: `pnpm@${INIT_ADOPTION.pnpm}`,
    })
  })

  it('refuses the toolchain step without a package.json to configure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ras-stack-init-bare-'))

    await expect(planRepositoryInit(root, { steps: ['toolchain'] }, '1.2.3')).rejects.toThrow('package.json is required')
  })

  it('extends the requested TypeScript preset', async () => {
    const [tsconfig] = await planRepositoryInit(await repository(), { steps: ['typescript'], typescriptPreset: 'tanstack' }, '1.2.3')

    expect(JSON.parse(tsconfig!.contents).extends).toBe('./node_modules/ras-stack/config/typescript/tanstack.json')
  })

  it('reports the current contents of a file it would replace', async () => {
    const root = await repository()
    await writeFile(join(root, 'justfile'), 'default:\n    @echo mine\n')

    const [justfile] = await planRepositoryInit(root, { steps: ['justfile'] }, '1.2.3')

    expect(justfile?.existing).toBe('default:\n    @echo mine\n')
  })

  it('writes every planned file to disk', async () => {
    const root = await repository()
    const planned = await planRepositoryInit(root, { steps: everyStep }, '1.2.3')

    const written = await applyRepositoryInit(root, planned)

    expect(written).toEqual(planned.map((file) => file.path))
    await expect(readFile(join(root, '.github/workflows/ci.yml'), 'utf8')).resolves.toContain('just check')
  })
})

describe('repository initialization CLI', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('rejects an argument it does not accept', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runInitCli(['--force'], answering([]))

    expect(error).toHaveBeenCalledWith('usage: ras init [--yes] [--dry-run]')
    expect(process.exitCode).toBe(2)
  })

  it('writes nothing when every step is declined', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(process, 'cwd').mockReturnValue(await repository())

    await runInitCli([], answering(INIT_STEPS.map(() => false)))

    expect(log).toHaveBeenCalledWith('Nothing selected.')
  })

  it('accepts a step the answer confirms', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const root = await repository()
    vi.spyOn(process, 'cwd').mockReturnValue(root)

    await runInitCli([], answering([true, ...INIT_STEPS.slice(1).map(() => false)]))

    await expect(readFile(join(root, 'ras-stack.policy.json'), 'utf8')).resolves.toContain('adoption')
    expect(log).toHaveBeenCalledWith('wrote ras-stack.policy.json')
  })

  it('keeps a file the answer declines to replace', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const root = await repository()
    await writeFile(join(root, 'justfile'), 'default:\n    @echo mine\n')
    vi.spyOn(process, 'cwd').mockReturnValue(root)

    await runInitCli([], answering([...INIT_STEPS.slice(0, -1).map(() => false), true, false]))

    await expect(readFile(join(root, 'justfile'), 'utf8')).resolves.toBe('default:\n    @echo mine\n')
  })

  it('asks for the preset as part of the TypeScript step it belongs to', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const root = await repository()
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    const asked: string[] = []

    await runInitCli([], { ...answering([false, false, true, false, false, false]), select: selecting(asked, 'tanstack') })

    expect(asked).toEqual(['TypeScript preset'])
    await expect(readFile(join(root, 'tsconfig.json'), 'utf8')).resolves.toContain('typescript/tanstack.json')
  })

  it('stops without writing when a question is cancelled', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const root = await repository()
    vi.spyOn(process, 'cwd').mockReturnValue(root)

    await runInitCli([], {
      ...answering([]),
      confirm: () => Promise.reject(Object.assign(new Error('cancelled'), { name: 'ExitPromptError' })),
    })

    expect(error).toHaveBeenCalledWith('Nothing written.')
    expect(process.exitCode).toBe(130)
    await expect(readFile(join(root, 'justfile'), 'utf8')).rejects.toThrow('ENOENT')
  })

  it('reports the plan without writing it for a dry run', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const root = await repository()
    vi.spyOn(process, 'cwd').mockReturnValue(root)

    await runInitCli(['--yes', '--dry-run'], answering([]))

    expect(log).toHaveBeenCalledWith('create justfile')
    await expect(readFile(join(root, 'justfile'), 'utf8')).rejects.toThrow('ENOENT')
  })

  it('accepts every step without asking when told to', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const root = await repository()
    vi.spyOn(process, 'cwd').mockReturnValue(root)

    await runInitCli(['--yes'], answering([]))

    await expect(readFile(join(root, '.oxlintrc.json'), 'utf8')).resolves.toContain('ras-stack/config/oxlint.json')
  })
})

function selecting(asked: string[], preset: TypeScriptPreset) {
  return ({ message }: { message: string }) => {
    asked.push(message)
    return Promise.resolve(preset)
  }
}

function answering(answers: readonly boolean[]): InitPrompts {
  const remaining = [...answers]
  return {
    confirm: ({ default: fallback }) => Promise.resolve(remaining.length > 0 ? (remaining.shift() ?? fallback) : fallback),
    select: ({ choices }) => Promise.resolve(choices[0]!),
  }
}

async function repository(manifest: Record<string, unknown> = { name: 'example' }) {
  const root = await mkdtemp(join(tmpdir(), 'ras-stack-init-'))
  await writeFile(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return root
}
