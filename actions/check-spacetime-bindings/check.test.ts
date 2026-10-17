import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const script = new URL('./check.sh', import.meta.url).pathname

// Stands in for `spacetime generate`, writing GENERATED_CONTENT and recording its arguments.
const fakeSpacetime = `#!/usr/bin/env bash
set -euo pipefail
echo "$*" > "$ARGUMENTS_FILE"
while [[ $# -gt 0 ]]; do
  if [[ $1 == --out-dir ]]; then out=$2; fi
  shift
done
mkdir -p "$out"
printf '%s' "$GENERATED_CONTENT" > "$out/index.ts"
if [[ -n \${EXTRA_FILE:-} ]]; then printf 'extra' > "$out/$EXTRA_FILE"; fi
`

describe('SpacetimeDB bindings check', () => {
  it('passes when the generated bindings match the committed ones', async () => {
    const repository = await fixtureRepository('export const value = 1\n')

    await expect(run(repository, { GENERATED_CONTENT: 'export const value = 1\n' })).resolves.toMatchObject({
      stdout: expect.stringContaining('match the module'),
    })
  })

  it('passes the module, output and language through to the generator', async () => {
    const repository = await fixtureRepository('export const value = 1\n')
    await run(repository, { GENERATED_CONTENT: 'export const value = 1\n', BINDINGS_LANG: 'csharp' })

    expect((await readFile(join(repository, 'arguments.txt'), 'utf8')).trim()).toBe(
      'generate --lang csharp --module-path spacetimedb --out-dir src/generated --yes',
    )
  })

  it('fails when a committed binding is stale', async () => {
    const repository = await fixtureRepository('export const value = 1\n')

    await expect(run(repository, { GENERATED_CONTENT: 'export const value = 2\n' })).rejects.toMatchObject({
      stderr: expect.stringContaining('are stale'),
    })
  })

  it('fails when the module produces a binding that was never committed', async () => {
    const repository = await fixtureRepository('export const value = 1\n')

    await expect(run(repository, { GENERATED_CONTENT: 'export const value = 1\n', EXTRA_FILE: 'added.ts' })).rejects.toMatchObject({
      stderr: expect.stringContaining('are stale'),
    })
  })

  it('applies the format command before comparing', async () => {
    const repository = await fixtureRepository('export const value = 1\n')

    await expect(
      run(repository, {
        GENERATED_CONTENT: 'export const value = 1;\n',
        BINDINGS_FORMAT_COMMAND: "sed -i.bak 's/;$//' src/generated/index.ts && rm src/generated/index.ts.bak",
      }),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('match the module') })
  })
})

async function fixtureRepository(committed: string) {
  const repository = await mkdtemp(join(tmpdir(), 'ras-stack-bindings-'))
  await exec('git', ['init', '--initial-branch=main'], { cwd: repository })
  await exec('git', ['config', 'user.name', 'Test'], { cwd: repository })
  await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: repository })
  await mkdir(join(repository, 'src/generated'), { recursive: true })
  await writeFile(join(repository, 'src/generated/index.ts'), committed)
  await writeFile(join(repository, '.gitignore'), 'bin/\narguments.txt\n')
  await exec('git', ['add', '.'], { cwd: repository })
  await exec('git', ['commit', '-m', 'bindings'], { cwd: repository })
  await mkdir(join(repository, 'bin'))
  await writeFile(join(repository, 'bin/spacetime'), fakeSpacetime)
  await chmod(join(repository, 'bin/spacetime'), 0o755)
  return repository
}

function run(repository: string, environment: Record<string, string>) {
  return exec('bash', [script], {
    cwd: repository,
    env: {
      ...process.env,
      PATH: `${join(repository, 'bin')}:${process.env.PATH}`,
      ARGUMENTS_FILE: join(repository, 'arguments.txt'),
      BINDINGS_MODULE_PATH: 'spacetimedb',
      BINDINGS_OUT_DIR: 'src/generated',
      ...environment,
    },
  })
}
