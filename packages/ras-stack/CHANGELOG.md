# ras-stack

## 0.47.1

### Patch Changes

- f0b2c01: Switch package licensing to MIT.

## 0.47.0

### Minor Changes

- fa32841: Compress proxied responses with zstd and gzip by default; pass `encode: false` to the Caddy proxy options to turn it off.

## 0.46.0

### Minor Changes

- da02d61: Add overrideable password-recovery defaults, auth email adapters, callback classification, safe redirects, and PostHog identity protections.

## 0.45.1

### Patch Changes

- 9b495a9: Preserve mutable nested account option types for Better Auth overrides.

## 0.45.0

### Minor Changes

- c12b415: Add secure, overrideable Better Auth account, provider, session, and rate-limit defaults.

## 0.44.0

### Minor Changes

- b7243d7: Allow `postHogIngestProxy` and `PostHogIntegration` to route through a custom ingest path instead of the hardcoded `/ingest`, since some ad-blocker lists block that literal path segment regardless of host.

## 0.43.0

### Minor Changes

- 9f118e6: Add prefixed Dokploy preview hostnames with optional Cloudflare-proxied DNS lifecycle.

## 0.42.1

### Patch Changes

- 89174a9: Generate Dokploy preview domains for applications running on the local server while preserving remote-server routing.

## 0.42.0

### Minor Changes

- 605c8f1: Support Dokploy-generated `sslip.io` preview domains and resolved preview URLs in environment templates.

## 0.41.1

### Patch Changes

- 1e9cc8a: Fix pre-publication validation for the packed create command.

## 0.41.0

### Minor Changes

- 5b9a417: Add the `create-ras-app` package so a production reference application can be generated with `pnpm create ras-app`. The wrapper calls the shared scaffold in-process, and both packages publish from the immutable release tag.

## 0.40.0

### Minor Changes

- 7cd121e: Add the `ras create` full-stack starter and production reference, and align supported peer floors with the APIs the starter uses.

## 0.39.5

### Patch Changes

- c9abae8: Use the shallow-safe setup action across shared workflows.

## 0.39.4

### Patch Changes

- 95e1db6: Use the shallow-safe dependency base check in the shared check workflow.

## 0.39.3

### Patch Changes

- c597d95: Accept current dependency branches in shallow CI checkouts.

## 0.39.2

### Patch Changes

- 0deaa5d: Add a client-transform-safe TanStack middleware entrypoint for canonical-host handling.

## 0.39.1

### Patch Changes

- 5c451fb: `canonicalRedirect` no longer redirects a request that arrived over the loopback interface. Centrifugo's connect proxy calls the application on `127.0.0.1`, which can never match the canonical host, so the middleware answered it with a 301. Go's HTTP client follows that redirect and turns the POST into a GET, which lands on the page shell and hands Centrifugo HTML to parse as JSON — surfacing in the browser as `{code: 100, message: "internal server error", temporary: true}` and retrying forever.

  Applications no longer need `/api/centrifugo/connect` in `pathsServedOnAnyHost`. Leaving it there is harmless.

## 0.39.0

### Minor Changes

- 59e1264: Remove the adoption policy. `ras policy check` and `ras policy sync` now only generate and verify the files that cannot inherit — the Changesets config, the Dependabot config, and the pnpm cooldown — and no longer govern which ras-stack version, Node version, pnpm version, or shared configuration a repository is on.

  `ras-stack/policy` drops the `adoptionDrift`, `adoptionSnapshotDrift`, and `syncAdoptionPolicy` exports. The `adoption` argument fails with the usage message rather than quietly running a repository sync in its place. An `adoption` block left in a `ras-stack.policy.json` is ignored rather than rejected, so upgrading does not break a repository that still declares one, but it no longer does anything and can be deleted.

  Choose the ras-stack version you want to ship. If it lacks something you use, the type checker and the failing import report it more precisely than a declared minimum.

## 0.38.3

### Patch Changes

- ee437ca: Advance the adoption baseline to 0.38.2 and point the shared workflows at that release. Repositories on an older line now report drift from `ras policy check adoption`, and `ras policy sync adoption` moves their package and workflow references forward.

## 0.38.2

### Patch Changes

- 8c1c8f4: `postgresRateLimitStore` now returns `resetAt` as a number. A `bigint` column arrives from Postgres.js as a string unless the client happens to configure a parser, so a store built on a plain `postgres()` client returned a string and callers comparing it against a timestamp got the wrong answer. The store converts its own columns rather than depending on how the connection was built.

## 0.38.1

### Patch Changes

- c025068: A release run that finds its branch has moved on now stands down instead of failing. Merging a second pull request while the first one's release is still queued is ordinary, and the run for the current head releases every pending changeset, so the earlier run has nothing left to do. It records `created=false` and a notice rather than a red build. A release that is genuinely stuck still fails loudly, because the existing tag-already-exists check is untouched.

## 0.38.0

### Minor Changes

- dd91690: Add `ras init`, which walks a repository to the adoption baseline the policy already enforces. It offers the policy selection and its generated files, the declared Node and pnpm versions, a `tsconfig.json` extending a shared preset, an `.oxlintrc.json`, a CI workflow pinned to the release that generated it, and a justfile. Every step is a separate question, an existing file needs its own answer before it is replaced, `--dry-run` reports the plan, and `--yes` accepts everything for a non-interactive run.
- a685a80: Add rate limiting for the routes an application writes, which Better Auth's own limiter does not reach. `createRateLimit` composes into the same `requireMutation` hook as the origin check, rejecting with `429` and `Retry-After`, `403` for a client it cannot identify, and a retryable `InfrastructureError` when the store is unavailable.

  Counters are shared rather than per-process so replicas enforce one budget between them: `postgresRateLimitStore` and `sqliteRateLimitStore` each increment in a single statement, and `memoryRateLimitStore` covers development. Applications own the table. `assertRateLimitStoreConformance` checks a store against the real database.

- 53c2306: Add conformance suites for three more mechanics that fail invisibly until production. `assertAuthSecretConformance` checks that the secret is long, random-looking, stable across calls, and overridden by `AUTH_SECRET`. `assertRealtimePublisherConformance` checks that a publisher bounds what it accepts and refuses work after `close()`. `assertSmtpConfigConformance` checks that half-configured SMTP is rejected rather than carried into a deployment.

## 0.37.0

### Minor Changes

- 578fdd5: Add `assertRealtimeTokenConformance` so a consumer can check the route that mints Centrifugo tokens against the shared secret. It verifies the token is HS256, binds the subject it was asked for, carries its claims, expires within a configurable maximum, and is signed with the secret Centrifugo shares.

## 0.36.2

### Patch Changes

- 67c36f1: Reduce container cache export time and reuse E2E layers in production builds.

## 0.36.1

### Patch Changes

- 4fd7454: Allow preview workflows to report status on pull requests.

## 0.36.0

### Minor Changes

- 60bfd8b: Add reusable actions and commands that publish, resolve, deploy, manage, and clean up immutable application previews without rebuilding source in Dokploy.

## 0.35.0

### Minor Changes

- 9e5b6d3: Add managed PostHog server analytics, exception, log, RPC, and shutdown telemetry.

## 0.34.1

### Patch Changes

- b53e216: Keep documentation version checks stable across generated releases.

## 0.34.0

### Minor Changes

- 7354d3a: Remove personal cross-repository fleet reporting from the public policy API.

## 0.33.0

### Minor Changes

- 1b209b3: Identify Better Auth users in PostHog and reset identity after sign-out.

## 0.32.0

### Minor Changes

- 7b46bb2: Use one `ras` command for assets, policy, preview status, and realtime development.

## 0.31.0

### Minor Changes

- b8088bd: Add composable PostHog browser, server, request-correlation, proxy, coverage, and conformance primitives.

## 0.30.1

### Patch Changes

- 15c8e84: Allow container-based development proxies to reach the realtime launcher through an explicit host binding.

## 0.30.0

### Minor Changes

- 130de62: Launch the pinned Centrifugo development container with explicit local configuration.

## 0.29.0

### Minor Changes

- 3558ea2: Report preview lifecycle status through a shared CLI and reusable workflow.

## 0.28.0

### Minor Changes

- 240b379: Compose the standard app, Centrifugo, and Caddy runtime with one lifecycle helper.

## 0.27.1

### Patch Changes

- eb6ac24: Support applications using better-sqlite3 13.

## 0.27.0

### Minor Changes

- afa18a3: Share safe GitHub check-run and pull-request comment state for application previews.

## 0.26.0

### Minor Changes

- 3c2c10c: Configure writable Caddy runtime directories so read-only containers can persist proxy state.

## 0.25.0

### Minor Changes

- 441912f: Support cancellable asynchronous realtime client creation in the React lifecycle adapter.

## 0.24.1

### Patch Changes

- 626a7c0: Keep Node-only auth secret modules outside the TanStack middleware entrypoint.

## 0.24.0

### Minor Changes

- 25ae6d1: Reject stale dependency branches before running shared JavaScript project checks.

## 0.23.0

### Minor Changes

- a34d0e2: Synchronize declared ras-stack, workflow, Node, pnpm, and Just adoption versions without downgrading newer references.

## 0.22.0

### Minor Changes

- db68279: Report adoption and toolchain drift across a declared repository fleet.

## 0.21.0

### Minor Changes

- 73e8cc5: Provide runner-neutral conformance assertions for real origin, health, SQLite, and dual-provider database compositions.

## 0.20.0

### Minor Changes

- 742144f: Share self-hosted process supervision, Centrifugo environment, and guarded Caddy proxy configuration.

## 0.19.0

### Minor Changes

- 9d0be64: Share secure trusted/fork preview image workflows and Dokploy application lifecycle mechanics.

## 0.18.0

### Minor Changes

- 17ba6d4: Share cached Playwright setup and production-container browser workflows with timing output.

## 0.17.0

### Minor Changes

- dc4f152: Declare, copy, and verify production server assets without shell copy chains.

## 0.16.0

### Minor Changes

- 3b74709: Separate client-safe infrastructure failures from private diagnostic causes.

## 0.15.0

### Minor Changes

- 79be211: Share browser-safe Better Auth failure classification and headless React action state.

## 0.14.0

### Minor Changes

- 5eef02b: Share optional React ownership hooks for realtime clients, subscriptions, and presence.

## 0.13.0

### Minor Changes

- 37d5313: Share keyed synchronous and asynchronous server singleton lifecycle across development reloads.

## 0.12.0

### Minor Changes

- 0984a35: Share native Drizzle PostgreSQL lifecycle and validated SQLite/PostgreSQL target selection.

## 0.11.0

### Minor Changes

- e85dc59: Share thin TanStack handlers for Better Auth, health checks, and canonical-host middleware.

## 0.10.0

### Minor Changes

- 5251a67: Share typed Drizzle SQLite lifecycle primitives while preserving native database access.

## 0.9.0

### Minor Changes

- fed41d4: Detect stale ras-stack and JavaScript toolchain references across repository manifests and workflows.

## 0.8.3

### Patch Changes

- db1b0bc: Test every published entrypoint through a clean package installation and browser bundle.

## 0.8.2

### Patch Changes

- 2c5330b: Embed TypeScript sources in published sourcemaps so consumer development servers can resolve them.

## 0.8.1

### Patch Changes

- 99159f6: Expose browser realtime helpers without loading the Node-only token signer entrypoint.

## 0.8.0

### Minor Changes

- de857bc: Add composable TypeScript runtime-role bases and opt-in Oxlint application and TanStack layers.

## 0.7.0

### Minor Changes

- 558b273: Add deterministic repository policy synchronization with committed-output drift checks and local overrides.

## 0.6.0

### Minor Changes

- 9f2800f: Add reusable JavaScript and browser check workflows around repository-owned commands.

## 0.5.0

### Minor Changes

- 6aa8a53: Add reusable Centrifugo client transport, subscription, recovery, and presence lifecycle helpers.

## 0.4.0

### Minor Changes

- 0aa50cf: Add optional TanStack Start RPC and Query integrations while preserving application-owned policy and configuration.

## 0.3.5

### Patch Changes

- 776e9bf: Target the repository explicitly when dispatching and monitoring npm publishing.

## 0.3.4

### Patch Changes

- fbed13e: Dispatch npm publishing through its top-level OIDC-trusted workflow.

## 0.3.3

### Patch Changes

- 6cea1a5: Expose release results from the reusable Changesets workflow to caller jobs.

## 0.3.2

### Patch Changes

- 247c9d4: Publish generated GitHub releases to npm through the OIDC-trusted workflow.

## 0.3.1

### Patch Changes

- 1f389e9: Adopt the shared Changesets release workflow and Just commands in ras-stack itself.
