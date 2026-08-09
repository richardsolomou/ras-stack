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
- **Database:** standard Better SQLite lifecycle and Drizzle migration mechanics that preserve the native typed database.
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

Nodemailer, Centrifuge, Better SQLite/Drizzle, and `tus-js-client` are optional peer dependencies. Install them only when using their integrations:

```sh
pnpm add nodemailer
pnpm add centrifuge
pnpm add tus-js-client
pnpm add better-sqlite3 drizzle-orm
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
import {
  betterAuthHandlers,
  canonicalHostMiddleware,
  createTanStackRpc,
  requireTanStackMutationOrigin,
  tanStackHealthHandler,
} from 'ras-stack/tanstack/server'

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

Only enable `trustForwardedHeaders` behind a proxy that replaces incoming forwarded headers. Otherwise a client could choose the origin used by the check.

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

Stateful development servers can reuse one typed resource across HMR without application-specific `globalThis` casts:

```ts
import { clearGlobalSingleton, globalAsyncSingleton } from 'ras-stack/server'

export const app = () => globalAsyncSingleton('my-app.instance', createApp)
export const resetApp = () => clearGlobalSingleton('my-app.instance', (instance) => instance.close())
```

Rejected async initialization removes only its own pending value so a later request can retry. Clearing deletes the key before awaiting initialization or disposal, allowing replacement startup without reusing a closing resource.

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

The TypeScript configs compose by runtime role:

- `base` contains runtime-neutral strictness and module-safety options.
- `bundler` adds ESM bundler resolution without assuming DOM or Node globals.
- `browser` adds DOM, JSX, and no-emit defaults.
- `tanstack` adds Vite and Node types to the browser role.
- `node-bundler` targets bundled Node 24 workers and scripts.
- `library` uses NodeNext resolution and declaration-friendly strictness.

Oxlint applications can extend the strict default plus independent layers for shared application preferences and generated TanStack files:

```json
{
  "extends": ["./node_modules/ras-stack/config/oxlint/application.json", "./node_modules/ras-stack/config/oxlint/tanstack.json"],
  "rules": {
    "application-specific-rule": "off"
  }
}
```

These configs do not set include paths, aliases, generated directories outside TanStack's route tree, or framework-specific worker globals. Keep those differences in the consuming repository.

## Repository policy

Policy files which cannot inherit can stay committed while being checked against the shared source. Select only the policies a repository wants in `ras-stack.policy.json`:

```json
{
  "changesets": {
    "overrides": {
      "access": "restricted",
      "privatePackages": { "version": true, "tag": true }
    }
  },
  "dependabot": true,
  "pnpm": {}
}
```

Then generate or verify the effective files:

```sh
pnpm exec ras-stack-policy sync
pnpm exec ras-stack-policy check
```

`changesets` and `dependabot` produce deterministic complete files, with optional deep overrides. The pnpm policy changes only `minimumReleaseAge` in the existing `pnpm-workspace.yaml`, preserving local package layout, build approvals, dependency overrides, exclusions, and comments. Its default is seven days; set `"minimumReleaseAge": 0` only as an explicit repository exception. Commit both the selection and generated files so policy changes remain visible in review.

## GitHub Actions

The JavaScript setup action reads the Node version from `engines.node` and the pnpm version from `packageManager` in the consuming repository:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: richardsolomou/ras-stack/actions/setup-js@v0.9.0
  - run: pnpm check
```

Just is independent of the application language and is installed separately when a repository uses it:

```yaml
- uses: richardsolomou/ras-stack/actions/setup-just@v0.9.0
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
  uses: richardsolomou/ras-stack/.github/workflows/release-changesets.yml@v0.9.0
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
