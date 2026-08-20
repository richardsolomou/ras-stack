# PostHog integration

[Back to the ras-stack overview](../README.md)

The PostHog entrypoints provide a complete default installation: product analytics, autocapture, pageviews, session replay, feature flags, browser and server error tracking, request correlation, reverse proxying, source maps, and clean shutdown. Applications retain the native SDK clients and mainly own the events and properties that describe their product.

## Install

Install only the SDKs used by the application:

```sh
pnpm add posthog-js @posthog/react
pnpm add posthog-node @opentelemetry/api-logs @opentelemetry/exporter-logs-otlp-http @opentelemetry/resources @opentelemetry/sdk-logs
```

The SDKs and OpenTelemetry log packages are optional ras-stack peers. Install only the browser or server surfaces the application uses.

## Deployment configuration

The public project token enables PostHog. US Cloud is the default, so most applications need one variable:

```ts
import { postHogEnvironment } from 'ras-stack/posthog'

const posthog = postHogEnvironment({
  projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
  host: import.meta.env.VITE_POSTHOG_HOST,
})
```

An absent token disables PostHog. Set `host` for EU Cloud or self-hosting; the UI and static asset hosts are derived automatically. HTTP hosts are normalized and credentials, query strings, and fragments are rejected.

## Browser setup

Wrap the application once:

```tsx
import { PostHogIntegration } from 'ras-stack/posthog/react'

;<PostHogIntegration environment={posthog}>{children}</PostHogIntegration>
```

This pins the current SDK defaults and enables SPA pageviews, autocapture, identified-only person profiles, exception capture, a React error boundary, privacy-safe replay masking, and same-origin request correlation. Pass `options` or a custom `fallback` only where the product needs different behavior. Canvas capture, extra replay blocking, consent, and debug behavior remain explicit because the correct choice depends on what the application renders and stores.

Use `usePostHog()` or the native `posthog-js` export for custom events, feature flags, surveys, experiments, groups, and manual exception context.

## Better Auth identity

Mount the identity adapter inside `PostHogIntegration`:

```tsx
import { PostHogBetterAuthIdentity } from 'ras-stack/posthog/react'
import { authClient } from './authClient'

;<PostHogIntegration environment={posthog}>
  <PostHogBetterAuthIdentity authClient={authClient} />
  {children}
</PostHogIntegration>
```

The adapter identifies the verified Better Auth user ID and resets PostHog after sign-out. It does not reset during initial anonymous loading or a failed session refresh. No name or email is sent by default. Add only product-safe properties explicitly:

```tsx
<PostHogBetterAuthIdentity authClient={authClient} properties={(user) => ({ role: user.role })} />
```

The browser adapter does not make client identity authoritative. Server captures must still compare propagated identity with the server-authenticated user.

## Browser and server correlation

`PostHogIntegration` configures the SDK's tracing headers for same-origin fetch and XHR requests. For a custom transport, attach them explicitly:

```ts
import { postHogBrowserHeaders } from 'ras-stack/posthog/client'

await fetch('/api/action', { headers: postHogBrowserHeaders(posthog) })
```

The server must not trust a client-claimed authenticated identity. Parse it only after application authentication has produced the expected ID:

```ts
import { postHogRequestContext } from 'ras-stack/posthog'

const context = postHogRequestContext(request, { authenticatedDistinctId: user.id })
client.capture({
  distinctId: context.distinctId ?? user.id,
  event: 'action_completed',
  properties: { ...context.properties },
})
```

Anonymous distinct IDs require the explicit `allowAnonymousDistinctId` option. All propagated IDs are character- and length-bounded before they enter logs or event properties.

## Server setup

Use one managed object for server analytics, exception capture, structured OTLP logs, and shutdown:

```ts
import { postHogEnvironment } from 'ras-stack/posthog'
import {
  createManagedPostHogServerTelemetry,
  createPostHogRpcLogger,
  installPostHogServerTelemetryShutdown,
} from 'ras-stack/posthog/server'

const telemetry = createManagedPostHogServerTelemetry({
  environment: postHogEnvironment({
    projectToken: process.env.VITE_POSTHOG_PROJECT_TOKEN,
    host: process.env.VITE_POSTHOG_HOST,
  }),
  serviceName: 'my-app',
  serviceVersion: process.env.APP_VERSION,
  deploymentEnvironment: process.env.NODE_ENV,
  onError: (error) => console.error({ event: 'telemetry_failed', error }),
})

installPostHogServerTelemetryShutdown(telemetry)
void telemetry.start()
```

Absent deployment configuration keeps every method as a no-op. Failed initialization is reported through `onError` and retried on the next call. Logs are bounded before export, and shutdown flushes both the native PostHog client and OpenTelemetry provider once.

Keep product events explicit:

```ts
await telemetry.capture(user.id, 'action_completed', { item_count: 2 })
await telemetry.log({ body: 'request completed', severityText: 'info', attributes: { item_count: 2 } })
```

TanStack RPC wrappers can preserve their existing console logger while automatically capturing handled exceptions and a structured error log:

```ts
const logError = createPostHogRpcLogger(telemetry, {
  logError: (error, context) => console.error({ event: 'server_function_failed', ...context, error }),
  resolveAuthenticatedDistinctId: (request) => authenticatedUser(request)?.id,
  allowAnonymousDistinctId: true,
})

const { rpc, mutationRpc } = createTanStackRpc({ logError })
```

The adapter includes only the normalized request method/path and validated PostHog session context. Authenticated identity is accepted only when the application resolver agrees with the propagated distinct ID.

The lower-level helper remains available when an application already owns its telemetry lifecycle.

The server helper returns the native `posthog-node` client with exception autocapture enabled:

```ts
import { createPostHogServerClient, shutdownPostHogServerClient } from 'ras-stack/posthog/server'

const client = await createPostHogServerClient(posthog, {
  flushAt: 20,
  flushInterval: 10_000,
})

client?.capture({ distinctId: user.id, event: 'action_completed' })
await shutdownPostHogServerClient(client)
```

Create one client per process, using the application's existing singleton during development reloads. Call shutdown from the application lifecycle boundary. Event delivery remains best-effort unless the product flow explicitly needs `captureImmediate()`.

## First-party ingest proxy

PostHog ingestion and static assets use different upstreams. Generate matching Vite and Nitro routes without duplicating their ordering and rewrites:

```ts
import { postHogIngestProxy } from 'ras-stack/posthog/proxy'

const proxy = postHogIngestProxy(posthog)

export default defineConfig({
  server: { proxy: proxy.vite },
  plugins: [nitro({ routeRules: proxy.nitro })],
})
```

Keep `/ingest/static` and `/ingest/array` ahead of `/ingest` when composing these objects with local routes.

Some ad-blocker lists block requests by the literal `/ingest` path segment regardless of the host serving it. Pass a custom `path` to move the proxy elsewhere, and pass the same value as `ingestPath` to `PostHogIntegration` so the browser client requests it:

```ts
const proxy = postHogIngestProxy(posthog, { path: '/relay' })
```

```tsx
<PostHogIntegration environment={posthog} ingestPath="/relay">
  {children}
</PostHogIntegration>
```

Both default to `/ingest` (exported as `POSTHOG_DEFAULT_INGEST_PATH`) when omitted.

## Coverage declaration

Make every major product surface enabled or intentionally absent:

```ts
import { definePostHogCoverage } from 'ras-stack/posthog'

export const postHogCoverage = definePostHogCoverage({
  browser: {
    analytics: true,
    errorTracking: true,
    featureFlags: { disabled: 'This application has no staged rollouts' },
    identity: true,
    sessionReplay: true,
  },
  server: {
    analytics: true,
    errorTracking: true,
    logs: { disabled: 'Logs are exported through another provider' },
  },
  sourceMaps: true,
})
```

`assertPostHogBrowserConformance()` checks pinned browser defaults and exception capture. `assertPostHogRequestConformance()` verifies authenticated identity correlation, bounded sessions, and spoof rejection. Consumer tests should run both alongside their coverage declaration.

Build browser assets with source maps, then process the final directory before packaging or deployment:

```yaml
- uses: richardsolomou/ras-stack/actions/upload-posthog-sourcemaps@v0.38.2
  with:
    directory: .output/public/assets
    release-name: my-app
    project-id: 507920
    personal-api-key: ${{ secrets.POSTHOG_PERSONAL_API_KEY }}
```

The action pins the PostHog CLI, injects chunk IDs, uploads the maps with the release name and commit SHA, deletes the maps, and leaves the exact instrumented JavaScript ready to deploy. Run it after the final browser build and before the container or artifact is assembled. The personal API key stays in the deployment workflow.

## What remains local

Applications own:

- event and property contracts;
- identity properties and group definitions;
- consent, retention, masking, and replay policy;
- feature-flag keys, fallbacks, and rollout conditions;
- manual exception context, log attributes, traces, and metrics;
- source-map credentials and the final deployment order.

The integration should make correct setup routine, not make unrelated products emit the same telemetry.
