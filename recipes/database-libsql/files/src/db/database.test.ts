import { createClient } from '@libsql/client'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { databaseFile, databaseFileName, openDatabase } from './database'
import * as schema from './schema'

let directory: string
let file: string
let migrations: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'app-database-'))
  file = path.join(directory, 'data', 'app.sqlite')
  migrations = path.join(directory, 'drizzle')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const parentAndChild = [
  'CREATE TABLE `parent` (`id` integer PRIMARY KEY NOT NULL)',
  'CREATE TABLE `child` (`id` integer PRIMARY KEY NOT NULL, `parent_id` integer NOT NULL REFERENCES `parent`(`id`) ON DELETE cascade)',
]

// The statements drizzle-kit generates to change a column, which SQLite can only do by rebuilding the table.
const rebuildParent = [
  'PRAGMA foreign_keys=OFF',
  "CREATE TABLE `__new_parent` (`id` integer PRIMARY KEY NOT NULL, `name` text DEFAULT '' NOT NULL)",
  'INSERT INTO `__new_parent`("id") SELECT "id" FROM `parent`',
  'DROP TABLE `parent`',
  'ALTER TABLE `__new_parent` RENAME TO `parent`',
  'PRAGMA foreign_keys=ON',
]

it('creates the data directory and applies the migrations', async () => {
  await writeMigrations([parentAndChild])
  ;(await openDatabase(file, migrations)).$client.close()
  expect(await query("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual(expect.arrayContaining(['parent', 'child']))
})

it('rebuilds a referenced table without deleting the rows that reference it', async () => {
  await writeMigrations([parentAndChild])
  const database = await openDatabase(file, migrations)
  await database.$client.executeMultiple('INSERT INTO parent (id) VALUES (1); INSERT INTO child (id, parent_id) VALUES (1, 1)')
  database.$client.close()
  await writeMigrations([parentAndChild, rebuildParent])
  ;(await openDatabase(file, migrations)).$client.close()
  expect(await query('SELECT count(*) FROM child')).toEqual([1])
})

it('refuses to start while migrations leave a foreign key violation', async () => {
  await writeMigrations([[...parentAndChild, 'INSERT INTO child (id, parent_id) VALUES (1, 42)']])
  await expect(openDatabase(file, migrations)).rejects.toThrow('migrations left 1 foreign key violations')
  await expect(openDatabase(file, migrations)).rejects.toThrow('migrations left 1 foreign key violations')
})

it('backs up a database with data before applying new migrations', async () => {
  await writeMigrations([parentAndChild])
  const database = await openDatabase(file, migrations)
  await database.$client.execute('INSERT INTO parent (id) VALUES (7)')
  database.$client.close()
  await writeMigrations([parentAndChild, rebuildParent])
  ;(await openDatabase(file, migrations)).$client.close()
  const backups = await readdir(path.join(directory, 'data', 'backups'))
  expect(backups).toHaveLength(1)
  expect(await query('SELECT id FROM parent', path.join(directory, 'data', 'backups', backups[0]!))).toEqual([7])
})

it('skips the backup for a new database and for one that is up to date', async () => {
  await writeMigrations([parentAndChild])
  ;(await openDatabase(file, migrations)).$client.close()
  ;(await openDatabase(file, migrations)).$client.close()
  await expect(readdir(path.join(directory, 'data'))).resolves.not.toContain('backups')
})

it('requires DATA_DIR in production', () => {
  expect(() => databaseFile({ NODE_ENV: 'production' })).toThrow('DATA_DIR is required in production')
})

it('stores the database in DATA_DIR', () => {
  expect(databaseFile({ DATA_DIR: '/data' })).toBe(`/data/${databaseFileName}`)
})

it('has a migration for every schema change', async () => {
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')) as { entries: { idx: number }[] }
  const latest = String(journal.entries.at(-1)?.idx ?? 0).padStart(4, '0')
  const snapshot = JSON.parse(await readFile(`drizzle/meta/${latest}_snapshot.json`, 'utf8'))
  expect(await generateSQLiteMigration(snapshot, await generateSQLiteDrizzleJson(schema))).toEqual([])
})

async function writeMigrations(statements: string[][]) {
  await mkdir(path.join(migrations, 'meta'), { recursive: true })
  const entries = statements.map((_, idx) => ({
    idx,
    version: '6',
    when: 1_700_000_000_000 + idx,
    tag: `000${idx}_test`,
    breakpoints: true,
  }))
  await writeFile(path.join(migrations, 'meta', '_journal.json'), JSON.stringify({ version: '7', dialect: 'sqlite', entries }))
  for (const [idx, migration] of statements.entries()) {
    await writeFile(path.join(migrations, `000${idx}_test.sql`), migration.join('\n--> statement-breakpoint\n'))
  }
}

async function query(statement: string, from = file) {
  const client = createClient({ url: pathToFileURL(from).href })
  try {
    return (await client.execute(statement)).rows.map((row) => row[0])
  } finally {
    client.close()
  }
}
