import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { openDatabase } from '../db/database'
import { app, closeApp } from './app'

const opened = vi.hoisted(() => [] as { $client: { open: boolean } }[])
vi.mock('../db/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('../db/database')>()
  return {
    ...original,
    openDatabase: (...args: Parameters<typeof openDatabase>) => {
      const database = original.openDatabase(...args)
      opened.push(database)
      return database
    },
  }
})

let directory: string

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'app-'))
  vi.stubEnv('DATA_DIR', directory)
})

afterEach(() => closeApp())

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

it('creates one instance and shares it', () => {
  expect(app()).toBe(app())
})

it('creates a fresh instance after closing', async () => {
  const first = app()
  await closeApp()
  expect(app()).not.toBe(first)
})

it('closes what it opened when creating fails partway', async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'only-half-configured')
  try {
    expect(() => app()).toThrow('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together')
  } finally {
    vi.stubEnv('GOOGLE_CLIENT_ID', undefined)
  }
  await vi.waitFor(() => expect(opened.at(-1)?.$client.open).toBe(false))
})
