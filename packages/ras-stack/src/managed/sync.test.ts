import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { runSyncCli, syncProject, updateProject } from './sync.js'
import * as processes from './process.js'

describe('native configuration synchronization', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ras-sync-'))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    vi.spyOn(processes, 'runPnpm').mockResolvedValue()
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'application', packageManager: 'pnpm@12.13.0', dependencies: { zod: '^4.0.0' } }),
    )
    await Promise.all(
      Object.entries({ react: '19.3.0', typescript: '7.0.2' }).map(async ([name, version]) => {
        await mkdir(join(root, 'node_modules', name), { recursive: true })
        await writeFile(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ version }))
      }),
    )
    await writeFile(
      join(root, 'ras.config.ts'),
      "export default {integrations:[{name:'fixture',packages:{react:'19.3.0'},devPackages:{typescript:'7.0.2'}}]}\n",
    )
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  async function workspace() {
    return parse(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8'))
  }

  it('leaves the physical application manifest unchanged', async () => {
    const before = await readFile(join(root, 'package.json'), 'utf8')
    await syncProject(root)
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before)
  })

  it('declares the executing release as a config dependency', async () => {
    await syncProject(root)
    const release = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
    expect((await workspace()).configDependencies).toEqual({ 'ras-stack': release.version })
  })

  it('uses the hook shipped inside RAS', async () => {
    await syncProject(root)
    expect((await workspace()).pnpmfile).toBe('node_modules/.pnpm-config/ras-stack/pnpmfile.mjs')
  })

  it('preserves a configured version range during ordinary sync', async () => {
    await writeFile(join(root, 'pnpm-workspace.yaml'), "configDependencies:\n  ras-stack: '^5.0.0'\n")
    await syncProject(root)
    expect((await workspace()).configDependencies['ras-stack']).toBe('^5.0.0')
  })

  it('replaces the config dependency when applying a target release', async () => {
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'configDependencies:\n  ras-stack: 0.0.1\n')
    await syncProject(root, { upgrade: true })
    const release = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
    expect((await workspace()).configDependencies['ras-stack']).toBe(release.version)
  })

  it('preserves caller policies, comments, and unrelated config dependencies', async () => {
    await writeFile(
      join(root, 'pnpm-workspace.yaml'),
      'minimumReleaseAge: 10080\n# Keep registry routing local.\nregistry: https://example.com\nconfigDependencies:\n  other-config: 1.0.0\n',
    )
    await syncProject(root)
    expect(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain('# Keep registry routing local.')
    expect((await workspace()).configDependencies['other-config']).toBe('1.0.0')
  })

  it('rejects an existing custom hook without changing it', async () => {
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'pnpmfile: custom.mjs\n')
    await expect(syncProject(root)).rejects.toThrow('existing pnpmfile')
    expect(await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe('pnpmfile: custom.mjs\n')
  })

  it('rejects malformed workspace YAML before installing', async () => {
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'configDependencies: [\n')
    await expect(syncProject(root)).rejects.toThrow('Flow sequence')
    expect(processes.runPnpm).not.toHaveBeenCalled()
  })

  it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])(
    'rejects duplicate ownership in %s',
    async (field) => {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ name: 'application', packageManager: 'pnpm@12.13.0', [field]: { react: '19.3.0' } }),
      )
      await expect(syncProject(root)).rejects.toThrow(`react is declared in ${field}`)
    },
  )

  it('checks without installing or changing tracked files', async () => {
    await syncProject(root)
    vi.mocked(processes.runPnpm).mockClear()
    await syncProject(root, { check: true })
    expect(processes.runPnpm).not.toHaveBeenCalled()
  })

  it('detects missing hook configuration without writing', async () => {
    await expect(syncProject(root, { check: true })).rejects.toThrow('Run ras sync')
    await expect(readFile(join(root, 'pnpm-workspace.yaml'))).rejects.toThrow('ENOENT')
  })

  it('allows retrying an installation failure', async () => {
    vi.mocked(processes.runPnpm).mockRejectedValueOnce(new Error('registry unavailable'))
    await expect(syncProject(root)).rejects.toThrow('registry unavailable')
    await expect(syncProject(root)).resolves.toBeUndefined()
  })

  it('unfreezes installation when applying selections under CI', async () => {
    await syncProject(root)
    expect(processes.runPnpm).toHaveBeenCalledWith(['install', '--no-frozen-lockfile'], root)
  })

  it('updates only generated Dependabot ignores after deselection', async () => {
    await mkdir(join(root, '.github'))
    await writeFile(
      join(root, '.github/dependabot.yml'),
      "version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule: {interval: weekly}\n    ignore:\n      - dependency-name: zod\n        versions: ['5']\n  - package-ecosystem: github-actions\n    directory: /\n    schedule: {interval: monthly}\n",
    )
    await syncProject(root)
    await writeFile(join(root, 'ras.config.ts'), 'export default {}\n')
    await syncProject(root)
    expect(parse(await readFile(join(root, '.github/dependabot.yml'), 'utf8')).updates[0].ignore).toEqual([
      { 'dependency-name': 'zod', versions: ['5'] },
      { 'dependency-name': 'ras-stack' },
    ])
  })

  it('accepts generated Dependabot YAML after the application formatter runs', async () => {
    await mkdir(join(root, '.github'))
    await writeFile(
      join(root, '.github/dependabot.yml'),
      'version: 2\nupdates:\n  - package-ecosystem: npm\n    directories: [/]\n    schedule: {interval: weekly}\n',
    )
    await syncProject(root)
    execFileSync('oxfmt', ['--write', '.github/dependabot.yml'], { cwd: root, stdio: 'pipe' })
    await expect(syncProject(root, { check: true })).resolves.toBeUndefined()
  })

  it.each(['updates: {}\n', 'updates:\n  - package-ecosystem: npm\n    directory: /\n    ignore: {}\n'])(
    'rejects malformed Dependabot structures: %s',
    async (source) => {
      await mkdir(join(root, '.github'))
      await writeFile(join(root, '.github/dependabot.yml'), source)
      await expect(syncProject(root)).rejects.toThrow('sequence')
    },
  )

  it('runs the selected release to perform the complete update', async () => {
    await updateProject(root, ['next'])
    expect(processes.runPnpm).toHaveBeenCalledWith(['dlx', 'ras-stack@next', 'sync', '--upgrade'], root)
  })

  it('updates to stable by default', async () => {
    await updateProject(root, [])
    expect(processes.runPnpm).toHaveBeenCalledWith(['dlx', 'ras-stack@latest', 'sync', '--upgrade'], root)
  })

  it('rejects extra update arguments', async () => {
    await expect(updateProject(root, ['next', '--unexpected'])).rejects.toThrow('usage: ras update')
    expect(processes.runPnpm).not.toHaveBeenCalled()
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
})
