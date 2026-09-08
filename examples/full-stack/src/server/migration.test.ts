import Database from 'better-sqlite3'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

it('preserves accounts when removing the legacy issuer column', async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-account-'))
  process.env.DATA_DIR = directory
  process.env.APP_URL = 'http://localhost:3100'
  const legacy = new Database(path.join(directory, 'example.sqlite'))
  const initialMigration = await readFile(path.resolve(import.meta.dirname, '../../drizzle/0000_production_reference.sql'), 'utf8')
  legacy.exec(initialMigration.replaceAll('--> statement-breakpoint', ''))
  legacy.exec(`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('user-1', 'Ada', 'ada@example.test', true, 1, 1);
    INSERT INTO account (id, account_id, issuer, provider_id, user_id, created_at, updated_at)
      VALUES ('account-1', 'ada@example.test', 'credential', 'credential', 'user-1', 1, 1);
    CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric);
    INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('initial', 1787072400000);
  `)
  legacy.close()

  const client = app().database.$client
  expect({
    columns: (client.pragma('table_info(account)') as Array<{ name: string }>).map(({ name }) => name),
    indexes: (client.pragma('index_list(account)') as Array<{ name: string }>).map(({ name }) => name),
    row: client.prepare('SELECT account_id, provider_id, user_id FROM account WHERE id = ?').get('account-1'),
  }).toEqual({
    columns: [
      'id',
      'account_id',
      'provider_id',
      'user_id',
      'access_token',
      'refresh_token',
      'id_token',
      'access_token_expires_at',
      'refresh_token_expires_at',
      'scope',
      'password',
      'created_at',
      'updated_at',
    ],
    indexes: ['account_provider_id_account_id_unique', 'account_user_id_idx', 'sqlite_autoindex_account_1'],
    row: { account_id: 'ada@example.test', provider_id: 'credential', user_id: 'user-1' },
  })
})
