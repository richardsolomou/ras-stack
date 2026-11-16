import Database from 'better-sqlite3'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runDatabaseCommand } from './database'
import { databaseFileName } from './databaseFile'

let directory: string
let source: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'app-backup-'))
  source = path.join(directory, databaseFileName)
  writeValue(source, 'before')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

it('backs up and restores a validated database', async () => {
  const backup = path.join(directory, 'backup.sqlite')
  await runDatabaseCommand('backup', backup, { DATA_DIR: directory })
  writeValue(source, 'after')
  await runDatabaseCommand('restore', backup, { DATA_DIR: directory })
  expect(readValue(source)).toBe('before')
})

it('writes a WAL database as one self-contained backup file', async () => {
  const running = new Database(source)
  running.pragma('journal_mode = WAL')
  const backup = await runDatabaseCommand('backup', undefined, { DATA_DIR: directory })
  running.close()
  expect(await readdir(path.dirname(backup))).toEqual([path.basename(backup)])
})

it('restores a backup of a stopped WAL database from the same data directory', async () => {
  const stopped = new Database(source)
  stopped.pragma('journal_mode = WAL')
  stopped.close()
  const backup = await runDatabaseCommand('backup', undefined, { DATA_DIR: directory })
  await expect(runDatabaseCommand('restore', backup, { DATA_DIR: directory })).resolves.toBe(source)
})

it('rejects a corrupt restore candidate without changing the source', async () => {
  const corrupt = path.join(directory, 'corrupt.sqlite')
  await writeFile(corrupt, 'not sqlite')
  await expect(runDatabaseCommand('restore', corrupt, { DATA_DIR: directory })).rejects.toThrow('file is not a database')
  expect(readValue(source)).toBe('before')
})

it('restores the original file and removes temporary state when replacement fails', async () => {
  const backup = path.join(directory, 'backup.sqlite')
  await runDatabaseCommand('backup', backup, { DATA_DIR: directory })
  writeValue(source, 'current')
  const operations = await import('node:fs/promises')
  let renames = 0
  const rename = vi.fn(async (from: string, to: string) => {
    renames += 1
    if (renames === 2) throw new Error('replacement failed')
    await operations.rename(from, to)
  }) as typeof operations.rename
  await expect(runDatabaseCommand('restore', backup, { DATA_DIR: directory }, { ...operations, rename })).rejects.toThrow(
    'replacement failed',
  )
  expect(readValue(source)).toBe('current')
  expect((await readdir(directory)).some((file) => file.includes('.restore-'))).toBe(false)
})

it('restores the original file even when temporary cleanup also fails', async () => {
  const backup = path.join(directory, 'backup.sqlite')
  await runDatabaseCommand('backup', backup, { DATA_DIR: directory })
  writeValue(source, 'current')
  const operations = await import('node:fs/promises')
  let renames = 0
  const rename = vi.fn(async (from: string, to: string) => {
    renames += 1
    if (renames === 2) throw new Error('replacement failed')
    await operations.rename(from, to)
  }) as typeof operations.rename
  const failure = await runDatabaseCommand(
    'restore',
    backup,
    { DATA_DIR: directory },
    {
      ...operations,
      rename,
      rm: vi.fn().mockRejectedValue(new Error('cleanup failed')),
    },
  ).catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect((failure as AggregateError).errors.map(String)).toEqual(['Error: replacement failed', 'Error: cleanup failed'])
  expect(readValue(source)).toBe('current')
})

it('reports rollback and cleanup failures after a replacement failure', async () => {
  const backup = path.join(directory, 'backup.sqlite')
  await runDatabaseCommand('backup', backup, { DATA_DIR: directory })
  const operations = await import('node:fs/promises')
  let renames = 0
  const rename = vi.fn(async (from: string, to: string) => {
    renames += 1
    if (renames === 2) throw new Error('replacement failed')
    if (renames === 3) throw new Error('rollback failed')
    await operations.rename(from, to)
  }) as typeof operations.rename
  const failure = await runDatabaseCommand(
    'restore',
    backup,
    { DATA_DIR: directory },
    {
      ...operations,
      rename,
      rm: vi.fn().mockRejectedValue(new Error('cleanup failed')),
    },
  ).catch((error: unknown) => error)
  expect((failure as AggregateError).errors.map(String)).toEqual([
    'Error: replacement failed',
    'Error: rollback failed',
    'Error: cleanup failed',
  ])
  expect(rename).toHaveBeenCalledTimes(3)
})

it('refuses to restore over a database that is open', async () => {
  const backup = path.join(directory, 'backup.sqlite')
  await runDatabaseCommand('backup', backup, { DATA_DIR: directory })
  const running = new Database(source)
  running.pragma('journal_mode = WAL')
  running.prepare('INSERT INTO proof (value) VALUES (?)').run('live')
  await expect(runDatabaseCommand('restore', backup, { DATA_DIR: directory })).rejects.toThrow(
    'Refusing to restore while SQLite sidecar exists',
  )
  running.close()
})

function writeValue(file: string, value: string) {
  const database = new Database(file)
  database.exec('DROP TABLE IF EXISTS proof; CREATE TABLE proof (value TEXT NOT NULL)')
  database.prepare('INSERT INTO proof (value) VALUES (?)').run(value)
  database.close()
}

function readValue(file: string) {
  const database = new Database(file, { readonly: true })
  const value = database.prepare('SELECT value FROM proof').pluck().get() as string
  database.close()
  return value
}
