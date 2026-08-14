# ras-stack

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
