import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdtemp } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { bundledDirectory, databaseTarget } from './index.js'
import { closeDrizzlePostgres, openDrizzlePostgres, redactedPostgresUrl } from './postgres.js'
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

  it('selects SQLite by default and validates configured PostgreSQL URLs', () => {
    expect([
      databaseTarget({ sqliteFile: '/data/app.sqlite' }),
      databaseTarget({ databaseUrl: 'postgresql://localhost/app', sqliteFile: '/data/app.sqlite' }),
    ]).toEqual([
      { provider: 'sqlite', file: '/data/app.sqlite' },
      { provider: 'postgres', url: 'postgresql://localhost/app' },
    ])
    expect(() => databaseTarget({ databaseUrl: 'mysql://localhost/app', sqliteFile: '/data/app.sqlite' })).toThrow(
      'database URL must use a postgres:// or postgresql:// URL',
    )
  })

  it('opens and closes a lazy native PostgreSQL client without connecting', async () => {
    const connection = openDrizzlePostgres({
      url: 'postgres://localhost/ras_stack_contract',
      schema: {},
      client: { connect_timeout: 1, max: 3 },
    })
    expect({ max: connection.client.options.max, select: typeof connection.database.select }).toEqual({ max: 3, select: 'function' })
    await closeDrizzlePostgres(connection)
  })

  it('removes PostgreSQL credentials from display URLs', () => {
    expect(redactedPostgresUrl('postgres://user:secret@database.example:5432/app?sslmode=require')).toBe(
      'postgres://database.example:5432/app?sslmode=require',
    )
  })
})
