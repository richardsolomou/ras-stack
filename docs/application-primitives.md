# Application primitives

Consumer conformance tests must call the application's adapter, handler, or configuration actually used at startup. Passing a ras-stack factory directly into a ras-stack assertion only retests the library and cannot detect a disconnected application integration. Keep upstream defaults covered here; use application tests to verify routing, identity, tenant scope, lifecycle ownership, and provider wiring.

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

Provider credentials normally use names such as `GOOGLE_CLIENT_ID`. Applications with a namespace can supply a prefix. A client ID without its secret, or the reverse, throws rather than silently disabling the provider; pass `rejectPartial: false` to treat it as unconfigured:

```ts
const google = providerCredentials('google', process.env, { prefix: 'AUTH_' })
```

The optional TanStack entrypoints bind the shared primitives to TanStack Start's ambient request and leave Query client configuration with the application:

```ts
import { QueryClient } from '@tanstack/react-query'
import { canonicalHostMiddleware } from 'ras-stack/tanstack/middleware'
import { createTanStackRpc, requireTanStackMutationOrigin, tanStackHealthHandler } from 'ras-stack/tanstack/server'

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

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1000 } } })

export const healthHandler = tanStackHealthHandler(() => app().database.get(sql`SELECT 1`))
export const canonicalHost = canonicalHostMiddleware(() => ({ canonicalUrl: process.env.APP_URL }))
```

Applications still own their auth clients, authorization, file-route declarations, router, logging, health-check work, and Query configuration. Both integrations remain optional, and their upstream libraries remain directly accessible.

Import middleware used by `src/start.ts` from `ras-stack/tanstack/middleware`. That entrypoint is safe for TanStack's client transform; `ras-stack/tanstack/server` also exports server-only request helpers and must stay behind server boundaries.

Only enable `trustForwardedHeaders` behind a proxy that replaces incoming forwarded headers. Otherwise a client could choose the origin used by the check.

Absolute links, such as those in emails, discovery documents, and page metadata, need the address users reach rather than the one the container listens on. `publicOrigin` takes the same options as the origin check and returns the first valid configured origin, then the trusted forwarded origin, then the request's own:

```ts
import { publicOrigin } from 'ras-stack/auth'

const link = new URL(`/invite/${token}`, publicOrigin(request, { configured: [process.env.APP_URL], trustForwardedHeaders: true }))
```

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

## Surviving deploys

A tab opened before a deploy keeps running the old build. Two failures follow, and neither recovers on its own:

```tsx
import { createStart } from '@tanstack/react-start'
import { chunkRecoveryScript } from 'ras-stack/tanstack/client'
import { staleServerFunctionMiddleware } from 'ras-stack/tanstack/middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [staleServerFunctionMiddleware('The app has been updated. Refresh the page to continue.')],
}))

// In the root route's head():
scripts: [{ children: chunkRecoveryScript({ storageKey: 'app:chunk-reload', noticeId: 'update-notice' }) }]
```

- A call to a server function the deploy removed reaches TanStack's resolver, whose JSON 500 the client treats as a successful result. `staleServerFunctionMiddleware` answers with a plain-text 404 instead, so the call fails with the application's message.
- An entry module that no longer exists leaves the server-rendered HTML inert. The inline script reloads the page, at most once per retry window (10 seconds by default), and then reveals the optional `noticeId` element. TanStack Router already reloads for lazy route chunks; the script covers the entry graph the router never reaches. It ignores module scripts from other origins, such as those browser extensions inject.

Applications own the message copy, the notice element, and the storage key.

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

Applications retain their schema, migrations, database path, repositories, transactions, and driver selection. Dual-database applications can use `openSqliteClient()` beneath their own wrapper without forcing PostgreSQL through a shared database interface.

The libsql entrypoint does the same for `@libsql/client`, asynchronously:

```ts
import { openDrizzleLibsql } from 'ras-stack/database/libsql'

const database = await openDrizzleLibsql({ file, schema, migrationsFolder })
```

The libsql client pools connections and opens each one with its own defaults, so a PRAGMA run through `execute` would reach only one of them. Those defaults already match the standard synchronous and foreign-key settings, so `pragmas` covers only the journal mode, which persists in the file, and the busy timeout, which every connection receives through the client's `timeout` option.

The PostgreSQL entrypoint applies the same boundary to Postgres.js and Drizzle while returning both native objects:

```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { databaseTarget } from 'ras-stack/database'
import { openDrizzlePostgres } from 'ras-stack/database/postgres'

const target = databaseTarget({ databaseUrl: process.env.DATABASE_URL, sqliteFile })
if (target.provider === 'postgres') {
  const connection = openDrizzlePostgres({ url: target.url, schema })
  await migrate(connection.database, { migrationsFolder: postgresMigrationsFolder })
  await connection.client.end({ timeout: 5 })
}
```

The package does not make SQLite and PostgreSQL queries look identical. Applications keep driver-specific transaction and compatibility behavior while sharing target validation, pool defaults, and numeric parsing. Migrations and shutdown go through the returned Drizzle database and Postgres.js client.

Consumer tests can verify the real provider selection and provider-specific safety settings without sharing a schema or repository:

```ts
import { assertDatabaseTargetConformance, assertSqliteConformance } from 'ras-stack/conformance'

await assertDatabaseTargetConformance(databaseTarget)
await assertSqliteConformance((name) => sqliteClient.pragma(name, { simple: true }))
```

With libsql, read each PRAGMA through the client:

```ts
await assertSqliteConformance(async (name) => (await database.$client.execute(`pragma ${name}`)).rows[0]?.[0])
```

## Realtime updates

Applications choose their channel names, authorize subscriptions, and define payloads. `ras-stack` handles Centrifugo's HTTP publication, signed tokens, and repeated browser lifecycle mechanics:

```ts
import { CentrifugoPublisher, realtimeEnvironment, signRealtimeToken } from 'ras-stack/realtime'
import { createSameOriginRealtimeClient, requestRealtimeTicket } from 'ras-stack/realtime/client'

const realtime = realtimeEnvironment(process.env, { prefix: 'APP_', developmentSecret: 'app-development-realtime-secret' })
if (!realtime) throw new Error('Realtime secret is not configured')

const publisher = new CentrifugoPublisher({
  apiUrl: realtime.apiUrl,
  apiKey: realtime.apiKey,
  maxConcurrentChannels: 8,
  maxPendingChannels: 1024,
  onError: (error, channel) => logger.error({ error, channel }, 'realtime publication failed'),
})

publisher.publish(`battle:${battle.id}`, { type: 'change' })

const token = signRealtimeToken(user.id, { channel: `battle:${battle.id}`, info: { name: user.name } }, { secret: realtime.secret })

await publisher.close()

const client = createSameOriginRealtimeClient({
  getToken: () => requestRealtimeTicket('/api/realtime/token', { parse: (value) => (value as { token: string }).token }),
})
const channelToken = (channel: string) =>
  requestRealtimeTicket('/api/realtime/token', {
    init: { method: 'POST', body: JSON.stringify({ channel }) },
    parse: (value) => (value as { token: string }).token,
  })
const subscription = client.newSubscription(channel, { getToken: ({ channel }) => channelToken(channel) })
subscription.subscribe()
client.connect()

client.removeSubscription(subscription)
client.disconnect()
```

React applications can keep transport ownership equally small while retaining the native client and subscription:

```tsx
import { useCallback } from 'react'
import { useConnectedRealtimeClient, useRealtimeSubscription } from 'ras-stack/realtime/react'

const createClient = useCallback(() => createSameOriginRealtimeClient({ getToken }), [workspaceId])
const client = useConnectedRealtimeClient(createClient)
const subscription = useRealtimeSubscription({ client, channel, options, configure })
```

The client factory may return a client or a promise, so applications can fetch and validate an initial ticket before connecting. Pass `onError` as the third argument to handle asynchronous ticket failures. A client that resolves after unmount is disconnected without ever connecting. The factory, error handler, subscription options, and configure callback should have stable identities and change only when their corresponding lifecycle should restart.

`realtimeEnvironment` reads `<prefix>REALTIME_API_URL`, `REALTIME_API_KEY`, and `REALTIME_SECRET` or `REALTIME_SECRET_FILE`, defaulting the API key to the secret and the API address to the local development container. It returns `undefined` when no secret is configured, except outside production when a `developmentSecret` is supplied; the container entrypoint pairs it with `persistedRealtimeSecret()` from `ras-stack/runtime`, which generates the secret once under `/data` and exports it to the supervised processes. The client helpers return the underlying Centrifuge client, and the React hooks return the native client and subscription. React ownership, channel conventions, ticket validation, event parsing, presence models, and query invalidation remain application code. `publish()` returns `false` when the publisher is closed, disabled, or at capacity. `close()` rejects new work and waits for accepted publications and their bounded retries to finish; pass an `AbortSignal` when the surrounding process has a stricter shutdown deadline.

## SpacetimeDB

Applications that keep realtime state in SpacetimeDB talk to its HTTP API from the server. `ras-stack/spacetime` covers that boundary with plain `fetch` and returns native responses:

```ts
import { callSpacetime, publishSpacetimeModule } from 'ras-stack/spacetime'

const spacetime = { url: process.env.SPACETIME_URL, database: 'app-production', token: ownerToken }

await publishSpacetimeModule(spacetime, bundle, {
  environment: { AUTH_ISSUER: `${appUrl}/api/auth`, AUTH_AUDIENCE: 'app-production' },
  breakClients: true,
})
const health = await callSpacetime({ ...spacetime, token: operatorToken }, 'operator_health', [])
```

- Every request validates the origin and database name, sends the bearer token plus any `headers` (such as Cloudflare Access service tokens), refuses redirects, and times out. Failures throw `SpacetimeRequestError` with the status and a bounded body.
- `publishSpacetimeModule` asks the migration planner first. A missing database is created, an automatic migration is applied, and a migration that needs manual steps is refused before anything changes. One that would break existing clients is refused unless `breakClients` is set.
- `environment` becomes `spacetime-environment` headers, which SpacetimeDB stores with the module across publishes. `moduleEnvironmentHeaders` validates the same values for other callers.
- `deleteSpacetimeDatabase` treats a database that does not exist as already deleted, so preview cleanup can run repeatedly.
- `spacetimeDatabaseUrl(connection, '/sql')` builds other database routes with the same validation. Plain HTTP is accepted only for loopback or the configured `internalHost`.

Applications keep their client connections, reconnect policy, identity provider and token claims, and module code. CI can check committed client bindings with `actions/check-spacetime-bindings`.

## Email and uploads

The optional integrations return the underlying library objects when an application needs more control:

```ts
import { createSmtpDelivery, smtpConfigFromEnvironment, standardAuthEmails } from 'ras-stack/email'
import { createTusUpload, startTusUpload } from 'ras-stack/uploads'

const smtp = smtpConfigFromEnvironment()
const email = smtp ? createSmtpDelivery(smtp) : undefined

const authEmails = email ? standardAuthEmails(email, { productName: 'Example' }) : undefined

const upload = createTusUpload({
  endpoint: '/api/upload',
  file,
  metadata,
  shouldRetry: (status) => status !== 423,
  onProgress,
})

await startTusUpload(upload, { signal, terminateOnAbort: true })
```

`standardAuthEmails` returns the `sendResetPassword` and `sendVerificationEmail` callbacks with the plain-text and HTML copy most applications ship, parameterized only by product name. Each callback waits for delivery before returning; pass them only when delivery is configured. An application with its own copy writes its own callbacks around `EmailDelivery.send`. `startTusUpload` accepts an `AbortSignal`; `terminateOnAbort` also removes the partial remote upload instead of leaving it resumable.

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
