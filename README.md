# ras-stack

**The small pieces of full-stack plumbing I reuse across my TypeScript applications.**

[![npm](https://img.shields.io/npm/v/ras-stack)](https://www.npmjs.com/package/ras-stack) [![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/ras-stack/ci.yml?branch=main)](https://github.com/richardsolomou/ras-stack/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/ras-stack)](LICENSE)

I build several applications with the same TypeScript stack. They kept growing slightly different copies of the same code for session settings, origin checks, email delivery, realtime publication, resumable uploads, health checks, and project configuration.

`ras-stack` is the shared home for that plumbing. It is a personal library, published in case the code or the way it is split up is useful to someone else.

## What it is

The package contains independent helpers for common application infrastructure:

- **Authentication:** secure defaults and utilities for sessions, rate limits, secrets, social providers, tokens, and trusted origins.
- **Server requests:** same-origin mutation guards, error-normalizing RPC wrappers, canonical-host redirects, and health responses.
- **Realtime:** Centrifugo client lifecycle, token signing, presence synchronization, and a bounded publisher with retries and graceful shutdown.
- **Email:** SMTP environment parsing and a small Nodemailer delivery interface.
- **Uploads:** a promise-based wrapper around resumable `tus-js-client` uploads.
- **Project configuration:** shared TypeScript and Oxlint bases.

Each area has its own import path. An application can use one without adopting the rest.

## What it is not

This is not a framework, starter, application template, or complete authentication system. It does not own an application's database schema, migrations, routes, authorization rules, email templates, upload policy, or realtime event names.

The libraries underneath remain available normally. Applications still configure and call Better Auth, TanStack Start, Drizzle, Nodemailer, `tus-js-client`, and Centrifugo directly. The helpers only centralize the parts that would otherwise be copied unchanged.

## Install

`ras-stack` requires Node 24.

```sh
pnpm add ras-stack
```

Nodemailer, Centrifuge, and `tus-js-client` are optional peer dependencies. Install one only when using its integration:

```sh
pnpm add nodemailer
pnpm add centrifuge
pnpm add tus-js-client
```

## Authentication and request security

The auth entrypoint provides options and utilities rather than an auth factory. The application keeps its complete Better Auth configuration:

```ts
import { betterAuth } from 'better-auth'
import { configuredProviderOptions, standardRateLimitOptions, standardSessionOptions, trustedOrigins } from 'ras-stack/auth'

const auth = betterAuth({
  database,
  plugins,
  socialProviders: configuredProviderOptions(['google', 'discord']),
  session: standardSessionOptions(),
  rateLimit: standardRateLimitOptions({ '/sign-up/email': { window: 60, max: 10 } }),
  trustedOrigins: trustedOrigins({
    configured: [process.env.APP_URL],
    trustForwardedHeaders: true,
  }),
})
```

The optional TanStack entrypoints bind the shared primitives to TanStack Start's ambient request and provide the common Query client default:

```ts
import { createStackQueryClient } from 'ras-stack/tanstack/query'
import { createTanStackRpc, requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'

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
```

Applications still own their auth clients, authorization, routes, router, logging, health checks, and Query configuration. Both integrations remain optional, and their upstream libraries remain directly accessible.

Only enable `trustForwardedHeaders` behind a proxy that replaces incoming forwarded headers. Otherwise a client could choose the origin used by the check.

## Realtime updates

Applications choose their channel names, authorize subscriptions, and define payloads. `ras-stack` handles Centrifugo's HTTP publication, signed tokens, and repeated browser lifecycle mechanics:

```ts
import {
  CentrifugoPublisher,
  connectRealtimeClient,
  createSameOriginRealtimeClient,
  openRealtimeSubscription,
  requestRealtimeTicket,
  signRealtimeToken,
  watchSubscriptionPresence,
} from 'ras-stack/realtime'

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

The client helpers return the underlying Centrifuge client and subscription. React ownership, channel conventions, ticket validation, event parsing, presence models, and query invalidation remain application code. `publish()` returns `false` when the publisher is closed, disabled, or at capacity. `close()` rejects new work and waits for accepted publications and their bounded retries to finish.

## Email and uploads

The optional integrations return the underlying library objects when an application needs more control:

```ts
import { createSmtpDelivery, createSmtpTransport, smtpConfigFromEnvironment } from 'ras-stack/email'
import { createTusUpload, startTusUpload } from 'ras-stack/uploads'

const smtp = smtpConfigFromEnvironment()
const email = smtp ? createSmtpDelivery(smtp) : undefined

const upload = createTusUpload({
  endpoint: '/api/upload',
  file,
  metadata,
  shouldRetry: (status) => status !== 423,
  onProgress,
})

await startTusUpload(upload)
```

Applications retain ownership of email templates, missing-email behavior, upload metadata, authorization, quotas, and completion processing.

## Shared project configuration

Extend the supplied configuration and override anything specific to the application:

```json
{
  "extends": ["./node_modules/ras-stack/config/oxlint.json"],
  "rules": {
    "application-specific-rule": "off"
  }
}
```

```json
{
  "extends": "ras-stack/config/typescript/tanstack",
  "include": ["src", "vite.config.ts"]
}
```

TypeScript bases are also available at `ras-stack/config/typescript/browser` and `ras-stack/config/typescript/library`.

## GitHub Actions

The JavaScript setup action reads the Node version from `engines.node` and the pnpm version from `packageManager` in the consuming repository:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: richardsolomou/ras-stack/actions/setup-js@v0.3.0
  - run: pnpm check
```

Just is independent of the application language and is installed separately when a repository uses it:

```yaml
- uses: richardsolomou/ras-stack/actions/setup-just@v0.2.0
  with:
    version: '1.58.0'
```

Applications using Changesets can call the reusable release workflow after their own required checks:

```yaml
release:
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  needs: [check]
  permissions:
    contents: write
  uses: richardsolomou/ras-stack/.github/workflows/release-changesets.yml@v0.3.0
  secrets: inherit
```

The workflow consumes pending changesets, commits the resulting versions and changelogs, pushes the commit and tag atomically, and creates a GitHub Release. It does nothing when no versioned changeset is present. The caller owns its checks, Changesets configuration, release policy, and any deployment that follows the release.

Pin actions and reusable workflows to a release tag and let Dependabot propose upgrades.

The reusable check workflow owns checkout and toolchain setup while the repository keeps its check command:

```yaml
jobs:
  check:
    uses: richardsolomou/ras-stack/.github/workflows/check-js.yml@v0.6.0
    with:
      command: just check
      just-version: '1.58.0'
```

Simple Playwright jobs can also share browser installation and failure artifacts:

```yaml
jobs:
  end-to-end:
    uses: richardsolomou/ras-stack/.github/workflows/check-browser.yml@v0.6.0
    with:
      prepare-command: pnpm build
      command: pnpm test:e2e:run
      artifact-path: test-results
```

Callers continue to own workflow triggers, concurrency, required-job dependencies, permissions, services, caches, custom setup, and release or deployment policy. Keep jobs local when they need steps beyond these stable shapes.

## Development

Development requires Node 24 and pnpm 11.15.0.

```sh
just install
just check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for release instructions. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0](LICENSE).
