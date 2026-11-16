import { eq, sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { connect, migrateDatabase } from '../db/database'
import { note } from '../db/schema'
import { app, closeApp } from './app'

// Skipped without a server so the default suite stays offline; CI supplies DATABASE_URL so the real connection runs.
const url = process.env.DATABASE_URL

describe.skipIf(!url)('PostgreSQL against a running server', () => {
  afterAll(() => closeApp())

  it('answers through the startup connection', async () => {
    const [row] = await (await app().database).execute<{ one: number }>(sql`SELECT 1 AS one`)
    expect(row?.one).toBe(1)
  })

  it('parses bigint and numeric columns as numbers', async () => {
    const [row] = await (await app().database).execute(sql`SELECT 42::bigint AS count, 1.5::numeric AS amount`)
    expect(row).toEqual({ count: 42, amount: 1.5 })
  })

  it('applies every checked-in migration at startup', async () => {
    const [row] = await (
      await app().database
    ).execute<{ applied: number }>(sql`SELECT count(*) AS applied FROM drizzle.__drizzle_migrations`)
    expect(row?.applied).toBe(readMigrationFiles({ migrationsFolder: 'drizzle' }).length)
  })

  it('reads and writes the schema', async () => {
    const database = await app().database
    const [created] = await database.insert(note).values({ body: 'hello' }).returning()
    const found = await database.select().from(note).where(eq(note.id, created!.id))
    await database.delete(note).where(eq(note.id, created!.id))
    expect(found).toEqual([created])
  })

  it('lets two instances migrate a new database at the same time', async () => {
    const admin = await app().database
    const name = `app_test_${randomUUID().replaceAll('-', '')}`
    await admin.execute(sql.raw(`CREATE DATABASE ${name}`))
    const target = new URL(url!)
    target.pathname = `/${name}`
    const instances = [connect(target.href), connect(target.href)]
    try {
      await Promise.all(instances.map((instance) => migrateDatabase(instance, 'drizzle')))
      const [row] = await instances[0]!.execute<{ applied: number }>(sql`SELECT count(*) AS applied FROM drizzle.__drizzle_migrations`)
      expect(row?.applied).toBe(readMigrationFiles({ migrationsFolder: 'drizzle' }).length)
    } finally {
      await Promise.all(instances.map((instance) => instance.$client.end({ timeout: 5 })))
      await admin.execute(sql.raw(`DROP DATABASE ${name} WITH (FORCE)`))
    }
  })
})
