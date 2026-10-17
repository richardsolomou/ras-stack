import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertSqliteConformance } from '../conformance/index.js'
import { openDrizzleLibsql } from './libsql.js'

async function databaseFile() {
  return path.join(await mkdtemp(path.join(tmpdir(), 'ras-stack-libsql-')), 'nested', 'database.sqlite')
}

describe('libsql lifecycle', () => {
  it('opens a database that passes the standard SQLite conformance', async () => {
    const database = await openDrizzleLibsql({ file: await databaseFile(), schema: {} })
    await expect(
      assertSqliteConformance(async (name) => (await database.$client.execute(`pragma ${name}`)).rows[0]?.[0]),
    ).resolves.toBeUndefined()
    database.$client.close()
  })

  it('leaves the journal mode alone when pragmas are disabled', async () => {
    const database = await openDrizzleLibsql({ file: await databaseFile(), schema: {}, pragmas: false })
    expect((await database.$client.execute('pragma journal_mode')).rows[0]?.[0]).toBe('delete')
    database.$client.close()
  })

  it('rejects an invalid busy timeout', async () => {
    await expect(openDrizzleLibsql({ file: await databaseFile(), schema: {}, pragmas: { busyTimeout: -1 } })).rejects.toThrow(
      'busyTimeout must be a non-negative integer',
    )
  })

  it('creates the database directory and runs bundled migrations', async () => {
    const file = await databaseFile()
    const migrations = path.join(path.dirname(path.dirname(file)), 'drizzle')
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
    const database = await openDrizzleLibsql({ file, migrationsFolder: migrations, schema: {} })
    expect((await database.$client.execute("SELECT name FROM sqlite_master WHERE name = 'example'")).rows[0]?.[0]).toBe('example')
    database.$client.close()
    await expect(readFile(file)).resolves.toBeInstanceOf(Buffer)
  })
})
