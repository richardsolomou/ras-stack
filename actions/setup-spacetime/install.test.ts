import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const script = fileURLToPath(new URL('install.sh', import.meta.url))
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(overrides: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'spacetime-setup-'))
  roots.push(root)
  const bin = join(root, 'bin')
  const source = join(root, 'source')
  const temporary = join(root, 'runner')
  await Promise.all([mkdir(bin), mkdir(source), mkdir(temporary)])
  await Promise.all(
    ['spacetimedb-cli', 'spacetimedb-standalone'].map(async (binary) => {
      await writeFile(join(source, binary), '#!/bin/sh\necho "spacetimedb-cli version 2.6.0"\n')
      await chmod(join(source, binary), 0o755)
    }),
  )
  const archive = join(root, 'release.tar.gz')
  execFileSync('tar', ['-czf', archive, '-C', source, 'spacetimedb-cli', 'spacetimedb-standalone'])
  const checksum = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex')
  await writeFile(join(bin, 'curl'), '#!/bin/sh\nwhile [ "$1" != "--output" ]; do shift; done\ncp "$FIXTURE_ARCHIVE" "$2"\n')
  await chmod(join(bin, 'curl'), 0o755)
  const output = join(root, 'output')
  const path = join(root, 'path')
  await Promise.all([writeFile(output, ''), writeFile(path, '')])
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    FIXTURE_ARCHIVE: archive,
    SPACETIME_VERSION: '2.6.0',
    SPACETIME_SHA256: checksum,
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    RUNNER_TEMP: temporary,
    GITHUB_OUTPUT: output,
    GITHUB_PATH: path,
    ...overrides,
  }
  return { env, output, path, temporary }
}

describe('pinned SpacetimeDB setup', () => {
  it('exposes executable binaries only after archive verification', async () => {
    const setup = await fixture()
    const result = spawnSync('bash', [script], { env: setup.env, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr)
    const directory = (await readFile(setup.path, 'utf8')).trim()
    const executable = spawnSync(join(directory, 'spacetime'), ['--version'], { encoding: 'utf8' })
    expect({ stdout: executable.stdout.trim(), outputs: (await readFile(setup.output, 'utf8')).trim().split('\n') }).toEqual({
      stdout: 'spacetimedb-cli version 2.6.0',
      outputs: [`cli-path=${directory}/spacetimedb-cli`, `standalone-path=${directory}/spacetimedb-standalone`],
    })
  })

  it('cleans up a failed download without exposing executables', async () => {
    const setup = await fixture()
    const curl = join(setup.temporary, '..', 'bin', 'curl')
    await writeFile(curl, '#!/bin/sh\nexit 22\n')
    const result = spawnSync('bash', [script], { env: setup.env, encoding: 'utf8' })
    expect({ status: result.status, outputs: await readFile(setup.output, 'utf8'), leftovers: await readdir(setup.temporary) }).toEqual({
      status: 22,
      outputs: '',
      leftovers: [],
    })
  })

  it('removes the partial installation when the job is cancelled during download', async () => {
    const setup = await fixture()
    const curl = join(setup.temporary, '..', 'bin', 'curl')
    const started = join(setup.temporary, '..', 'started')
    await writeFile(curl, '#!/bin/sh\ntouch "$FIXTURE_STARTED"\nsleep 30\n')
    const child = spawn('bash', [script], { detached: true, env: { ...setup.env, FIXTURE_STARTED: started }, stdio: 'ignore' })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (existsSync(started)) break
        // oxlint-disable-next-line no-await-in-loop -- Wait until the child reaches the cancellation boundary.
        await delay(10)
      }
      await readFile(started, 'utf8')
      process.kill(-child.pid!, 'SIGTERM')
      expect({ status: await exited, outputs: await readFile(setup.output, 'utf8'), leftovers: await readdir(setup.temporary) }).toEqual({
        status: 143,
        outputs: '',
        leftovers: [],
      })
    } finally {
      if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid!, 'SIGKILL')
    }
  })

  it.each([
    { SPACETIME_SHA256: '0'.repeat(64) },
    { SPACETIME_VERSION: '../../other' },
    { SPACETIME_SHA256: 'not-a-checksum' },
    { RUNNER_OS: 'Windows' },
    { RUNNER_ARCH: 'unknown' },
  ])('fails closed for %j', async (overrides) => {
    const setup = await fixture(overrides)
    const result = spawnSync('bash', [script], { env: setup.env, encoding: 'utf8' })
    expect({
      status: result.status,
      outputs: await readFile(setup.output, 'utf8'),
      path: await readFile(setup.path, 'utf8'),
      leftovers: await readdir(setup.temporary),
    }).toEqual({ status: 1, outputs: '', path: '', leftovers: [] })
  })
})
