import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { runSyncCli, syncProject, updateProject } from './sync.js'
import * as processes from './process.js'

describe('ordinary manifest synchronization', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ras-sync-'))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    vi.spyOn(processes, 'runPnpm').mockResolvedValue()
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'application', packageManager: 'pnpm@11.15.0', dependencies: { zod: '^4.0.0' } }),
    )
    await writeFile(
      join(root, 'ras.config.ts'),
      "export default {integrations:[{name:'fixture',packages:{react:'19.3.0'},devPackages:{typescript:'7.0.2'},presets:{typescript:'browser'}}]}\n",
    )
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  async function manifest() {
    return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  }

  it('writes runtime packages as ordinary exact dependencies', async () => {
    await syncProject(root)
    expect((await manifest()).dependencies.react).toBe('19.3.0')
  })

  it('writes tooling as ordinary development dependencies', async () => {
    await syncProject(root)
    expect((await manifest()).devDependencies).toEqual({ typescript: '7.0.2' })
  })

  it('preserves application-owned packages', async () => {
    await syncProject(root)
    expect((await manifest()).dependencies.zod).toBe('^4.0.0')
  })

  it('keeps ownership metadata out of the package manifest', async () => {
    await syncProject(root)
    expect(await manifest()).not.toHaveProperty('ras')
  })

  it('records managed names alongside the generated presets', async () => {
    await syncProject(root)
    expect(JSON.parse(await readFile(join(root, '.ras/dependencies.json'), 'utf8'))).toEqual(['react', 'typescript'])
  })

  it.each([123, null])('rejects an invalid ownership name %j', async (name) => {
    await syncProject(root)
    await writeFile(join(root, '.ras/dependencies.json'), JSON.stringify([name]))
    await expect(syncProject(root)).rejects.toThrow('Invalid managed package name')
  })

  it.each([{}, null, 'react'])('rejects an invalid ownership record %j', async (record) => {
    await syncProject(root)
    await writeFile(join(root, '.ras/dependencies.json'), JSON.stringify(record))
    await expect(syncProject(root)).rejects.toThrow('.ras/dependencies.json must be an array')
  })

  it('removes only packages previously owned by RAS when a selection is removed', async () => {
    await syncProject(root)
    await writeFile(join(root, 'ras.config.ts'), 'export default {}\n')
    await syncProject(root)
    expect(Object.keys((await manifest()).dependencies).toSorted()).toEqual(['ras-stack', 'zod'])
  })

  it('preserves a package transferred to application ownership', async () => {
    await syncProject(root)
    await writeFile(join(root, '.ras/dependencies.json'), '["typescript"]\n')
    await writeFile(join(root, 'ras.config.ts'), 'export default {}\n')
    await syncProject(root)
    expect((await manifest()).dependencies.react).toBe('19.3.0')
  })

  it('keeps an installed source candidate specifier during sync', async () => {
    const pkg = await manifest()
    pkg.dependencies['ras-stack'] = 'file:./candidate.tgz'
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
    await mkdir(join(root, 'node_modules/ras-stack'), { recursive: true })
    await writeFile(join(root, 'node_modules/ras-stack/package.json'), await readFile(new URL('../../package.json', import.meta.url)))
    await syncProject(root)
    expect((await manifest()).dependencies['ras-stack']).toBe('file:./candidate.tgz')
  })

  it('upgrades an older RAS version when bootstrapping with the target CLI', async () => {
    const pkg = await manifest()
    pkg.dependencies['ras-stack'] = '^0.0.1'
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
    await mkdir(join(root, 'node_modules/ras-stack'), { recursive: true })
    await writeFile(join(root, 'node_modules/ras-stack/package.json'), '{"version":"0.0.1"}')
    await syncProject(root)
    const target = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
    expect((await manifest()).dependencies['ras-stack']).toBe(target.version)
  })

  it('commits usable presets without an ignore-all rule', async () => {
    await syncProject(root)
    expect(await readFile(join(root, '.ras/.gitignore'), 'utf8')).not.toContain('*')
  })

  it('does not install packages when checking synchronized files', async () => {
    await syncProject(root)
    vi.mocked(processes.runPnpm).mockClear()
    await syncProject(root, { check: true })
    expect(processes.runPnpm).not.toHaveBeenCalled()
  })

  it('rejects changed selections without writing during a check', async () => {
    await syncProject(root)
    const before = await readFile(join(root, 'package.json'), 'utf8')
    await writeFile(join(root, 'ras.config.ts'), 'export default {}\n')
    await expect(syncProject(root, { check: true })).rejects.toThrow('ras sync')
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before)
  })

  it('keeps retryable ordinary files after pnpm fails', async () => {
    vi.mocked(processes.runPnpm).mockRejectedValueOnce(new Error('registry unavailable'))
    await expect(syncProject(root)).rejects.toThrow('registry unavailable')
    await syncProject(root)
    expect((await manifest()).dependencies.react).toBe('19.3.0')
  })

  it('preserves caller registry and release-age policy', async () => {
    const config = 'minimumReleaseAge: 10080\n# Keep registry routing local.\nregistry: https://example.com\n'
    await writeFile(join(root, 'pnpm-workspace.yaml'), config)
    await syncProject(root)
    expect(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(config)
  })

  it('rejects an explicitly denied build before changing the manifest', async () => {
    const before = await readFile(join(root, 'package.json'), 'utf8')
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'allowBuilds:\n  react: false\n')
    await writeFile(
      join(root, 'ras.config.ts'),
      "export default {integrations:[{name:'fixture',packages:{react:'19.3.0'}}],allowBuilds:['react']}\n",
    )
    await expect(syncProject(root)).rejects.toThrow('denies react')
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before)
  })

  it('updates only generated Dependabot ignores', async () => {
    await mkdir(join(root, '.github'))
    await writeFile(
      join(root, '.github/dependabot.yml'),
      "version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule: {interval: weekly}\n    ignore:\n      - dependency-name: zod\n        versions: ['5']\n  - package-ecosystem: github-actions\n    directory: /\n    schedule: {interval: monthly}\n",
    )
    await syncProject(root)
    await writeFile(join(root, 'ras.config.ts'), 'export default {}\n')
    await syncProject(root)
    const config = parse(await readFile(join(root, '.github/dependabot.yml'), 'utf8'))
    expect(config.updates[0].ignore).toEqual([{ 'dependency-name': 'zod', versions: ['5'] }, { 'dependency-name': 'ras-stack' }])
  })

  it('creates an ignore sequence in an existing npm rule', async () => {
    await mkdir(join(root, '.github'))
    await writeFile(
      join(root, '.github/dependabot.yml'),
      'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule: {interval: weekly}\n',
    )
    await syncProject(root)
    const config = parse(await readFile(join(root, '.github/dependabot.yml'), 'utf8'))
    expect(config.updates[0].ignore).toContainEqual({ 'dependency-name': 'react' })
  })

  it('accepts Dependabot YAML after the application formatter runs', async () => {
    await mkdir(join(root, '.github'))
    await writeFile(
      join(root, '.github/dependabot.yml'),
      'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule: {interval: weekly}\n',
    )
    await writeFile(join(root, 'ras.config.ts'), "export default {tooling:[{name:'types',devPackages:{'@types/react':'19.3.0'}}]}\n")
    await writeFile(join(root, '.oxfmtrc.json'), '{"singleQuote":true}')
    await syncProject(root)
    execFileSync('oxfmt', ['--write', '.github/dependabot.yml'], { cwd: root, stdio: 'pipe' })
    await expect(syncProject(root, { check: true })).resolves.toBeUndefined()
  })

  it('launches the target release to perform the complete update', async () => {
    await updateProject(root, ['next'])
    expect(processes.runPnpm).toHaveBeenCalledWith(['dlx', 'ras-stack@next', 'sync', '--upgrade'], root)
  })

  it('rejects extra update arguments before running pnpm', async () => {
    await expect(updateProject(root, ['next', '--unexpected'])).rejects.toThrow('usage: ras update')
    expect(processes.runPnpm).not.toHaveBeenCalled()
  })

  it('updates to the stable release by default', async () => {
    await updateProject(root, [])
    expect(processes.runPnpm).toHaveBeenCalledWith(['dlx', 'ras-stack@latest', 'sync', '--upgrade'], root)
  })

  it('checks through the public sync command', async () => {
    await runSyncCli([])
    vi.mocked(processes.runPnpm).mockClear()
    await runSyncCli(['--check'])
    expect(processes.runPnpm).not.toHaveBeenCalled()
  })

  it.each([['--unknown'], ['--check', '--upgrade']])('rejects unsupported sync arguments %j', async (...args) => {
    await expect(runSyncCli(args)).rejects.toThrow('usage: ras sync')
  })

  it('detects missing committed configuration', async () => {
    await syncProject(root)
    await rm(join(root, '.ras/tsconfig.json'))
    await expect(syncProject(root, { check: true })).rejects.toThrow('.ras/tsconfig.json')
  })

  it('leaves formatted JSON unchanged', async () => {
    await syncProject(root)
    const formatted = JSON.stringify(await manifest()) + '\n'
    await writeFile(join(root, 'package.json'), formatted)
    await syncProject(root, { check: true })
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(formatted)
  })

  it('removes stale generated presets after deselection', async () => {
    await syncProject(root)
    await writeFile(join(root, 'ras.config.ts'), 'export default {}\n')
    await syncProject(root)
    await expect(readFile(join(root, '.ras/tsconfig.json'))).rejects.toThrow('ENOENT')
  })

  it('records explicitly requested build approvals', async () => {
    await writeFile(
      join(root, 'ras.config.ts'),
      "export default {integrations:[{name:'fixture',packages:{react:'19.3.0'}}],allowBuilds:['react']}\n",
    )
    await syncProject(root)
    expect(parse(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')).allowBuilds.react).toBe(true)
  })

  it('rejects conflicting overrides before installing', async () => {
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'overrides:\n  react: 18.0.0\n')
    await expect(syncProject(root)).rejects.toThrow('conflicts with managed react')
    expect(processes.runPnpm).not.toHaveBeenCalled()
  })
})
