import { loopback } from '../server/canonical-host.js'

export type SpacetimeConnection = {
  /** Origin of the SpacetimeDB host. Plain HTTP is accepted only for loopback or `internalHost`. */
  url: string
  database: string
  token: string
  /** Sent with every request, for example Cloudflare Access service-token headers. */
  headers?: Record<string, string>
  internalHost?: string
  fetch?: typeof fetch
}

export class SpacetimeRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SpacetimeRequestError'
  }
}

export function spacetimeDatabaseUrl(connection: Pick<SpacetimeConnection, 'url' | 'database' | 'internalHost'>, path = '') {
  const base = new URL(connection.url)
  const internal = /^[a-z][a-z0-9-]{1,63}$/.test(connection.internalHost ?? '') && base.hostname === connection.internalHost
  const local = base.protocol === 'http:' && (loopback(base.hostname) || internal)
  if ((!local && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('Invalid SpacetimeDB URL')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(connection.database)) throw new Error('Invalid SpacetimeDB database name')
  return new URL(`/v1/database/${connection.database}${path}`, base)
}

export async function callSpacetime(
  connection: SpacetimeConnection,
  name: string,
  arguments_: unknown[],
  options: { timeoutMs?: number } = {},
) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid SpacetimeDB procedure name')
  return request(connection, spacetimeDatabaseUrl(connection, `/call/${name}`), name, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(arguments_),
    timeoutMs: options.timeoutMs ?? 10_000,
  })
}

/** `spacetime-environment` publish headers, which SpacetimeDB stores with the module and keeps across later publishes. */
export function moduleEnvironmentHeaders(environment: Record<string, string>): [string, string][] {
  return Object.entries(environment).map(([key, value]) => {
    // A bare header value is visible ASCII without quotes, commas, or backslashes.
    if (!/^[!#-&(-+\--[\]-~]+$/.test(value)) throw new Error(`Invalid ${key} for the module environment`)
    return ['spacetime-environment', `${key}=${value}`]
  })
}

export type PublishSpacetimeModuleOptions = {
  environment?: Record<string, string>
  /** Accept an automatic migration that changes the schema in ways existing clients cannot read. */
  breakClients?: boolean
  timeoutMs?: number
}

/**
 * Publishes a JavaScript module through SpacetimeDB's migration planner: a missing database is created, an automatic
 * migration is applied, and a migration that needs manual steps or would break clients unasked is refused before
 * anything changes.
 */
export async function publishSpacetimeModule(
  connection: SpacetimeConnection,
  module: Uint8Array<ArrayBuffer>,
  options: PublishSpacetimeModuleOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 90_000
  const binary = { 'content-type': 'application/octet-stream' }
  const plan = await request(connection, spacetimeDatabaseUrl(connection, '/pre_publish?host_type=Js'), 'pre_publish', {
    method: 'POST',
    headers: binary,
    body: module,
    timeoutMs,
    allowNotFound: true,
  })
  const query = new URLSearchParams({ host_type: 'Js' })
  if (plan.status !== 404) {
    const result = (await plan.json()) as {
      AutoMigrate?: { token: string; break_clients: boolean }
      ManualMigrate?: { reason: string }
    }
    if (result.ManualMigrate) throw new Error(`SpacetimeDB database needs a manual migration: ${result.ManualMigrate.reason}`)
    if (!result.AutoMigrate) throw new Error('SpacetimeDB returned an unknown migration plan')
    if (result.AutoMigrate.break_clients) {
      if (!options.breakClients) throw new Error('SpacetimeDB migration would break existing clients; pass breakClients to accept it')
      query.set('policy', 'BreakClients')
      query.set('token', result.AutoMigrate.token)
    }
  }
  const environment = moduleEnvironmentHeaders(options.environment ?? {})
  await request(connection, spacetimeDatabaseUrl(connection, `?${query}`), 'publish', {
    method: 'PUT',
    headers: [...Object.entries(binary), ...environment],
    body: module,
    timeoutMs,
  })
}

/** Deletes the database; one that does not exist counts as already deleted, so cleanup can run repeatedly. */
export async function deleteSpacetimeDatabase(connection: SpacetimeConnection, options: { timeoutMs?: number } = {}) {
  await request(connection, spacetimeDatabaseUrl(connection), 'delete', {
    method: 'DELETE',
    headers: {},
    timeoutMs: options.timeoutMs ?? 15_000,
    allowNotFound: true,
  })
}

async function request(
  connection: SpacetimeConnection,
  url: URL,
  operation: string,
  init: { method: string; headers: HeadersInit; body?: BodyInit; timeoutMs: number; allowNotFound?: boolean },
) {
  const headers = new Headers(init.headers)
  for (const [name, value] of Object.entries(connection.headers ?? {})) headers.set(name, value)
  headers.set('authorization', `Bearer ${connection.token}`)
  const response = await (connection.fetch ?? fetch)(url, {
    method: init.method,
    headers,
    ...(init.body === undefined ? {} : { body: init.body }),
    // A redirect would resend the bearer token to wherever it points.
    redirect: 'manual',
    signal: AbortSignal.timeout(init.timeoutMs),
  })
  if (response.ok || (init.allowNotFound && response.status === 404)) return response
  throw new SpacetimeRequestError(
    response.status,
    `SpacetimeDB ${operation} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
  )
}
