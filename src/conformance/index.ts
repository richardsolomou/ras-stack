export class ConformanceError extends Error {
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

export type HealthHandlerFactory = (check: () => void | Promise<void>) => () => Response | Promise<Response>

export async function assertHealthHandlerConformance(createHandler: HealthHandlerFactory) {
  const healthy = await createHandler(() => undefined)()
  if (healthy.status !== 200) throw new ConformanceError('healthy dependency', `expected status 200, received ${healthy.status}`)
  const healthyBody = await responseBody(healthy, 'healthy dependency')
  if (healthyBody.ok !== true) throw new ConformanceError('healthy dependency', 'response body must contain ok: true')

  const privateMessage = 'password=private-diagnostic'
  const unavailable = await createHandler(() => Promise.reject(new Error(privateMessage)))()
  if (unavailable.status !== 503) {
    throw new ConformanceError('unavailable dependency', `expected status 503, received ${unavailable.status}`)
  }
  const unavailableText = await unavailable.text()
  if (unavailableText.includes(privateMessage)) {
    throw new ConformanceError('unavailable dependency', 'response exposed the private diagnostic message')
  }
  let unavailableBody: unknown
  try {
    unavailableBody = JSON.parse(unavailableText)
  } catch (error) {
    throw new ConformanceError('unavailable dependency', 'response body must be JSON', { cause: error })
  }
  if (!unavailableBody || typeof unavailableBody !== 'object' || !('ok' in unavailableBody) || unavailableBody.ok !== false) {
    throw new ConformanceError('unavailable dependency', 'response body must contain ok: false')
  }
}

export type SqlitePragmaReader = (name: 'journal_mode' | 'synchronous' | 'busy_timeout' | 'foreign_keys') => unknown

export async function assertSqliteConformance(readPragma: SqlitePragmaReader) {
  const values = {
    journalMode: String(await readPragma('journal_mode')).toLowerCase(),
    synchronous: Number(await readPragma('synchronous')),
    busyTimeout: Number(await readPragma('busy_timeout')),
    foreignKeys: Number(await readPragma('foreign_keys')),
  }
  if (values.journalMode !== 'wal' && values.journalMode !== 'memory') {
    throw new ConformanceError('SQLite journal mode', `expected wal or memory, received ${values.journalMode}`)
  }
  if (values.synchronous !== 2) {
    throw new ConformanceError('SQLite synchronous mode', `expected FULL (2), received ${values.synchronous}`)
  }
  if (values.busyTimeout !== 5000) {
    throw new ConformanceError('SQLite busy timeout', `expected 5000, received ${values.busyTimeout}`)
  }
  if (values.foreignKeys !== 1) {
    throw new ConformanceError('SQLite foreign keys', `expected enabled (1), received ${values.foreignKeys}`)
  }
}

export type DatabaseTarget = { provider: 'sqlite'; file: string } | { provider: 'postgres'; url: string }

export type DatabaseTargetResolver = (options: { databaseUrl?: string; sqliteFile: string }) => DatabaseTarget

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

async function responseBody(response: Response, scenario: string): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object') return body as Record<string, unknown>
  } catch (error) {
    throw new ConformanceError(scenario, 'response body must be JSON', { cause: error })
  }
  throw new ConformanceError(scenario, 'response body must be an object')
}
