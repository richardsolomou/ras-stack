import { readMigrationFiles } from 'drizzle-orm/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { note } from '../db/schema'
import { app, closeApp } from './app'

let directory: string

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'app-server-database-'))
  vi.stubEnv('DATA_DIR', directory)
})

afterAll(async () => {
  await closeApp()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

const pragma = (name: string) => app().database.$client.pragma(name, { simple: true })

it('opens the startup connection in WAL mode', () => {
  expect(pragma('journal_mode')).toBe('wal')
})

it('syncs every commit to disk', () => {
  expect(pragma('synchronous')).toBe(2)
})

it('waits five seconds for a lock before failing', () => {
  expect(pragma('busy_timeout')).toBe(5000)
})

it('enforces foreign keys', () => {
  expect(pragma('foreign_keys')).toBe(1)
})

it('stores the database in DATA_DIR', () => {
  expect(app().database.$client.name).toBe(path.join(directory, 'app.sqlite'))
})

it('applies every checked-in migration at startup', () => {
  const applied = app().database.$client.prepare('SELECT count(*) FROM __drizzle_migrations').pluck().get()
  expect(applied).toBe(readMigrationFiles({ migrationsFolder: 'drizzle' }).length)
})

it('reads and writes the schema', () => {
  const [created] = app().database.insert(note).values({ body: 'hello' }).returning().all()
  expect(app().database.select().from(note).all()).toEqual([created])
})
