import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runManagedCli } from './cli.js'

describe('managed tool commands', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ras-tool-'))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    vi.stubEnv('RAS_TEST_RESULT', join(root, 'result.json'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'application', packageManager: 'pnpm@12.13.0' }))
    await writeFile(join(root, 'pnpm-workspace.yaml'), '{}\n')
    await writeFile(
      join(root, 'ras.config.ts'),
      `export default {tooling:[{name:'tools',
        packages:{typescript:'1.0.0',oxlint:'1.0.0',oxfmt:'1.0.0',vite:'1.0.0'},
        presets:{typescript:'browser',oxlint:['application'],vite:['react']},
        commands:{typecheck:{package:'typescript',bin:'tool',args:['--noEmit']},lint:{package:'oxlint',bin:'tool'},format:{package:'oxfmt',bin:'tool',args:['--write']},dev:{package:'vite',bin:'tool'},build:{package:'vite',bin:'tool',args:['build']}}
      }]}\n`,
    )
    await Promise.all(
      ['typescript', 'oxlint', 'oxfmt', 'vite'].map(async (name) => {
        const directory = join(root, 'node_modules', name)
        await mkdir(directory, { recursive: true })
        await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', bin: { tool: './bin.cjs' } }))
        await writeFile(
          join(directory, 'bin.cjs'),
          "require('node:fs').writeFileSync(process.env.RAS_TEST_RESULT,JSON.stringify(process.argv.slice(2)))\n",
        )
      }),
    )
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  async function argumentsFor(command: string, args: string[] = []) {
    await runManagedCli(command, args)
    return JSON.parse(await readFile(join(root, 'result.json'), 'utf8')) as string[]
  }

  it('uses generated compiler configuration when the app has none', async () => {
    expect(await argumentsFor('typecheck')).toEqual(['--noEmit', '--project', '.ras/tsconfig.json'])
  })

  it('uses application compiler configuration', async () => {
    await writeFile(join(root, 'tsconfig.json'), '{}')
    expect(await argumentsFor('typecheck')).toEqual(['--noEmit', '--project', 'tsconfig.json'])
  })

  it('preserves an explicit compiler project', async () => {
    expect(await argumentsFor('typecheck', ['--project=custom.json'])).toEqual(['--noEmit', '--project=custom.json'])
  })

  it('uses generated linter configuration and excludes installed/generated files', async () => {
    expect(await argumentsFor('lint', ['src'])).toEqual([
      '--config',
      '.ras/oxlint.json',
      '--ignore-pattern',
      'node_modules/**',
      '--ignore-pattern',
      '.ras/**',
      'src',
    ])
  })

  it('preserves application linter configuration', async () => {
    await writeFile(join(root, '.oxlintrc.json'), '{}')
    expect(await argumentsFor('lint', ['src'])).toEqual(['src'])
  })

  it('preserves an explicit linter configuration', async () => {
    expect(await argumentsFor('lint', ['--config=custom.json'])).toEqual(['--config=custom.json'])
  })

  it('checks formatting without writing', async () => {
    expect(await argumentsFor('format', ['--check', '.'])).toEqual(['--check', '.'])
  })

  it('writes formatting by default', async () => {
    expect(await argumentsFor('format', ['.'])).toEqual(['--write', '.'])
  })

  it('uses generated Vite configuration when none exists', async () => {
    expect(await argumentsFor('build')).toEqual(['build', '--config', '.ras/vite.config.mjs'])
  })

  it('preserves an application Vite configuration', async () => {
    await writeFile(join(root, 'vite.config.ts'), 'export default {}')
    expect(await argumentsFor('dev')).toEqual([])
  })

  it('preserves an explicit Vite configuration', async () => {
    expect(await argumentsFor('build', ['--config=custom.ts'])).toEqual(['build', '--config=custom.ts'])
  })

  it('rejects an unselected command', async () => {
    await expect(runManagedCli('unselected', [])).rejects.toThrow('No tool provides ras unselected')
  })

  it('executes a program with the consumer binary path', async () => {
    await runManagedCli('exec', [
      '--',
      process.execPath,
      '-e',
      "require('node:fs').writeFileSync(process.env.RAS_TEST_RESULT,process.env.PATH)",
    ])
    expect((await readFile(join(root, 'result.json'), 'utf8')).split(':')[0]).toBe(join(root, 'node_modules/.bin'))
  })

  it('requires an exec program', async () => {
    await expect(runManagedCli('exec', [])).rejects.toThrow('usage: ras exec')
  })
})
