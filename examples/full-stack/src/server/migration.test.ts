import Database from 'better-sqlite3'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, expect, it } from 'vitest'
import { app, closeApp } from './app'
import { messages } from './schema'

let directory: string | undefined

afterEach(async () => {
  await clearGlobalSingleton('ras-stack.example.full-stack', closeApp)
  if (directory) await rm(directory, { recursive: true, force: true })
  delete process.env.DATA_DIR
  delete process.env.APP_URL
})

it('preserves rows from the pre-migration messages table', async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-legacy-'))
  process.env.DATA_DIR = directory
  process.env.APP_URL = 'http://localhost:3100'
  const legacy = new Database(path.join(directory, 'example.sqlite'))
  legacy.exec(`CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  ); INSERT INTO messages (author, body, created_at) VALUES ('Ada', 'legacy row', 1234);`)
  legacy.close()
  expect(app().database.select().from(messages).all()).toEqual([
    { id: 1, authorId: 'legacy-import', author: 'Ada', body: 'legacy row', createdAt: new Date(1234) },
  ])
})
