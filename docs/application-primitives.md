# Application primitives

[Back to the ras-stack overview](../README.md)

These entrypoints share application infrastructure while leaving upstream objects and product behavior in the consuming application.

## Authentication and request security

The auth entrypoint provides options and utilities rather than an auth factory. The application keeps its complete Better Auth configuration:

```ts
import { betterAuth } from 'better-auth'
import {
  configuredProviderOptions,
  providerCredentials,
  standardAccountOptions,
  standardEmailAndPasswordOptions,
  standardRateLimitOptions,
  standardSessionOptions,
  trustedOrigins,
} from 'ras-stack/auth'

const auth = betterAuth({
  database,
  plugins,
  account: standardAccountOptions(),
  emailAndPassword: standardEmailAndPasswordOptions({ requireEmailVerification: true }),
  socialProviders: configuredProviderOptions(['google', 'discord']),
  session: standardSessionOptions(),
  rateLimit: standardRateLimitOptions({ '/sign-up/email': { window: 60, max: 10 } }),
  trustedOrigins: trustedOrigins({
    configured: [process.env.APP_URL],
    trustForwardedHeaders: true,
  }),
})
```

`standardAccountOptions` encrypts stored OAuth access and refresh tokens. Better Auth does not encrypt stored ID tokens with this option. Better Auth retains ownership of its verified-email linking safeguards, while applications can pass an explicit linking policy when their product requires one:

```ts
account: standardAccountOptions({
  accountLinking: {
    disableImplicitLinking: true,
    allowDifferentEmails: true,
    updateUserInfoOnLink: true,
  },
})
```

`standardSessionOptions` accepts partial overrides when an application needs a different lifetime without restating the update interval:

```ts
session: standardSessionOptions({ expiresIn: 60 * 60 * 24 * 30 })
```

`standardEmailAndPasswordOptions` enables password authentication and revokes all existing sessions after a successful password reset. It does not choose password length, email-verification requirements, automatic sign-in, or reset-token lifetime. Applications can override either default explicitly.

For an existing rolling deployment, drain replicas that do not enable token encryption before the new version accepts traffic. Those replicas cannot read encrypted tokens, and rolling back after an encrypted write has the same limitation.

Provider credentials normally use names such as `GOOGLE_CLIENT_ID`. Applications with a namespace can supply a prefix, and deployments can reject partial credential pairs instead of silently disabling the provider:

```ts
const google = providerCredentials('google', process.env, { prefix: 'AUTH_', rejectPartial: true })
```

The optional TanStack entrypoints bind the shared primitives to TanStack Start's ambient request and provide the common Query client default:

```ts
import { createStackQueryClient } from 'ras-stack/tanstack/query'
import { canonicalHostMiddleware } from 'ras-stack/tanstack/middleware'
import { betterAuthHandlers, createTanStackRpc, requireTanStackMutationOrigin, tanStackHealthHandler } from 'ras-stack/tanstack/server'

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: (request) =>
    requireTanStackMutationOrigin(
      {
        configured: [process.env.APP_URL],
        trustForwardedHeaders: true,
      },
      request,
    ),
})

export const queryClient = createStackQueryClient()

export const authHandlers = betterAuthHandlers(() => app().auth)
export const healthHandler = tanStackHealthHandler(() => app().database.get(sql`SELECT 1`))
export const canonicalHost = canonicalHostMiddleware(() => ({ canonicalUrl: process.env.APP_URL }))
```

Applications still own their auth clients, authorization, file-route declarations, router, logging, health-check work, and Query configuration. Both integrations remain optional, and their upstream libraries remain directly accessible.

Import middleware used by `src/start.ts` from `ras-stack/tanstack/middleware`. That entrypoint is safe for TanStack's client transform; `ras-stack/tanstack/server` also exports server-only request helpers and must stay behind server boundaries.

Only enable `trustForwardedHeaders` behind a proxy that replaces incoming forwarded headers. Otherwise a client could choose the origin used by the check.

### Rate limiting the application's own routes

`standardRateLimitOptions` covers the Better Auth routes. The server functions and realtime token routes an application writes are its own, so `createRateLimit` composes into the same `requireMutation` hook the origin check already uses:

```ts
import { createRateLimit, forwardedClientAddress } from 'ras-stack/server'
import { sqliteRateLimitStore } from 'ras-stack/database/sqlite'

const limitMutations = createRateLimit({
  store: sqliteRateLimitStore(database.$client),
  rule: { window: 60, max: 60 },
  scope: 'mutations',
  identify: (request) => sessionUserId(request) ?? forwardedClientAddress(request, { trustForwardedHeaders: true }),
})

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: async (request) => {
    requireTanStackMutationOrigin({ configured: [process.env.APP_URL], trustForwardedHeaders: true }, request)
    await limitMutations(request)
  },
})
```

Counters are shared rather than per-process, so replicas enforce one budget between them. Use `postgresRateLimitStore(client)` when the deployment runs more than one replica; `memoryRateLimitStore()` is for development and tests, where each process keeps its own count. Applications own the table, as they own every other schema:

```sql
CREATE TABLE rate_limit (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at BIGINT NOT NULL);
```

Requests over the limit are rejected with a `429` carrying `Retry-After`. A client the application cannot identify is rejected with a `403`, and a store outage raises a retryable `InfrastructureError` rather than blaming the client, so it classifies with every other infrastructure failure. Both defaults fail closed; `onUnidentified` and `onUnavailable` accept `'allow'` where availability matters more.

Because the store is the part that has to be correct under concurrent replicas, it has its own conformance suite. Run it against the real database rather than trusting the wiring:

```ts
import { assertRateLimitStoreConformance } from 'ras-stack/conformance'

await assertRateLimitStoreConformance(postgresRateLimitStore(client))
```

Infrastructure boundaries can keep approved client output separate from private causes:

```ts
import { InfrastructureError, infrastructureDiagnostic, infrastructureFailure } from 'ras-stack/server'

throw new InfrastructureError('smtp_unavailable', 'email is temporarily unavailable', {
  cause: transportError,
  retryable: true,
})

const publicFailure = infrastructureFailure(error, {
  code: 'internal_error',
  message: 'something went wrong',
  retryable: false,
})
logger.error(infrastructureDiagnostic(error), 'infrastructure request failed')
```

Only `InfrastructureError.publicMessage` is treated as approved for clients. Unknown failures use the caller's fallback; diagnostics are for application-owned logging and telemetry, never response serialization.

Browser auth flows can share failure classification, safe local return destinations, and pending/error state without sharing forms or navigation:

```tsx
import { classifyAuthCallbackFailure, classifySignInFailure, localRedirectPath } from 'ras-stack/auth/client'
import { useAuthAction } from 'ras-stack/auth/react'

const signIn = useAuthAction({ failureMessage: (failure) => messageFor(classifySignInFailure(failure)) })
const result = await signIn.run(() => authClient.signIn.email({ email, password }))
if (!result.error) await navigateAfterSignIn(localRedirectPath(search.next) ?? '/')

const callbackMessage = messageFor(classifyAuthCallbackFailure(search.error))
```

The callback classifier normalizes the redirect codes emitted by Better Auth 1.6 and 1.7, including their two spellings of an OAuth email mismatch. Applications still choose the user-facing message.

Applications retain field models, validation, password-reset disclosure policy, two-factor transitions, telemetry, copy, and success navigation.

The auth secret is worth checking in a consumer test, because a secret that changes between restarts signs out every session and a short one is guessable, and neither shows up until production:

```ts
import { assertAuthSecretConformance } from 'ras-stack/conformance'

await assertAuthSecretConformance((environment) => persistedSecret({ directory, environment }))
```

It checks that the secret is long and random-looking, that repeated calls return the same value, and that `AUTH_SECRET` takes precedence over a generated one.

## Database lifecycle

The SQLite entrypoint owns the native client lifecycle, standard safety PRAGMAs, and optional Drizzle migrations while returning the upstream typed database:

```ts
import { bundledDirectory } from 'ras-stack/database'
import { openDrizzleSqlite } from 'ras-stack/database/sqlite'

const database = openDrizzleSqlite({
  file,
  schema,
  migrationsFolder: bundledDirectory({
    developmentUrl: new URL('../../drizzle', import.meta.url),
    production: import.meta.env.PROD,
    name: 'drizzle',
  }),
})
```

Applications retain their schema, migrations, database path, repositories, transactions, and driver selection. Dual-database applications can use `openSqliteClient()` and `configureSqlite()` beneath their own wrapper without forcing PostgreSQL through a shared database interface.

The PostgreSQL entrypoint applies the same boundary to Postgres.js and Drizzle while returning both native objects:

```ts
import { databaseTarget } from 'ras-stack/database'
import { closeDrizzlePostgres, migrateDrizzlePostgres, openDrizzlePostgres } from 'ras-stack/database/postgres'

const target = databaseTarget({ databaseUrl: process.env.DATABASE_URL, sqliteFile })
if (target.provider === 'postgres') {
  const connection = openDrizzlePostgres({ url: target.url, schema })
  await migrateDrizzlePostgres(connection, postgresMigrationsFolder)
  await closeDrizzlePostgres(connection)
}
```

The package does not make SQLite and PostgreSQL queries look identical. Applications keep driver-specific transaction and compatibility behavior while sharing target validation, pool defaults, numeric parsing, migrations, credential-safe display URLs, and shutdown.

Consumer tests can verify the real provider selection and provider-specific safety settings without sharing a schema or repository:

```ts
import { assertDatabaseTargetConformance, assertSqliteConformance } from 'ras-stack/conformance'

await assertDatabaseTargetConformance(databaseTarget)
await assertSqliteConformance((name) => sqliteClient.pragma(name, { simple: true }))
```

## Realtime updates

Applications choose their channel names, authorize subscriptions, and define payloads. `ras-stack` handles Centrifugo's HTTP publication, signed tokens, and repeated browser lifecycle mechanics:

```ts
import { CentrifugoPublisher, signRealtimeToken } from 'ras-stack/realtime'
import {
  connectRealtimeClient,
  createSameOriginRealtimeClient,
  openRealtimeSubscription,
  requestRealtimeTicket,
  watchSubscriptionPresence,
} from 'ras-stack/realtime/client'

const publisher = new CentrifugoPublisher({
  apiUrl,
  apiKey,
  maxConcurrentChannels: 8,
  maxPendingChannels: 1024,
  onError: (error, channel) => logger.error({ error, channel }, 'realtime publication failed'),
})

publisher.publish(`battle:${battle.id}`, { type: 'change' })

const token = signRealtimeToken(user.id, { channel: `battle:${battle.id}`, info: presence }, { secret })

await publisher.close()

const client = createSameOriginRealtimeClient({
  getToken: () => requestRealtimeTicket('/api/realtime/token', { parse: (value) => (value as { token: string }).token }),
})
const channelToken = (channel: string) =>
  requestRealtimeTicket('/api/realtime/token', {
    init: { method: 'POST', body: JSON.stringify({ channel }) },
    parse: (value) => (value as { token: string }).token,
  })
const disconnect = connectRealtimeClient(client)
const live = openRealtimeSubscription(client, channel, { getToken: ({ channel }) => channelToken(channel) }, (subscription) =>
  watchSubscriptionPresence(subscription, setClients),
)

live.close()
disconnect()
```

React applications can keep transport ownership equally small while retaining the native client and subscription:

```tsx
import { useCallback } from 'react'
import { useConnectedRealtimeClient, useRealtimePresence, useRealtimeSubscription } from 'ras-stack/realtime/react'

const createClient = useCallback(() => createSameOriginRealtimeClient({ getToken }), [workspaceId])
const client = useConnectedRealtimeClient(createClient)
const subscription = useRealtimeSubscription({ client, channel, options, configure })
const clients = useRealtimePresence(subscription)
```

The client factory may return a client or a promise, so applications can fetch and validate an initial ticket before connecting. Pass `onError` as the third argument to handle asynchronous ticket failures. A client that resolves after unmount is disconnected without ever connecting. The factory, error handler, subscription options, and configure callback should have stable identities and change only when their corresponding lifecycle should restart.

A publisher that accepts every channel turns a burst into unbounded memory, and one that accepts work after `close()` loses publications during shutdown. Both appear only under load, so the contract is checkable:

```ts
import { assertRealtimePublisherConformance } from 'ras-stack/conformance'

await assertRealtimePublisherConformance(() => new CentrifugoPublisher({ ...options, fetch: stubFetch }))
```

Pass a publisher whose `fetch` does not reach a real Centrifugo; the suite fills it past capacity and then closes it.

The client helpers return the underlying Centrifuge client and subscription. React ownership, channel conventions, ticket validation, event parsing, presence models, and query invalidation remain application code. `publish()` returns `false` when the publisher is closed, disabled, or at capacity. `close()` rejects new work and waits for accepted publications and their bounded retries to finish.

Because the application owns the route that mints tokens, a mistake there is only visible once Centrifugo rejects a connection or, worse, accepts one it should not. Consumer tests can check the route's signer against the shared secret instead:

```ts
import { assertRealtimeTokenConformance } from 'ras-stack/conformance'

await assertRealtimeTokenConformance((subject, claims) => mintRealtimeToken(subject, claims), { secret })
```

It verifies the token is HS256, binds the subject it was asked for, carries its claims, expires within an hour, and is signed with the secret Centrifugo shares. Pass `maxTtlSeconds` to hold a shorter deadline.

## Email and uploads

The optional integrations return the underlying library objects when an application needs more control:

```ts
import { createAuthEmailHandler, createSmtpDelivery, createSmtpTransport, smtpConfigFromEnvironment } from 'ras-stack/email'
import { createTusUpload, startTusUpload } from 'ras-stack/uploads'

const smtp = smtpConfigFromEnvironment()
const email = smtp ? createSmtpDelivery(smtp) : undefined

const sendVerificationEmail = email
  ? createAuthEmailHandler(email, ({ user, url }) => ({ to: user.email, subject: 'Verify your email', text: url }))
  : undefined

const upload = createTusUpload({
  endpoint: '/api/upload',
  file,
  metadata,
  shouldRetry: (status) => status !== 423,
  onProgress,
})

await startTusUpload(upload)
```

`createAuthEmailHandler` adapts one application-owned message to a Better Auth callback and waits for delivery before returning. Use it independently for verification or password reset, and pass the callback only when delivery is configured.

Half-configured SMTP is the failure that reaches production, because nothing sends mail until something needs to:

```ts
import { assertSmtpConfigConformance } from 'ras-stack/conformance'

expect(() => assertSmtpConfigConformance(smtpConfigFromEnvironment)).not.toThrow()
```

It checks that an unset environment yields no configuration, that a host and sender produce the default port, and that a host without a sender, a sender without a host, an out-of-range port, and a user without a password are each rejected.

Applications retain ownership of email templates, whether email is required, missing-email behavior, upload metadata, authorization, quotas, and completion processing.

Production server assets can be declared in `ras-stack.assets.json` instead of appended shell copy chains:

```json
{
  "outputDirectory": ".output/server",
  "assets": [
    { "source": "drizzle", "destination": "drizzle" },
    { "source": "drizzle-postgres", "destination": "drizzle-postgres" }
  ]
}
```

Run `ras assets sync` after the application build and `ras assets check` before packaging. Sync replaces each declared destination, and check compares the exact file set and content. Sources stay inside the repository, destinations stay inside the output directory, overlapping destinations and symbolic links are rejected, and the application retains ownership of asset generation and contents.

Stateful development servers can reuse one typed resource across HMR without application-specific `globalThis` casts:

```ts
import { clearGlobalSingleton, globalAsyncSingleton } from 'ras-stack/server'

export const app = () => globalAsyncSingleton('my-app.instance', createApp)
export const resetApp = () => clearGlobalSingleton('my-app.instance', (instance) => instance.close())
```

Rejected async initialization removes only its own pending value so a later request can retry. Clearing deletes the key before awaiting initialization or disposal, allowing replacement startup without reusing a closing resource.
