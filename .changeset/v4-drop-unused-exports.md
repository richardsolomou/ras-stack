---
'ras-stack': major
---

Remove exports no consuming application imports. The `ras` commands and reusable workflows keep working.

- Entrypoints `ras-stack/build`, `ras-stack/changesets`, and `ras-stack/preview/github`: use `ras assets`, `ras changesets check`, and `ras preview <state>`.
- Entrypoint `ras-stack/posthog/client`: `PostHogIntegration` applies the browser options, and the SDK's tracing headers carry the person and session.
- Application rate limiting: `createRateLimit`, `memoryRateLimitStore`, `rateLimitTable`, `forwardedClientAddress`, `sqliteRateLimitStore`, `postgresRateLimitStore`, and `assertRateLimitStoreConformance`. `standardRateLimitOptions` still covers the Better Auth routes.
- Realtime presence: `watchSubscriptionPresence` and `useRealtimePresence`. Use the Centrifuge subscription's `presence()` and `join`/`leave` events.
- `ras-stack/auth`: `acceptedOrigins`, `requireSameOrigin`. Use `validSameOriginRequest` or `requireTanStackMutationOrigin`.
- `ras-stack/conformance`: `ConformanceError` and the auth secret, health handler, PostHog browser, PostHog request, realtime publisher, realtime token, and SMTP configuration assertions.
- `ras-stack/database/postgres`: `closeDrizzlePostgres`, `migrateDrizzlePostgres`, `redactedPostgresUrl`. Call `connection.client.end()` and Drizzle's `migrate()` directly.
- `ras-stack/database/sqlite`: `configureSqlite`. Pass `pragmas` to `openSqliteClient`.
- `ras-stack/email`: `createAuthEmailHandler`, `createSmtpTransport`. Use `standardAuthEmails` and `createSmtpDelivery`.
- `ras-stack/posthog`: `POSTHOG_DISTINCT_ID_HEADER`, `POSTHOG_SESSION_ID_HEADER`, `postHogHttpUrl`.
- `ras-stack/posthog/proxy`: `POSTHOG_DEFAULT_INGEST_PATH`. The default path stays `/t`.
- `ras-stack/posthog/react`: `usePostHog`. Import it from `@posthog/react`.
- `ras-stack/posthog/server`: `createPostHogServerClient`, `shutdownPostHogServerClient`. Use `createManagedPostHogServerTelemetry`.
- `ras-stack/preview/dokploy`: `DokployPreviewManager`, `previewHostname`. `dokployPreviewFromEnvironment` still returns the manager.
- `ras-stack/realtime`: the browser helpers it re-exported. Import the remaining ones from `ras-stack/realtime/client`.
- `ras-stack/realtime/client`: `connectRealtimeClient`, `openRealtimeSubscription`, `sameOriginWebSocketUrl`. Use the native Centrifuge client, `useConnectedRealtimeClient`, `useRealtimeSubscription`, or `createSameOriginRealtimeClient`.
- `ras-stack/runtime`: `caddyRuntimeEnvironment`, `centrifugoEnvironment`, `superviseProcesses`, `runRealtimeDev`. Use `runRealtimeStack` and `ras realtime`.
- `ras-stack/server`: `InfrastructureError`, `canonicalRedirect`, `createRpc`, `currentServerFunction`, `infrastructureDiagnostic`, `safeInfrastructureError`, `withServerFunction`. Use `canonicalHostMiddleware`, `createTanStackRpc`, and `serverFunctionIdentityMiddleware`.
- `ras-stack/tanstack/middleware`: `canonicalHostRequest`. Use `canonicalHostMiddleware`.
- `ras-stack/tanstack/server`: `betterAuthHandlers` and the middleware re-exports. Import middleware from `ras-stack/tanstack/middleware`.
- `ras-stack/uploads`: `uploadWithTus`, `tusResponse`, `tusResponseMessage`. Use `startTusUpload(createTusUpload(options))`.
- The `report-preview-status.yml` reusable workflow. The Dokploy preview workflows report status themselves.
