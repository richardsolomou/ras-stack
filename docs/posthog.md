# PostHog integration

[Back to the ras-stack overview](../README.md)

The PostHog entrypoints provide a complete default installation: product analytics, autocapture, pageviews, session replay, browser performance, structured logs, application metrics, distributed tracing, feature flags, browser and server error tracking, request correlation, reverse proxying, source maps, and clean shutdown. Applications retain the native SDK clients and own the events, measurements, spans, and properties that describe their product.

PostHog application metrics is currently in open alpha and distributed tracing is in beta. Enable Metrics once in the PostHog project before expecting metric data. The SDK and ingestion details may still change upstream.

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

;<PostHogIntegration
  environment={posthog}
  service={{ name: 'my-app-web', version: import.meta.env.VITE_APP_VERSION, environment: import.meta.env.MODE }}
>
  {children}
</PostHogIntegration>
```

This pins the current SDK defaults and enables SPA pageviews, autocapture, identified-only person profiles, exception capture, a React error boundary, browser performance, personal-data URL masking including `token` query parameters, privacy-safe replay masking, and same-origin request correlation. The service identity configures browser logs and metrics with matching OpenTelemetry resource fields. Pass `options` or a custom `fallback` only where the product needs different behavior. Canvas capture, extra replay blocking, consent, console-log capture, and debug behavior remain explicit because the correct choice depends on what the application renders and stores.

Use the re-exported `usePostHog()` hook or the native `posthog-js` export for custom events, feature flags, surveys, experiments, groups, structured logs, metrics, and manual exception context:

```tsx
import { usePostHog } from 'ras-stack/posthog/react'

const posthog = usePostHog()
posthog.logger.info('checkout completed', { plan: 'pro' })
posthog.metrics.count('checkout.completed', 1, { attributes: { plan: 'pro' } })
posthog.metrics.histogram('checkout.duration', 187, { unit: 'ms' })
```

Metric attributes must stay low-cardinality: route templates, statuses, plans, and bounded enums are appropriate; user IDs, session IDs, request IDs, and raw URLs are not. Browser logs automatically carry the current PostHog person and session. `ras-stack` does not enable console-log capture because application and dependency output can contain secrets or personal data.

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

The adapter identifies the verified Better Auth user ID and resets PostHog after sign-out, including when a password-reset navigation remounts the application with a persisted PostHog identity and no Better Auth session. It also resets before identifying a different authenticated user, so impersonation cannot reuse the administrator's analytics session. It does not reset during initial anonymous loading or a failed session refresh. No name or email is sent by default. Add only product-safe properties explicitly:

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

Wrap server work in the same validated context to link its logs, exceptions, and spans to the browser session:

```ts
await telemetry.withRequestContext(request, { authenticatedDistinctId: user.id }, () =>
  telemetry.withSpan('POST /checkout', { kind: 'server', parent: request.headers.get('traceparent') ?? undefined }, () =>
    processCheckout(),
  ),
)
```

PostHog's browser SDK injects person and session headers; distributed trace propagation uses the W3C `traceparent` header. Browser applications do not create PostHog spans themselves.

## Server setup

Use one managed object for server analytics, exception capture, structured OTLP logs, native metrics and spans, flushing, and shutdown:

```ts
import { postHogEnvironment } from 'ras-stack/posthog'
import {
  createManagedPostHogServerTelemetry,
  createPostHogRpcLogger,
  createPostHogRpcObserver,
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

Absent deployment configuration keeps capture methods as no-ops while traced work still runs normally. Failed initialization is reported through `onError` and retried on the next call. Logs are bounded before export. `shutdown()` flushes the native PostHog client and OpenTelemetry log provider once.

Keep product events explicit:

```ts
await telemetry.capture(user.id, 'action_completed', { item_count: 2 })
await telemetry.log({ body: 'request completed', severityText: 'info', attributes: { item_count: 2 } })
await telemetry.metrics.count('request.completed', 1, { attributes: { route: '/action', status: '200' } })
await telemetry.metrics.gauge('queue.depth', 4, { attributes: { queue: 'email' } })
await telemetry.metrics.histogram('request.duration', 42, { unit: 'ms', attributes: { route: '/action' } })
```

Wrap timed operations with low-cardinality span names. The callback always runs, even when PostHog is disabled or initialization fails; the span is `undefined` only in that fallback path:

```ts
const result = await telemetry.withSpan('catalogue.refresh', { kind: 'internal' }, async (span) => {
  const result = await refreshCatalogue()
  span?.setAttribute('catalogue.entries', result.entryCount)
  return result
})
```

Use `startSpan()` only when work cannot be wrapped, and always end the returned span. For serverless or other short-lived work, call `await telemetry.flush()` before the runtime freezes. Long-running processes should use `shutdown()` at their lifecycle boundary instead.

TanStack RPC wrappers can preserve their existing console logger while automatically capturing handled exceptions and a structured error log:

```ts
const logError = createPostHogRpcLogger(telemetry, {
  logError: (error, context) => console.error({ event: 'server_function_failed', ...context, error }),
  resolveAuthenticatedDistinctId: (request) => authenticatedUser(request)?.id,
  allowAnonymousDistinctId: true,
})

const observe = createPostHogRpcObserver(telemetry)
const { rpc, mutationRpc } = createTanStackRpc({ logError, observe })
```

The logger includes only the normalized request method/path and validated PostHog session context. Authenticated identity is accepted only when the application resolver agrees with the propagated distinct ID. The observer creates one server span and low-cardinality request count and duration metrics around each RPC without recording URLs, query strings, user IDs, or session IDs as metric attributes.

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

The proxy mounts at `/t` by default (exported as `POSTHOG_DEFAULT_INGEST_PATH`), because ad-blocker lists block the literal `/ingest` segment regardless of host. The Vite keys are regular expressions bound to that whole segment, so an application route such as `/teams` stays local. Keep the `static` and `array` entries ahead of the ingest entry when composing these objects with local routes.

Pass a custom `path` to move the proxy elsewhere, and pass the same value as `ingestPath` to `PostHogIntegration` so the browser client requests it:

```ts
const proxy = postHogIngestProxy(posthog, { path: '/relay' })
```

```tsx
<PostHogIntegration environment={posthog} ingestPath="/relay">
  {children}
</PostHogIntegration>
```

Both default to `POSTHOG_DEFAULT_INGEST_PATH` when omitted.

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
    logs: true,
    metrics: true,
    sessionReplay: true,
  },
  server: {
    analytics: true,
    errorTracking: true,
    logs: { disabled: 'Logs are exported through another provider' },
    metrics: true,
    tracing: true,
  },
  sourceMaps: true,
})
```

`assertPostHogBrowserConformance()` checks pinned browser defaults, exception capture, and personal-data URL masking. `assertPostHogRequestConformance()` verifies authenticated identity correlation, bounded sessions, and spoof rejection. Consumer tests should run both alongside their coverage declaration.

Source-map upload stays in the application build: run the PostHog CLI against the final browser assets, after the build and before the container or artifact is assembled, and keep the personal API key in that deployment step. Declare the decision in `sourceMaps`, including a reason when it is disabled.

## What remains local

Applications own:

- event and property contracts;
- identity properties and group definitions;
- consent, retention, masking, and replay policy;
- feature-flag keys, fallbacks, and rollout conditions;
- manual exception context, log attributes, metric names and dimensions, and span names and attributes;
- source-map credentials and the final deployment order.

The integration should make correct setup routine, not make unrelated products emit the same telemetry.
