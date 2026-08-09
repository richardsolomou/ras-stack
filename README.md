# ras-stack

Composable full-stack primitives shared across Richard Solomou's applications.

`ras-stack` removes repeated infrastructure decisions without wrapping or replacing the libraries underneath. Applications continue to call Better Auth, TanStack Start, Drizzle, React Query, and Centrifugo directly. They can adopt any primitive independently and retain ownership of schemas, migrations, authorization, plugins, routes, and domain events.

## Auth

The auth entrypoint provides independent options and utilities rather than an auth factory:

```ts
import { standardRateLimitOptions, standardSessionOptions, trustedOrigins } from '@richardsolomou/ras-stack/auth'
import { betterAuth } from 'better-auth'

const auth = betterAuth({
  database,
  plugins,
  session: standardSessionOptions(),
  rateLimit: standardRateLimitOptions({ '/sign-up/email': { window: 60, max: 10 } }),
  trustedOrigins: trustedOrigins({ configured: [process.env.APP_URL] }),
})
```

The application supplies its normal Better Auth configuration, including its database adapter, schema, plugins, callbacks, and product-specific policy.

## Server functions

Framework access is injected, leaving TanStack Start available normally:

```ts
import { getRequest } from '@tanstack/react-start/server'
import { requireSameOrigin } from '@richardsolomou/ras-stack/auth'
import { createRpc } from '@richardsolomou/ras-stack/server'

export const { rpc, mutationRpc } = createRpc({
  getRequest,
  requireMutation: (request) => requireSameOrigin(request, { configured: [process.env.APP_URL] }),
})
```

## Realtime

The realtime entrypoint owns Centrifugo transport mechanics and token signing. Applications own channel names, authorization, presence information, and publication payloads:

```ts
import { CentrifugoPublisher, signRealtimeToken } from '@richardsolomou/ras-stack/realtime'

const publisher = new CentrifugoPublisher({
  apiUrl,
  apiKey,
  onError: (error, channel) => logger.error({ error, channel }, 'realtime publication failed'),
})
publisher.publish(`battle:${battle.id}`, { type: 'change' })

const token = signRealtimeToken(user.id, { channel: `battle:${battle.id}`, info: presence }, { secret })
```

## Email and uploads

Optional entrypoints integrate with dependencies that remain installed and available to the application:

```ts
import { createSmtpDelivery, createSmtpTransport, smtpConfigFromEnvironment } from '@richardsolomou/ras-stack/email'
import { createTusUpload, startTusUpload } from '@richardsolomou/ras-stack/uploads'

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

`createSmtpTransport()` and `createTusUpload()` return the upstream objects, so applications can use capabilities the convenience wrappers do not cover. Applications retain ownership of email templates, missing-email behavior, upload metadata, authorization, quotas, and completion processing.

## Shared configuration

Oxlint and TypeScript configurations are inheritable:

```json
{
  "extends": ["./node_modules/@richardsolomou/ras-stack/config/oxlint.json"],
  "rules": {
    "application-specific-rule": "off"
  }
}
```

```json
{
  "extends": "@richardsolomou/ras-stack/config/typescript/tanstack",
  "include": ["src", "vite.config.ts"]
}
```

## GitHub Actions

The shared setup action reads Node from `engines.node` and pnpm from `packageManager` in the consuming repository's `package.json`:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: richardsolomou/ras-stack/actions/setup-js@v0.1.0
    with:
      just-version: '1.58.0'
  - run: pnpm check
```
