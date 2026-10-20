import type { databaseTarget } from '../database/index.js'
import { resolveSqlitePragmas, type SqlitePragmas } from '../database/pragmas.js'

export type { DatabaseTarget } from '../database/index.js'

class ConformanceError extends Error {
  constructor(
    readonly scenario: string,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(`${scenario}: ${message}`, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ConformanceError'
  }
}

export async function assertMutationOriginConformance(
  guard: (request: Request) => void | Promise<void>,
  options: { trustForwardedHeaders?: boolean } = {},
) {
  await accepted('same-origin request', () =>
    guard(
      new Request('https://app.example/action', {
        method: 'POST',
        headers: { origin: 'https://app.example', 'sec-fetch-site': 'same-origin' },
      }),
    ),
  )
  await rejected('cross-origin request', () =>
    guard(
      new Request('https://app.example/action', {
        method: 'POST',
        headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
      }),
    ),
  )
  await rejected('missing-origin request', () => guard(new Request('https://app.example/action', { method: 'POST' })))
  if (!options.trustForwardedHeaders) {
    await rejected('spoofed forwarded-origin request', () =>
      guard(
        new Request('https://app.example/action', {
          method: 'POST',
          headers: {
            origin: 'https://attacker.example',
            'x-forwarded-host': 'attacker.example',
            'x-forwarded-proto': 'https',
          },
        }),
      ),
    )
  }
}

const synchronousLevels = { OFF: 0, NORMAL: 1, FULL: 2, EXTRA: 3 } satisfies Record<Required<SqlitePragmas>['synchronous'], number>

export type SqlitePragmaReader = (name: 'journal_mode' | 'synchronous' | 'busy_timeout' | 'foreign_keys') => unknown

export async function assertSqliteConformance(readPragma: SqlitePragmaReader) {
  const values = {
    journalMode: String(await readPragma('journal_mode')).toLowerCase(),
    synchronous: Number(await readPragma('synchronous')),
    busyTimeout: Number(await readPragma('busy_timeout')),
    foreignKeys: Number(await readPragma('foreign_keys')),
  }
  const expected = resolveSqlitePragmas()
  const journalMode = expected.journalMode.toLowerCase()
  if (values.journalMode !== journalMode && values.journalMode !== 'memory') {
    throw new ConformanceError('SQLite journal mode', `expected ${journalMode} or memory, received ${values.journalMode}`)
  }
  const synchronous = synchronousLevels[expected.synchronous]
  if (values.synchronous !== synchronous) {
    throw new ConformanceError(
      'SQLite synchronous mode',
      `expected ${expected.synchronous} (${synchronous}), received ${values.synchronous}`,
    )
  }
  if (values.busyTimeout !== expected.busyTimeout) {
    throw new ConformanceError('SQLite busy timeout', `expected ${expected.busyTimeout}, received ${values.busyTimeout}`)
  }
  if (values.foreignKeys !== 1) {
    throw new ConformanceError('SQLite foreign keys', `expected enabled (1), received ${values.foreignKeys}`)
  }
}

export type DatabaseTargetResolver = typeof databaseTarget

export function assertDatabaseTargetConformance(resolve: DatabaseTargetResolver) {
  const sqliteFile = '/data/application.sqlite'
  const sqlite = resolve({ sqliteFile })
  if (sqlite.provider !== 'sqlite' || sqlite.file !== sqliteFile) {
    throw new ConformanceError('default database target', 'expected the configured SQLite file')
  }

  for (const url of ['postgres://user:secret@database/application', 'postgresql://user:secret@database/application']) {
    const target = resolve({ databaseUrl: url, sqliteFile })
    if (target.provider !== 'postgres' || target.url !== url) {
      throw new ConformanceError('PostgreSQL database target', `expected the configured ${new URL(url).protocol} URL`)
    }
  }

  try {
    resolve({ databaseUrl: 'https://database.example/application', sqliteFile })
  } catch {
    return
  }
  throw new ConformanceError('invalid database target', 'expected a non-PostgreSQL URL to be rejected')
}

async function accepted(scenario: string, work: () => void | Promise<void>) {
  try {
    await work()
  } catch (error) {
    throw new ConformanceError(scenario, 'expected request to be accepted', { cause: error })
  }
}

async function rejected(scenario: string, work: () => void | Promise<void>) {
  try {
    await work()
  } catch {
    return
  }
  throw new ConformanceError(scenario, 'expected request to be rejected')
}
