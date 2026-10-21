import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as config from './config.js'
import * as auth from './auth/index.js'
import type { ProviderEnvironmentOptions, SessionOptions, StandardAccountOptions, StandardEmailAndPasswordOptions } from './auth/index.js'
import * as authClient from './auth/client.js'
import * as authReact from './auth/react.js'
import * as conformance from './conformance/index.js'
import * as database from './database/index.js'
import * as databaseLibsql from './database/libsql.js'
import * as databasePostgres from './database/postgres.js'
import * as databaseSqlite from './database/sqlite.js'
import * as email from './email/index.js'
import * as posthog from './posthog/index.js'
import * as posthogProxy from './posthog/proxy.js'
import * as posthogReact from './posthog/react.js'
import * as posthogServer from './posthog/server.js'
import * as previewDokploy from './preview/dokploy.js'
import * as realtime from './realtime/index.js'
import * as realtimeClient from './realtime/client.js'
import * as realtimeReact from './realtime/react.js'
import * as runtime from './runtime/index.js'
import * as server from './server/index.js'
import * as spacetime from './spacetime/index.js'
import * as tanstackClient from './tanstack/client.js'
import * as tanstackMiddleware from './tanstack/middleware.js'
import * as tanstackServer from './tanstack/server.js'
import * as uploads from './uploads/index.js'

type AuthConfiguration = {
  account: StandardAccountOptions
  emailAndPassword: StandardEmailAndPasswordOptions
  providerEnvironment: ProviderEnvironmentOptions
  session: SessionOptions
}

const authConfiguration: AuthConfiguration = { account: {}, emailAndPassword: {}, providerEnvironment: {}, session: {} }
void authConfiguration

const betterAuthAccountOptions: { accountLinking?: { trustedProviders?: string[] } } = auth.standardAccountOptions({
  accountLinking: { trustedProviders: ['google', 'discord'] },
})
void betterAuthAccountOptions

// Widening the published surface is a semantic-version commitment, so it has to arrive as a reviewed diff here.
const surface = {
  './config': [
    'betterAuth',
    'defineConfig',
    'defineIntegration',
    'email',
    'libsql',
    'oxfmt',
    'oxlint',
    'playwright',
    'postgres',
    'posthog',
    'react',
    'realtime',
    'spacetimeDB',
    'sqlite',
    'tanstackQuery',
    'tanstackStart',
    'typescript',
    'uploads',
    'vite',
    'vitest',
  ],
  './auth': [
    'configuredProviderOptions',
    'configuredProviders',
    'forwardedOrigin',
    'parseOrigin',
    'persistedSecret',
    'providerCredentials',
    'publicOrigin',
    'randomId',
    'randomToken',
    'standardAccountOptions',
    'standardEmailAndPasswordOptions',
    'standardRateLimitOptions',
    'standardSessionOptions',
    'trustedOrigins',
    'validSameOriginRequest',
  ],
  './auth/client': ['authFailureMessage', 'classifyAuthCallbackFailure', 'classifySignInFailure', 'localRedirectPath'],
  './auth/react': ['useAuthAction'],
  './conformance': ['assertDatabaseTargetConformance', 'assertMutationOriginConformance', 'assertSqliteConformance'],
  './database': ['bundledDirectory', 'databaseTarget'],
  './database/libsql': ['openDrizzleLibsql'],
  './database/postgres': ['openDrizzlePostgres'],
  './database/sqlite': ['closeDrizzleSqlite', 'openDrizzleSqlite', 'openSqliteClient'],
  './email': ['createSmtpDelivery', 'smtpConfigFromEnvironment', 'standardAuthEmails'],
  './posthog': ['postHogEnvironment', 'postHogRequestContext'],
  './posthog/proxy': ['postHogIngestProxy'],
  './posthog/react': ['PostHogBetterAuthIdentity', 'PostHogIntegration'],
  './posthog/server': [
    'createManagedPostHogServerTelemetry',
    'createPostHogRpcLogger',
    'createPostHogRpcObserver',
    'installPostHogServerTelemetryShutdown',
  ],
  './preview/dokploy': ['DokployClient', 'dokployPreviewFromEnvironment', 'loadPreviewAppSecrets', 'pullRequestNumber'],
  './realtime': ['CentrifugoPublisher', 'realtimeEnvironment', 'signRealtimeToken'],
  './realtime/client': ['createSameOriginRealtimeClient', 'requestRealtimeTicket', 'watchServerChannel'],
  './realtime/react': ['useConnectedRealtimeClient', 'useRealtimeSubscription'],
  './runtime': ['caddyRealtimeProxy', 'persistedRealtimeSecret', 'runRealtimeStack'],
  './server': [
    'clearGlobalSingleton',
    'databaseHealthFailure',
    'errorHasCode',
    'globalAsyncSingleton',
    'globalSingleton',
    'healthResponse',
    'peekGlobalSingleton',
  ],
  './spacetime': [
    'SpacetimeRequestError',
    'callSpacetime',
    'deleteSpacetimeDatabase',
    'moduleEnvironmentHeaders',
    'publishSpacetimeModule',
    'spacetimeDatabaseUrl',
  ],
  './tanstack/client': ['chunkRecoveryScript'],
  './tanstack/middleware': ['canonicalHostMiddleware', 'serverFunctionIdentityMiddleware', 'staleServerFunctionMiddleware'],
  './tanstack/server': ['createTanStackRpc', 'requireTanStackMutationOrigin', 'tanStackHealthHandler'],
  './uploads': ['createTusUpload', 'startTusUpload'],
} satisfies Record<string, string[]>

const entrypoints: Record<keyof typeof surface, object> = {
  './config': config,
  './auth': auth,
  './auth/client': authClient,
  './auth/react': authReact,
  './conformance': conformance,
  './database': database,
  './database/libsql': databaseLibsql,
  './database/postgres': databasePostgres,
  './database/sqlite': databaseSqlite,
  './email': email,
  './posthog': posthog,
  './posthog/proxy': posthogProxy,
  './posthog/react': posthogReact,
  './posthog/server': posthogServer,
  './preview/dokploy': previewDokploy,
  './realtime': realtime,
  './realtime/client': realtimeClient,
  './realtime/react': realtimeReact,
  './runtime': runtime,
  './server': server,
  './spacetime': spacetime,
  './tanstack/client': tanstackClient,
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
