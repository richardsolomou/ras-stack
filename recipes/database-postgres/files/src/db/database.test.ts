import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import { readFile } from 'node:fs/promises'
import { afterAll, expect, it, vi } from 'vitest'
import { connect, databaseUrl } from './database'
import * as schema from './schema'

// Nothing listens here; the pool only connects on the first query.
const database = connect('postgres://app:secret@127.0.0.1:9/app')
const { options } = database.$client

afterAll(() => database.$client.end({ timeout: 1 }))

it('requires DATABASE_URL', () => {
  expect(() => databaseUrl({})).toThrow('DATABASE_URL is required')
})

it.each(['postgres://app@db/app', 'postgresql://app@db/app'])('accepts %s', (url) => {
  expect(databaseUrl({ DATABASE_URL: url })).toBe(url)
})

it('rejects a URL for another database without echoing it', () => {
  expect(() => databaseUrl({ DATABASE_URL: 'mysql://app:secret@db/app' })).toThrow(
    /^DATABASE_URL must be a postgres:\/\/ or postgresql:\/\/ URL$/,
  )
})

it('rejects a value that is not a URL', () => {
  expect(() => databaseUrl({ DATABASE_URL: 'secret' })).toThrow('DATABASE_URL must be a postgres:// or postgresql:// URL')
})

it('pools up to ten connections', () => {
  expect(options.max).toBe(10)
})

it('parses bigint columns as numbers', () => {
  expect(options.parsers[20]?.('42')).toBe(42)
})

it('parses numeric columns as numbers', () => {
  expect(options.parsers[1700]?.('1.5')).toBe(1.5)
})

it('keeps server notices out of the log', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  options.onnotice({ severity: 'NOTICE', message: 'schema "drizzle" already exists, skipping' })
  expect(log).not.toHaveBeenCalled()
})

it('has a migration for every schema change', async () => {
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')) as { entries: { idx: number }[] }
  const latest = String(journal.entries.at(-1)?.idx ?? 0).padStart(4, '0')
  const snapshot = JSON.parse(await readFile(`drizzle/meta/${latest}_snapshot.json`, 'utf8'))
  expect(await generateMigration(snapshot, generateDrizzleJson(schema))).toEqual([])
})
