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

export type RealtimeTokenSigner = (subject: string, claims: Record<string, unknown>) => string | Promise<string>

export type RealtimeTokenConformanceOptions = { secret: string; maxTtlSeconds?: number; now?: number }

export async function assertRealtimeTokenConformance(sign: RealtimeTokenSigner, options: RealtimeTokenConformanceOptions) {
  const now = options.now ?? Math.floor(Date.now() / 1000)
  const maxTtlSeconds = options.maxTtlSeconds ?? 60 * 60
  const token = await sign('person-123', { channel: 'room:1' })
  const { header, payload, signed, signature } = decodeToken(token)

  if (header.alg !== 'HS256') {
    throw new ConformanceError('realtime token algorithm', `expected HS256, received ${JSON.stringify(header.alg)}`)
  }
  if (payload.sub !== 'person-123') {
    throw new ConformanceError('realtime token subject', 'token must bind the subject it was signed for')
  }
  if (payload.channel !== 'room:1') {
    throw new ConformanceError('realtime token claims', 'token must carry the claims it was signed with')
  }
  if (typeof payload.exp !== 'number') {
    throw new ConformanceError('realtime token expiry', 'token must expire')
  }
  if (payload.exp <= now) {
    throw new ConformanceError('realtime token expiry', 'token expired before it was issued')
  }
  if (payload.exp - now > maxTtlSeconds) {
    throw new ConformanceError('realtime token expiry', `token outlives the ${maxTtlSeconds} second maximum`)
  }
  if (!(await verifyHmac(signed, signature, options.secret))) {
    throw new ConformanceError('realtime token signature', 'token is not signed with the shared Centrifugo secret')
  }

  const other = decodeToken(await sign('person-456', { channel: 'room:1' })).payload
  if (other.sub === payload.sub) {
    throw new ConformanceError('realtime token subject', 'every subject received the same identity')
  }
}

function decodeToken(token: string) {
  const segments = token.split('.')
  if (segments.length !== 3) throw new ConformanceError('realtime token format', 'expected a three-segment JWT')
  const [header, claims, signature] = segments as [string, string, string]
  return {
    header: decodeSegment(header, 'header'),
    payload: decodeSegment(claims, 'payload'),
    signed: `${header}.${claims}`,
    signature,
  }
}

function decodeSegment(segment: string, name: string): Record<string, unknown> {
  try {
    const padded = segment
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(segment.length / 4) * 4, '=')
    const value: unknown = JSON.parse(atob(padded))
    if (value && typeof value === 'object') return value as Record<string, unknown>
  } catch (error) {
    throw new ConformanceError('realtime token format', `${name} is not base64url JSON`, { cause: error })
  }
  throw new ConformanceError('realtime token format', `${name} is not an object`)
}

async function verifyHmac(signed: string, signature: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(signed)))
  const expected = btoa(String.fromCharCode(...digest))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  return expected === signature
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

export function assertPostHogBrowserConformance(options: Record<string, unknown>) {
  if (typeof options.api_host !== 'string' || !options.api_host.trim()) {
    throw new ConformanceError('PostHog browser initialization', 'api_host must be configured')
  }
  if (typeof options.ui_host !== 'string' || !options.ui_host.trim()) {
    throw new ConformanceError('PostHog browser initialization', 'ui_host must be configured')
  }
  if (typeof options.defaults !== 'string' || !options.defaults.trim()) {
    throw new ConformanceError('PostHog browser initialization', 'SDK defaults must be pinned')
  }
  if (!options.capture_exceptions) {
    throw new ConformanceError('PostHog browser initialization', 'exception autocapture must be enabled')
  }
  if (options.capture_pageview !== 'history_change') {
    throw new ConformanceError('PostHog browser initialization', 'SPA pageviews must follow history changes')
  }
  if (options.person_profiles !== 'identified_only') {
    throw new ConformanceError('PostHog browser initialization', 'person profiles must be limited to identified users')
  }
  const recording = options.session_recording
  if (!recording || typeof recording !== 'object' || !('maskAllInputs' in recording) || recording.maskAllInputs !== true) {
    throw new ConformanceError('PostHog browser initialization', 'session replay must mask all inputs by default')
  }
}

type PostHogContextParser = (
  request: Request,
  options?: { authenticatedDistinctId?: string; allowAnonymousDistinctId?: boolean },
) => { distinctId?: string; sessionId?: string; properties: { $session_id?: string } }

export function assertPostHogRequestConformance(parse: PostHogContextParser) {
  const matched = parse(postHogRequest('person-123', 'session-456'), { authenticatedDistinctId: 'person-123' })
  if (matched.distinctId !== 'person-123' || matched.sessionId !== 'session-456' || matched.properties.$session_id !== 'session-456') {
    throw new ConformanceError('authenticated PostHog request', 'expected verified identity and session propagation')
  }
  const spoofed = parse(postHogRequest('attacker', 'session-456'), { authenticatedDistinctId: 'person-123' })
  if (spoofed.distinctId !== undefined) {
    throw new ConformanceError('spoofed PostHog request', 'unverified distinct id was trusted')
  }
  const malformed = parse(postHogRequest('person-123', 'x'.repeat(129)), { authenticatedDistinctId: 'person-123' })
  if (malformed.sessionId !== undefined || malformed.properties.$session_id !== undefined) {
    throw new ConformanceError('malformed PostHog request', 'unbounded session id was propagated')
  }
}

function postHogRequest(distinctId: string, sessionId: string) {
  return new Request('https://app.example/action', {
    headers: { 'x-posthog-distinct-id': distinctId, 'x-posthog-session-id': sessionId },
  })
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
