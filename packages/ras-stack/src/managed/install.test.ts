import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineConfig, defineIntegration } from '../config.js'
import { runManagedCli } from './cli.js'
import { exists, json, readJson } from './files.js'
import { installManaged, loadPlan, preparedPlan } from './install.js'
import { installationPlan } from './plan.js'
import { commandPath } from './environment.js'
import { testRegistry } from './testing.js'

const exec = promisify(execFile)
const alpha = defineIntegration({
  name: 'alpha',
  packages: { '@ras-test/alpha': '1.0.0' },
  commands: { typecheck: { package: '@ras-test/alpha', bin: 'ras-test-tool', args: ['--noEmit'] } },
})
const beta = defineIntegration({ name: 'beta', packages: { '@ras-test/beta': '1.0.0' } })

describe('managed installation against an npm registry', () => {
  let registry: Awaited<ReturnType<typeof testRegistry>>
  let root: string
  beforeAll(async () => {
    registry = await testRegistry()
  })
  afterAll(async () => {
    await registry.close()
  })
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'ras-consumer-')))
    await writeFile(
      join(root, 'package.json'),
      json({
        name: 'consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
        packageManager: 'pnpm@11.15.0',
        dependencies: { 'ras-stack': '1.0.0' },
      }),
    )
    await writeFile(join(root, 'ras.config.ts'), `export default ${json(defineConfig({ integrations: [alpha] }))}`)
    await writeFile(
      join(root, 'pnpm-workspace.yaml'),
      `registry: ${registry.url}\nminimumReleaseAge: 0\nallowBuilds:\n  '@ras-test/child': false\n  ras-stack: false\n`,
    )
    vi.stubEnv('npm_config_registry', registry.url)
    vi.stubEnv('RAS_TEST_MARKER', join(root, 'script-ran'))
    vi.stubEnv('RAS_TEST_COMMAND', join(root, 'command.json'))
    vi.stubEnv('GITHUB_SHA', 'a'.repeat(40))
    vi.stubEnv('GITHUB_REF', 'refs/heads/main')
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  it('resolves original package names and subpaths from application code', async () => {
    await installManaged(root, await loadPlan(root))
    const result = await exec(
      process.execPath,
      ['--input-type=module', '-e', "console.log((await import('@ras-test/alpha')).name, (await import('@ras-test/alpha/extra')).extra)"],
      { cwd: root },
    )
    expect(result.stdout.trim()).toBe('@ras-test/alpha true')
  })

  it('does not install an unselected integration', async () => {
    await installManaged(root, await loadPlan(root))
    expect(await exists(join(root, 'node_modules/@ras-test/beta'))).toBe(false)
  })

  it('does not expose unselected transitive packages to application imports', async () => {
    await installManaged(root, await loadPlan(root))
    await expect(exec(process.execPath, ['--input-type=module', '-e', "await import('@ras-test/child')"], { cwd: root })).rejects.toThrow(
      "Cannot find package '@ras-test/child'",
    )
  })

  it('does not execute package lifecycle scripts by default', async () => {
    await installManaged(root, await loadPlan(root))
    expect(await exists(join(root, 'script-ran'))).toBe(false)
  })

  it('runs explicitly approved build scripts', async () => {
    await installManaged(root, installationPlan(defineConfig({ integrations: [alpha], allowBuilds: ['@ras-test/alpha'] })))
    expect(await readFile(join(root, 'script-ran'), 'utf8')).toBe('ran')
  })

  it('reinstalls from the frozen lock without changing it', async () => {
    const plan = await loadPlan(root)
    await installManaged(root, plan)
    const before = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')
    await installManaged(root, plan, { frozen: true })
    expect(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')).toBe(before)
  })

  it('rejects a missing frozen lock before making registry requests', async () => {
    const before = registry.requests()
    await expect(installManaged(root, await loadPlan(root), { frozen: true })).rejects.toThrow('missing or outdated')
    expect(registry.requests()).toBe(before)
  })

  it('rejects an outdated frozen lock', async () => {
    await installManaged(root, await loadPlan(root))
    await expect(installManaged(root, installationPlan({ integrations: [beta] }), { frozen: true })).rejects.toThrow('outdated')
  })

  it('removes links for integrations no longer selected', async () => {
    await installManaged(root, await loadPlan(root))
    await installManaged(root, installationPlan({ integrations: [beta] }))
    expect(await exists(join(root, 'node_modules/@ras-test/alpha'))).toBe(false)
  })

  it('lets a forced native install restore a removed direct dependency', async () => {
    const plan = await loadPlan(root)
    await installManaged(root, plan)
    await rm(join(root, 'node_modules/@ras-test/alpha'))
    await installManaged(root, plan, { update: true })
    expect(await readlink(join(root, 'node_modules/@ras-test/alpha'))).toContain('.pnpm/')
  })

  it('does not change another workspace package dependency', async () => {
    await mkdir(join(root, 'mobile'))
    await writeFile(
      join(root, 'mobile/package.json'),
      json({ name: 'mobile', private: true, dependencies: { '@ras-test/alpha': '0.9.0' } }),
    )
    const workspace = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')
    await writeFile(join(root, 'pnpm-workspace.yaml'), workspace + 'packages:\n  - mobile\nhoist: false\n')
    await installManaged(root, await loadPlan(root))
    expect((await readJson<{ version: string }>(join(root, 'mobile/node_modules/@ras-test/alpha/package.json'))).version).toBe('0.9.0')
  })

  it('shares the selected module instance between RAS and the application without hoisting', async () => {
    const workspace = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')
    await writeFile(join(root, 'pnpm-workspace.yaml'), workspace + 'hoist: false\n')
    await installManaged(root, await loadPlan(root))
    const result = await exec(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import {identity} from '@ras-test/alpha';import {createRequire} from 'node:module';const require=createRequire(import.meta.resolve('ras-stack'));console.log(identity===(await import(require.resolve('@ras-test/alpha'))).identity)",
      ],
      { cwd: root },
    )
    expect(result.stdout.trim()).toBe('true')
  })

  it('rejects a managed package whose manifest is missing', async () => {
    await installManaged(root, await loadPlan(root))
    await rm(join(root, 'node_modules/@ras-test/alpha/package.json'))
    await expect(preparedPlan(root)).rejects.toThrow('Managed @ras-test/alpha@1.0.0 is not installed')
  })

  it('preserves a real directory occupying a managed public path', async () => {
    await installManaged(root, await loadPlan(root))
    const destination = join(root, 'node_modules/@ras-test/alpha')
    await rm(destination)
    await mkdir(destination)
    await writeFile(join(destination, 'consumer-file'), 'keep')
    await expect(preparedPlan(root)).rejects.toThrow('Managed @ras-test/alpha@1.0.0 is not installed')
    expect(await readFile(join(destination, 'consumer-file'), 'utf8')).toBe('keep')
  })

  it('leaves the native lockfile unchanged when resolution fails', async () => {
    await installManaged(root, await loadPlan(root))
    const before = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')
    await expect(
      installManaged(
        root,
        installationPlan({ integrations: [defineIntegration({ name: 'missing', packages: { '@ras-test/alpha': '2.0.0' } })] }),
      ),
    ).rejects.toThrow('failed')
    expect(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')).toBe(before)
  })

  it('rejects dependencies still owned by the consumer', async () => {
    await writeFile(
      join(root, 'package.json'),
      json({ name: 'consumer', dependencies: { 'ras-stack': '1.0.0', '@ras-test/alpha': '1.0.0' } }),
    )
    await expect(installManaged(root, await loadPlan(root))).rejects.toThrow('remove it before RAS can own it')
  })

  it('does not create a Prettier ignore file', async () => {
    await installManaged(root, await loadPlan(root))
    expect(await exists(join(root, '.prettierignore'))).toBe(false)
  })

  it('preserves consumer-owned formatter ignores', async () => {
    await writeFile(join(root, '.prettierignore'), 'generated/\n')
    await installManaged(root, await loadPlan(root))
    expect(await readFile(join(root, '.prettierignore'), 'utf8')).toBe('generated/\n')
  })

  it('does not overwrite a consumer-owned pnpm hook', async () => {
    await writeFile(join(root, '.pnpmfile.cjs'), 'module.exports = {}\n')
    await expect(installManaged(root, await loadPlan(root))).rejects.toThrow('consumer-owned .pnpmfile.cjs')
  })

  it('rejects another installer without removing its guard', async () => {
    await mkdir(join(root, '.ras-install.lock'))
    await expect(installManaged(root, await loadPlan(root))).rejects.toThrow('Another RAS install')
    expect(await exists(join(root, '.ras-install.lock'))).toBe(true)
  })

  it('rejects a symlinked environment', async () => {
    await symlink(tmpdir(), join(root, '.ras'))
    await expect(installManaged(root, await loadPlan(root))).rejects.toThrow('must not be a symbolic link')
  })

  it('uses the native lockfile to record transitive dependencies', async () => {
    await installManaged(root, await loadPlan(root))
    expect(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8')).toContain('@ras-test/child')
  })

  it('forwards tool arguments and runs in the consumer directory', async () => {
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await runManagedCli('typecheck', ['--pretty', 'false'])
    expect(await readJson(join(root, 'command.json'))).toEqual({
      args: ['--noEmit', '--project', '.ras/tsconfig.json', '--pretty', 'false'],
      cwd: root,
    })
  })

  it('reports a selected tool failure', async () => {
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    vi.stubEnv('RAS_TEST_EXIT', '7')
    await expect(runManagedCli('typecheck', [])).rejects.toThrow('failed')
  })

  it('does not substitute an unselected global tool', async () => {
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await expect(runManagedCli('test', [])).rejects.toThrow('No tool provides ras test')
  })

  it('rejects mutually exclusive install flags', async () => {
    await expect(installManaged(root, await loadPlan(root), { frozen: true, update: true })).rejects.toThrow('cannot be combined')
  })

  it('asks pnpm to reinstall a missing managed dependency', async () => {
    await installManaged(root, await loadPlan(root))
    await rm(join(root, 'node_modules/@ras-test/alpha'))
    await expect(preparedPlan(root)).rejects.toThrow('Managed @ras-test/alpha@1.0.0 is not installed')
  })

  it('installs through the public CLI command', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await runManagedCli('install', [])
    expect(await preparedPlan(root)).toEqual(await loadPlan(root))
  })

  it('regenerates missing local configuration without reinstalling', async () => {
    await installManaged(root, await loadPlan(root))
    await rm(join(root, '.ras'), { recursive: true })
    const before = registry.requests()
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await runManagedCli('prepare', [])
    expect(registry.requests()).toBe(before)
    expect(await exists(join(root, '.ras/.gitignore'))).toBe(true)
  })

  it('executes an explicitly requested command with forwarded arguments', async () => {
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await runManagedCli('exec', ['--', process.execPath, '-e', "require('node:fs').writeFileSync('exec-result',process.argv[1])", 'hello'])
    expect(await readFile(join(root, 'exec-result'), 'utf8')).toBe('hello')
  })

  it('rejects an empty execution request', async () => {
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await expect(runManagedCli('exec', [])).rejects.toThrow('usage: ras exec')
  })

  it('rejects unknown installer flags before changing files', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await expect(runManagedCli('install', ['--unknown'])).rejects.toThrow('usage: ras install')
  })

  it('preserves an explicit TypeScript project argument', async () => {
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await runManagedCli('typecheck', ['-p', 'tsconfig.worker.json'])
    expect(await readJson(join(root, 'command.json'))).toMatchObject({ args: ['--noEmit', '-p', 'tsconfig.worker.json'] })
  })

  it('uses the generated linter configuration when there is no application config', async () => {
    const tool = defineIntegration({
      ...alpha,
      presets: { oxlint: ['application'] },
      commands: { lint: { package: '@ras-test/alpha', bin: 'ras-test-tool' } },
    })
    await writeFile(join(root, 'ras.config.ts'), `export default ${json({ tooling: [tool] })}`)
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await runManagedCli('lint', ['src'])
    expect(await readJson(join(root, 'command.json'))).toMatchObject({
      args: ['--config', '.ras/oxlint.json', '--ignore-pattern', 'node_modules/**', '--ignore-pattern', '.ras/**', 'src'],
    })
  })

  it('preserves a JSONC application linter configuration', async () => {
    const tool = defineIntegration({
      ...alpha,
      presets: { oxlint: ['application'] },
      commands: { lint: { package: '@ras-test/alpha', bin: 'ras-test-tool' } },
    })
    await writeFile(join(root, 'ras.config.ts'), `export default ${json({ tooling: [tool] })}`)
    await writeFile(join(root, '.oxlintrc.jsonc'), '{}')
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await runManagedCli('lint', ['src'])
    expect(await readJson(join(root, 'command.json'))).toMatchObject({ args: ['src'] })
  })

  it('honours an explicit linter config argument', async () => {
    const tool = defineIntegration({
      ...alpha,
      presets: { oxlint: ['application'] },
      commands: { lint: { package: '@ras-test/alpha', bin: 'ras-test-tool' } },
    })
    await writeFile(join(root, 'ras.config.ts'), `export default ${json({ tooling: [tool] })}`)
    await installManaged(root, await loadPlan(root))
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    await runManagedCli('lint', ['-c', 'custom.json'])
    expect(await readJson(join(root, 'command.json'))).toMatchObject({ args: ['-c', 'custom.json'] })
  })

  it.each([{ defaults: ['--write'] }, { defaults: [] }])(
    'checks only the requested formatter paths with $defaults',
    async ({ defaults }) => {
      const tool = defineIntegration({
        ...alpha,
        commands: { format: { package: '@ras-test/alpha', bin: 'ras-test-tool', args: defaults } },
      })
      await writeFile(join(root, 'ras.config.ts'), `export default ${json({ tooling: [tool] })}`)
      await installManaged(root, await loadPlan(root))
      vi.spyOn(process, 'cwd').mockReturnValue(root)
      await runManagedCli('format', ['--check', 'one.ts'])
      expect(await readJson(join(root, 'command.json'))).toMatchObject({ args: ['--check', 'one.ts'] })
    },
  )

  it('regenerates tooling configuration from the current selection', async () => {
    const plan = installationPlan({ tooling: [defineIntegration({ ...alpha, presets: { typescript: 'browser' } })] })
    await writeFile(
      join(root, 'ras.config.ts'),
      `export default ${json({ tooling: [defineIntegration({ ...alpha, presets: { typescript: 'browser' } })] })}`,
    )
    await installManaged(root, plan)
    await writeFile(join(root, '.ras/tsconfig.json'), '{}')
    await preparedPlan(root)
    expect(await readJson(join(root, '.ras/tsconfig.json'))).toMatchObject({
      extends: '../node_modules/ras-stack/config/typescript/browser.json',
    })
  })

  it('does not replace an existing directory it does not own', async () => {
    await mkdir(join(root, '.ras'))
    await expect(installManaged(root, await loadPlan(root))).rejects.toThrow('consumer-owned .ras directory')
  })

  it('rejects unsafe tool executable paths', async () => {
    await mkdir(join(root, 'node_modules/unsafe'), { recursive: true })
    await writeFile(join(root, 'node_modules/unsafe/package.json'), json({ bin: '../escape' }))
    await expect(commandPath(root, 'unsafe', 'unsafe')).rejects.toThrow('safe')
  })
}, 30_000)
