import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdtemp } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { bundledDirectory } from './index.js'
import { closeDrizzleSqlite, configureSqlite, openDrizzleSqlite, openSqliteClient } from './sqlite.js'

describe('database lifecycle', () => {
  it('configures the standard SQLite safety settings', () => {
    const client = openSqliteClient(':memory:')
    expect({
      busyTimeout: client.pragma('busy_timeout', { simple: true }),
      foreignKeys: client.pragma('foreign_keys', { simple: true }),
      synchronous: client.pragma('synchronous', { simple: true }),
    }).toEqual({ busyTimeout: 5000, foreignKeys: 1, synchronous: 2 })
    client.close()
  })

  it('rejects an invalid busy timeout before changing the client', () => {
    const client = openSqliteClient(':memory:', { pragmas: false })
    expect(() => configureSqlite(client, { busyTimeout: -1 })).toThrow('busyTimeout must be a non-negative integer')
    client.close()
  })

  it('creates the database directory and runs bundled migrations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ras-stack-sqlite-'))
    const migrations = path.join(root, 'drizzle')
    await mkdir(path.join(migrations, 'meta'), { recursive: true })
    await writeFile(
      path.join(migrations, 'meta/_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'sqlite',
        entries: [{ idx: 0, version: '6', when: 1, tag: '0000_test', breakpoints: true }],
      }),
    )
    await writeFile(path.join(migrations, '0000_test.sql'), 'CREATE TABLE example (id integer PRIMARY KEY);')
    const file = path.join(root, 'nested', 'database.sqlite')
    const database = openDrizzleSqlite({ file, migrationsFolder: migrations, schema: {} })
    expect(database.$client.prepare("SELECT name FROM sqlite_master WHERE name = 'example'").pluck().get()).toBe('example')
    closeDrizzleSqlite(database)
    await expect(readFile(file)).resolves.toBeInstanceOf(Buffer)
  })

  it('resolves development and bundled production directories', () => {
    expect([
      bundledDirectory({ developmentUrl: pathToFileURL('/source/drizzle'), name: 'drizzle', production: false }),
      bundledDirectory({
        developmentUrl: pathToFileURL('/source/drizzle'),
        name: 'drizzle-postgres',
        production: true,
        productionEntry: '/app/server/index.mjs',
      }),
    ]).toEqual(['/source/drizzle', '/app/server/drizzle-postgres'])
  })
})
