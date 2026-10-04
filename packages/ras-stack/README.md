# 🧱 ras-stack

**A practical TypeScript stack with strong defaults and room to make it yours.**

TanStack Start · React · Better Auth · Drizzle · SQLite/PostgreSQL · Centrifugo · Caddy · PostHog

[![npm](https://img.shields.io/npm/v/ras-stack)](https://www.npmjs.com/package/ras-stack) [![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/ras-stack/ci.yml?branch=main)](https://github.com/richardsolomou/ras-stack/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/ras-stack)](https://github.com/richardsolomou/ras-stack/blob/main/packages/ras-stack/LICENSE)

I kept rebuilding the same boring parts: secure sessions, origin checks, database startup, realtime connections, process shutdown, CI, previews, and releases. `ras-stack` solves them once with the libraries I would choose anyway.

It is opinionated about security, lifecycle, failure handling, and supply-chain checks, but not product behavior. Use one helper or the whole stack, override what differs, and keep access to the library underneath.

## The idea 💡

TanStack handles the web application, Better Auth handles authentication, Drizzle handles typed data, and Centrifugo handles realtime delivery. `ras-stack` connects them; it does not replace them.

A helper belongs here when it removes a repeated decision or failure mode without hiding the underlying tool. Helpers return native objects, accept overrides, and live behind narrow entrypoints so applications can always drop down a level.

## What you get 📦

It ships as independently versioned packages and deployment tooling:

- **TypeScript modules** under narrow import paths such as `ras-stack/database/sqlite`, `ras-stack/realtime/react`, and `ras-stack/tanstack/server`.
- **Configuration presets** in the dependency-free `ras-stack-config` package for TypeScript and Oxlint.
- **Command-line tools** for changeset validation, production assets, preview status, and a local Centrifugo container.
- **GitHub Actions and reusable workflows** for toolchain setup, checks, browser tests, previews, and Changesets releases.
- **A separate OCI image** containing verified Caddy and Centrifugo binaries for production images.

An application can use one surface without adopting the others. The npm package has no runtime dependency on the web, database, email, or realtime libraries; those integrations are optional peers.

## The stack 🧰

| Layer               | Supported technology                        | What `ras-stack` centralizes                                                                          |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Runtime and tooling | Node, ESM TypeScript, pnpm, Just, Oxlint    | Compiler/linter bases, setup actions, and version synchronization                                     |
| Web application     | TanStack Start, React, TanStack Query       | Request binding, mutation-origin checks, canonical hosts, health handlers, and Query defaults         |
| Authentication      | Better Auth                                 | Secure option builders, origins, secrets, redirects, failure classification, and React action state   |
| Data                | Drizzle, `better-sqlite3`, Postgres.js      | Connection lifecycle, safety defaults, migrations, target selection, and conformance checks           |
| Realtime            | Centrifuge, Centrifugo, Caddy               | Publishing, tokens, browser/React lifecycle, presence, proxy configuration, binaries, and supervision |
| Email and uploads   | Nodemailer, `tus-js-client`                 | SMTP configuration/delivery, auth callbacks, and promise-based resumable uploads                      |
| Observability       | PostHog JS, React, Node, and OpenTelemetry  | Analytics, replay, errors, logs, metrics, tracing, correlation, proxying, shutdown, and coverage      |
| Delivery            | GitHub Actions, Changesets, Dokploy, Docker | Checks, releases, preview lifecycle/status, production assets, and runtime binaries                   |

Applications still configure every upstream library directly. This table describes what is tested together, not a replacement API.

## Where it stops 🧭

`ras-stack` owns mechanics that should behave the same everywhere: safe database startup, mutation-origin checks, realtime tokens, process supervision, and preview status.

The application keeps schemas, migrations, repositories, routes, authorization, templates, upload rules, realtime payloads, storage, deployment topology, and UI. There is no shared application factory or giant configuration object.

The [`examples/full-stack`](https://github.com/richardsolomou/ras-stack/tree/main/examples/full-stack) workspace shows the boundaries together and tests them through `workspace:*`. It is the repository's integration fixture; applications own their integration code and dependency versions.

## Installation

`ras-stack` requires Node 24. Install the runtime package for application helpers and the configuration package for compiler/linter presets:

```sh
pnpm add ras-stack
pnpm add -D ras-stack-config
```

Import helpers from their narrow entrypoints and install the upstream peer libraries required by the integrations you use. Configuration-only repositories need just `ras-stack-config`.

## Dokploy previews 🚀

Three reusable workflows provide the standard pull-request preview lifecycle:

- `build-dokploy-preview.yml` builds commit-specific images without exposing secrets to forks.
- `deploy-dokploy-preview.yml` publishes, resolves, deploys, reports, and removes previews.
- `prune-dokploy-previews.yml` cleans up applications and images left behind by interrupted runs.

Applications supply only their package, application prefix, port, environment template, and optional product hook. They can provide a custom HTTPS domain, optionally manage a prefixed Cloudflare-proxied record for origins that reject direct traffic, or let Dokploy generate an HTTP `sslip.io` address. The shared `DOKPLOY_URL`, `DOKPLOY_API_KEY`, and staging-only `DOKPLOY_ENVIRONMENT_ID` secrets can be configured once at organization level. See [Repository tooling](https://github.com/richardsolomou/ras-stack/blob/main/docs/repository-tooling.md) for the caller contract, private-registry options, and lifecycle hooks.

## Guides 📚

| Guide                                                                                                                  | What it covers                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Application primitives](https://github.com/richardsolomou/ras-stack/blob/main/docs/application-primitives.md)         | Authentication, request security, databases, realtime clients, email, uploads, and stateful development resources                 |
| [Repository tooling](https://github.com/richardsolomou/ras-stack/blob/main/docs/repository-tooling.md)                 | TypeScript and Oxlint configuration, changeset validation, GitHub Actions, previews, releases, and production runtime composition |
| [PostHog integration](https://github.com/richardsolomou/ras-stack/blob/main/docs/posthog.md)                           | Browser/server setup, identity and session correlation, ingest proxying, shutdown and source-map responsibility                   |
| [Full-stack example](https://github.com/richardsolomou/ras-stack/blob/main/docs/full-stack-example.md)                 | The `workspace:*` integration contract, local development, production container, and two-browser journey                          |
| [Production operations](https://github.com/richardsolomou/ras-stack/blob/main/docs/production-reference-operations.md) | Migration, backup/restore, rollback, configuration, proxy, shutdown, and supply-chain boundaries                                  |

## Development 🛠️

Development requires Node 24, pnpm 11.15.0, and Just 1.58.0.

```sh
just install
just check
```

See [CONTRIBUTING.md](https://github.com/richardsolomou/ras-stack/blob/main/CONTRIBUTING.md) for release instructions. Report vulnerabilities privately as described in [SECURITY.md](https://github.com/richardsolomou/ras-stack/blob/main/SECURITY.md).

## License

[MIT](https://github.com/richardsolomou/ras-stack/blob/main/packages/ras-stack/LICENSE).
