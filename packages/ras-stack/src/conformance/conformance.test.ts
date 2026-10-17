import { describe, expect, it } from 'vitest'
import { requireSameOrigin } from '../auth/origins.js'
import { databaseTarget } from '../database/index.js'
import { openSqliteClient } from '../database/sqlite.js'
import { assertDatabaseTargetConformance, assertMutationOriginConformance, assertSqliteConformance } from './index.js'

describe('consumer conformance assertions', () => {
  it('accepts the shared mutation-origin composition', async () => {
    await expect(assertMutationOriginConformance((request) => requireSameOrigin(request))).resolves.toBeUndefined()
  })

  it('identifies a permissive mutation-origin composition', async () => {
    await expect(assertMutationOriginConformance(() => undefined)).rejects.toThrow('cross-origin request: expected request to be rejected')
  })

  it('accepts a standard native SQLite connection', async () => {
    const client = openSqliteClient(':memory:')
    await expect(assertSqliteConformance((name) => client.pragma(name, { simple: true }))).resolves.toBeUndefined()
    client.close()
  })

  it('identifies unsafe SQLite settings', async () => {
    await expect(
      assertSqliteConformance((name) => ({ journal_mode: 'delete', synchronous: 0, busy_timeout: 0, foreign_keys: 0 })[name]),
    ).rejects.toThrow('SQLite journal mode: expected wal or memory, received delete')
  })

  it('accepts the shared dual-provider database target', () => {
    expect(() => assertDatabaseTargetConformance(databaseTarget)).not.toThrow()
  })

  it('identifies a SQLite-only database target', () => {
    expect(() => assertDatabaseTargetConformance(({ sqliteFile }) => ({ provider: 'sqlite', file: sqliteFile }))).toThrow(
      'PostgreSQL database target: expected the configured postgres: URL',
    )
  })
})
