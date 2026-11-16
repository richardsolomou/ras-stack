import { readMigrationFiles } from 'drizzle-orm/migrator'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { databaseFileName } from '../db/database'
import { note } from '../db/schema'
import { app, closeApp } from './app'

let directory: string

beforeAll(async () => {
  directory = await realpath(await mkdtemp(path.join(tmpdir(), 'app-server-database-')))
  vi.stubEnv('DATA_DIR', directory)
})

afterAll(async () => {
  await closeApp()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

const value = async (statement: string) => (await (await app().database).$client.execute(statement)).rows[0]?.[0]

it('opens the startup connection in WAL mode', async () => {
  expect(await value('PRAGMA journal_mode')).toBe('wal')
})

it('syncs every commit to disk', async () => {
  expect(await value('PRAGMA synchronous')).toBe(2)
})

it('waits five seconds for a lock before failing', async () => {
  expect(await value('PRAGMA busy_timeout')).toBe(5000)
})

it('enforces foreign keys', async () => {
  expect(await value('PRAGMA foreign_keys')).toBe(1)
})

it('stores the database in DATA_DIR', async () => {
  expect(await value("SELECT file FROM pragma_database_list WHERE name = 'main'")).toBe(path.join(directory, databaseFileName))
})

it('applies every checked-in migration at startup', async () => {
  expect(await value('SELECT count(*) FROM __drizzle_migrations')).toBe(readMigrationFiles({ migrationsFolder: 'drizzle' }).length)
})

it('reads and writes the schema', async () => {
  const database = await app().database
  const [created] = await database.insert(note).values({ body: 'hello' }).returning()
  expect(await database.select().from(note)).toEqual([created])
})
