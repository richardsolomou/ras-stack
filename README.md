# ras-stack

**The small pieces of full-stack plumbing I reuse across my TypeScript applications.**

[![npm](https://img.shields.io/npm/v/ras-stack)](https://www.npmjs.com/package/ras-stack) [![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/ras-stack/ci.yml?branch=main)](https://github.com/richardsolomou/ras-stack/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/ras-stack)](LICENSE)

I build several applications with the same TypeScript stack. They kept growing slightly different copies of the same code for session settings, origin checks, email delivery, realtime publication, resumable uploads, health checks, and project configuration.

`ras-stack` is the shared home for that plumbing. It is a personal library, published in case the code or the way it is split up is useful to someone else.

## What it is

The package contains independent helpers for common application infrastructure:

- **Authentication:** secure defaults and utilities for sessions, rate limits, secrets, social providers, tokens, and trusted origins.
- **Server requests:** same-origin mutation guards, error-normalizing RPC wrappers, canonical-host redirects, and health responses.
- **Realtime:** Centrifugo token signing and a bounded publisher with retries and graceful shutdown.
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

Nodemailer and `tus-js-client` are optional peer dependencies. Install one only when using its entrypoint:

```sh
pnpm add nodemailer
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

Framework access is injected into server helpers, so the package does not need to wrap TanStack Start:

```ts
import { getRequest } from '@tanstack/react-start/server'
import { requireSameOrigin } from 'ras-stack/auth'
import { createRpc } from 'ras-stack/server'

export const { rpc, mutationRpc } = createRpc({
  getRequest,
  requireMutation: (request) =>
    requireSameOrigin(request, {
      configured: [process.env.APP_URL],
      trustForwardedHeaders: true,
    }),
})
```

Only enable `trustForwardedHeaders` behind a proxy that replaces incoming forwarded headers. Otherwise a client could choose the origin used by the check.

## Realtime updates

Applications choose their channel names, authorize subscriptions, and define payloads. `ras-stack` handles Centrifugo's HTTP publication and signed tokens:

```ts
import { CentrifugoPublisher, signRealtimeToken } from 'ras-stack/realtime'

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
```

`publish()` returns `false` when the publisher is closed, disabled, or at capacity. `close()` rejects new work and waits for accepted publications and their bounded retries to finish.

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

## Development

Development requires Node 24 and pnpm 11.15.0.

```sh
just install
just check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for release instructions. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0](LICENSE).
