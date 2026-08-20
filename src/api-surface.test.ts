import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as auth from './auth/index.js'
import * as authClient from './auth/client.js'
import * as authReact from './auth/react.js'
import * as build from './build/index.js'
import * as conformance from './conformance/index.js'
import * as create from './create/index.js'
import * as database from './database/index.js'
import * as databasePostgres from './database/postgres.js'
import * as databaseSqlite from './database/sqlite.js'
import * as email from './email/index.js'
import * as policy from './policy/index.js'
import * as posthog from './posthog/index.js'
import * as posthogClient from './posthog/client.js'
import * as posthogProxy from './posthog/proxy.js'
import * as posthogReact from './posthog/react.js'
import * as posthogServer from './posthog/server.js'
import * as previewDokploy from './preview/dokploy.js'
import * as previewGithub from './preview/github.js'
import * as realtime from './realtime/index.js'
import * as realtimeClient from './realtime/client.js'
import * as realtimeReact from './realtime/react.js'
import * as runtime from './runtime/index.js'
import * as server from './server/index.js'
import * as tanstackQuery from './tanstack/query.js'
import * as tanstackMiddleware from './tanstack/middleware.js'
import * as tanstackServer from './tanstack/server.js'
import * as uploads from './uploads/index.js'

// Widening the published surface is a semantic-version commitment, so it has to arrive as a reviewed diff here.
const surface = {
  './auth': [
    'acceptedOrigins',
    'configuredProviderOptions',
    'configuredProviders',
    'forwardedOrigin',
    'parseOrigin',
    'persistedSecret',
    'providerCredentials',
    'randomId',
    'randomToken',
    'requireSameOrigin',
    'standardRateLimitOptions',
    'standardSessionOptions',
    'trustedOrigins',
    'validSameOriginRequest',
  ],
  './auth/client': ['authFailureMessage', 'classifySignInFailure'],
  './auth/react': ['useAuthAction'],
  './build': ['checkServerAssets', 'loadServerAssetsConfig', 'syncServerAssets'],
  './conformance': [
    'ConformanceError',
    'assertAuthSecretConformance',
    'assertDatabaseTargetConformance',
    'assertHealthHandlerConformance',
    'assertMutationOriginConformance',
    'assertPostHogBrowserConformance',
    'assertPostHogRequestConformance',
    'assertRateLimitStoreConformance',
    'assertRealtimePublisherConformance',
    'assertRealtimeTokenConformance',
    'assertSmtpConfigConformance',
    'assertSqliteConformance',
  ],
  './create': ['runCreateCli'],
  './database': ['bundledDirectory', 'databaseTarget'],
  './database/postgres': [
    'closeDrizzlePostgres',
    'migrateDrizzlePostgres',
    'openDrizzlePostgres',
    'postgresRateLimitStore',
    'redactedPostgresUrl',
  ],
  './database/sqlite': ['closeDrizzleSqlite', 'configureSqlite', 'openDrizzleSqlite', 'openSqliteClient', 'sqliteRateLimitStore'],
  './email': ['createSmtpDelivery', 'createSmtpTransport', 'smtpConfigFromEnvironment'],
  './policy': ['checkRepositoryPolicy', 'renderedPolicyFiles', 'syncRepositoryPolicy'],
  './posthog': [
    'POSTHOG_DISTINCT_ID_HEADER',
    'POSTHOG_SESSION_ID_HEADER',
    'definePostHogCoverage',
    'postHogEnvironment',
    'postHogHttpUrl',
    'postHogRequestContext',
  ],
  './posthog/client': [
    'POSTHOG_BROWSER_DEFAULTS',
    'POSTHOG_DISTINCT_ID_HEADER',
    'POSTHOG_SESSION_ID_HEADER',
    'postHogBrowserHeaders',
    'postHogBrowserOptions',
  ],
  './posthog/proxy': ['POSTHOG_DEFAULT_INGEST_PATH', 'postHogIngestProxy'],
  './posthog/react': ['PostHogBetterAuthIdentity', 'PostHogIntegration'],
  './posthog/server': [
    'createManagedPostHogServerTelemetry',
    'createPostHogRpcLogger',
    'createPostHogServerClient',
    'installPostHogServerTelemetryShutdown',
    'shutdownPostHogServerClient',
  ],
  './preview/dokploy': ['DokployClient', 'DokployPreviewManager', 'dokployPreviewFromEnvironment', 'previewHostname', 'pullRequestNumber'],
  './preview/github': ['reportPreviewStatus'],
  './realtime': [
    'CentrifugoPublisher',
    'connectRealtimeClient',
    'createSameOriginRealtimeClient',
    'openRealtimeSubscription',
    'requestRealtimeTicket',
    'sameOriginWebSocketUrl',
    'signRealtimeToken',
    'watchServerChannel',
    'watchSubscriptionPresence',
  ],
  './realtime/client': [
    'connectRealtimeClient',
    'createSameOriginRealtimeClient',
    'openRealtimeSubscription',
    'requestRealtimeTicket',
    'sameOriginWebSocketUrl',
    'watchServerChannel',
    'watchSubscriptionPresence',
  ],
  './realtime/react': ['useConnectedRealtimeClient', 'useRealtimePresence', 'useRealtimeSubscription'],
  './runtime': [
    'caddyRealtimeProxy',
    'caddyRuntimeEnvironment',
    'centrifugoEnvironment',
    'runRealtimeDev',
    'runRealtimeStack',
    'superviseProcesses',
  ],
  './server': [
    'InfrastructureError',
    'canonicalRedirect',
    'clearGlobalSingleton',
    'createRateLimit',
    'createRpc',
    'databaseHealthFailure',
    'errorHasCode',
    'forwardedClientAddress',
    'globalAsyncSingleton',
    'globalSingleton',
    'healthResponse',
    'infrastructureDiagnostic',
    'infrastructureFailure',
    'memoryRateLimitStore',
    'peekGlobalSingleton',
    'rateLimitTable',
    'safeInfrastructureError',
  ],
  './tanstack/query': ['createStackQueryClient', 'queryErrorMessage'],
  './tanstack/middleware': ['canonicalHostMiddleware', 'canonicalHostRequest'],
  './tanstack/server': [
    'betterAuthHandlers',
    'canonicalHostMiddleware',
    'canonicalHostRequest',
    'createTanStackRpc',
    'requireTanStackMutationOrigin',
    'tanStackHealthHandler',
  ],
  './uploads': ['createTusUpload', 'startTusUpload', 'tusResponse', 'tusResponseMessage', 'uploadWithTus'],
} satisfies Record<string, string[]>

const entrypoints: Record<keyof typeof surface, object> = {
  './auth': auth,
  './auth/client': authClient,
  './auth/react': authReact,
  './build': build,
  './conformance': conformance,
  './create': create,
  './database': database,
  './database/postgres': databasePostgres,
  './database/sqlite': databaseSqlite,
  './email': email,
  './policy': policy,
  './posthog': posthog,
  './posthog/client': posthogClient,
  './posthog/proxy': posthogProxy,
  './posthog/react': posthogReact,
  './posthog/server': posthogServer,
  './preview/dokploy': previewDokploy,
  './preview/github': previewGithub,
  './realtime': realtime,
  './realtime/client': realtimeClient,
  './realtime/react': realtimeReact,
  './runtime': runtime,
  './server': server,
  './tanstack/query': tanstackQuery,
  './tanstack/middleware': tanstackMiddleware,
  './tanstack/server': tanstackServer,
  './uploads': uploads,
}

describe('published API surface', () => {
  it('exports exactly the recorded names from every entrypoint', () => {
    const actual = Object.fromEntries(Object.entries(entrypoints).map(([path, module]) => [path, Object.keys(module).toSorted()]))
    expect(actual).toEqual(surface)
  })

  it('records every entrypoint the package publishes', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { exports: Record<string, unknown> }
    const published = Object.keys(manifest.exports).filter((path) => !path.startsWith('./config/'))
    expect(published.toSorted()).toEqual(Object.keys(surface).toSorted())
  })
})
