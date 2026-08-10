# PostHog integration

[Back to the ras-stack overview](../README.md)

The PostHog entrypoints provide a complete default installation: product analytics, autocapture, pageviews, session replay, feature flags, browser and server error tracking, request correlation, reverse proxying, source maps, and clean shutdown. Applications retain the native SDK clients and mainly own the events and properties that describe their product.

## Install

Install only the SDKs used by the application:

```sh
pnpm add posthog-js @posthog/react
pnpm add posthog-node
```

`posthog-js`, `@posthog/react`, and `posthog-node` are optional ras-stack peers. Install only the browser or server SDKs the application uses.

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

Use `usePostHog()` or the native `posthog-js` export for custom events, feature flags, surveys, experiments, groups, and manual exception context. Authentication identity is intentionally a separate adapter; applications must identify verified users and call `reset()` on sign-out until that adapter lands.

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

## Coverage declaration

Make every major product surface enabled or intentionally absent:

```ts
import { definePostHogCoverage } from 'ras-stack/posthog'

export const postHogCoverage = definePostHogCoverage({
  browser: {
    analytics: true,
    errorTracking: true,
    sessionReplay: true,
    featureFlags: { disabled: 'This application has no staged rollouts' },
  },
  server: {
    analytics: true,
    errorTracking: true,
    logs: { disabled: 'Logs are exported through another provider' },
  },
  sourceMaps: true,
})
```

`assertPostHogBrowserConformance()` checks pinned browser defaults and exception capture. `assertPostHogRequestConformance()` verifies authenticated identity correlation, bounded sessions, and spoof rejection. Consumer tests should run both, and fleet policy can require references to the coverage declaration and conformance assertions.

Build browser assets with source maps, then process the final directory before packaging or deployment:

```yaml
- uses: richardsolomou/ras-stack/actions/upload-posthog-sourcemaps@v0.31.0
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
