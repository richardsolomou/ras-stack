<div align="center">

# ras-stack

**Best-practice defaults and reusable infrastructure for production TypeScript applications.**

TanStack Start · React · Better Auth · Drizzle · SQLite/PostgreSQL · Centrifugo · Caddy

[![npm](https://img.shields.io/npm/v/ras-stack)](https://www.npmjs.com/package/ras-stack) [![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/ras-stack/ci.yml?branch=main)](https://github.com/richardsolomou/ras-stack/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/ras-stack)](LICENSE)

</div>

`ras-stack` packages the infrastructure patterns shared by several real applications. It chooses focused tools for each job, applies secure production defaults, and removes the integration code that would otherwise be copied from one repository to the next.

It stays deliberately smaller than a framework. Applications can adopt one helper or the whole tested stack, override defaults, and keep direct access to every upstream library.

## Design goals

- **Use the right tool directly.** TanStack handles the web application, Better Auth handles authentication, Drizzle handles typed data, and Centrifugo handles realtime delivery. `ras-stack` integrates them instead of replacing them.
- **Share mechanics, not products.** Origin checks, database setup, token signing, process supervision, CI setup, and release mechanics should not be reimplemented for every application.
- **Keep configuration open.** Helpers return native objects, accept application callbacks and overrides, and remain available through narrow entrypoints. Adopting one boundary does not require adopting the rest.

## What it ships

The repository produces four independently usable things:

- **TypeScript modules** under narrow import paths such as `ras-stack/database/sqlite`, `ras-stack/realtime/react`, and `ras-stack/tanstack/server`.
- **Command-line tools** for generated policy, production assets, preview status, and a local Centrifugo container.
- **GitHub Actions and reusable workflows** for toolchain setup, checks, browser tests, previews, and Changesets releases.
- **A separate OCI image** containing verified Caddy and Centrifugo binaries for production images.

An application can use one surface without adopting the others. The npm package has no runtime dependency on the web, database, email, or realtime libraries; those integrations are optional peers.

## The supported stack

The package currently targets the following tested stack. Sealed Lists, Praetorium, and STL Quest use its application and runtime integrations in production. BaseKit and tro.gg use only the tooling that matches their different architectures.

| Layer               | Supported technology                           | What `ras-stack` centralizes                                                                          |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Runtime and tooling | Node 24, ESM TypeScript, pnpm, Just, Oxlint    | Strict compiler/linter bases, setup actions, and version synchronization                              |
| Web application     | TanStack Start 1, React 19, TanStack Query 5   | Request binding, mutation-origin checks, canonical hosts, health handlers, and Query defaults         |
| Authentication      | Better Auth                                    | Secure option builders, origins, secrets, tokens, failure classification, and React action state      |
| Data                | Drizzle, `better-sqlite3` 12–13, Postgres.js 3 | Native connection lifecycle, safety defaults, migrations, target selection, and conformance checks    |
| Realtime            | Centrifuge 5, Centrifugo 6, Caddy 2            | Publishing, tokens, browser/React lifecycle, presence, proxy configuration, binaries, and supervision |
| Email and uploads   | Nodemailer 9, `tus-js-client` 4                | SMTP configuration/delivery and promise-based resumable uploads                                       |
| Delivery            | GitHub Actions, Changesets, Dokploy, Docker    | Checks, releases, preview lifecycle/status, production assets, and runtime binaries                   |

These are tested combinations, not replacements for the upstream APIs. Applications still import and configure TanStack, Better Auth, Drizzle, Nodemailer, `tus-js-client`, Centrifuge, Centrifugo, and Caddy directly when they need their native behavior.

## What stays in the application

`ras-stack` owns mechanics that should behave the same in every application: opening a database safely, rejecting a cross-origin mutation, signing a realtime token, supervising processes, or reporting preview state.

The application owns product decisions: schemas, migrations, repositories, routes, authorization, auth plugins, email templates, upload rules, realtime channels and payloads, storage, deployment topology, and UI. `ras-stack` does not hide those behind a shared application factory or configuration object.

The [`examples/full-stack`](examples/full-stack) workspace shows the boundaries together and tests them through `workspace:*`. It is an integration contract and reference, not a starter to copy.

## Install and choose a boundary

`ras-stack` requires Node 24.

```sh
pnpm add ras-stack
```

Nodemailer, Centrifuge, `better-sqlite3`, Drizzle, Postgres.js, and `tus-js-client` are optional peer dependencies. Install them only when using their integrations:

```sh
pnpm add nodemailer
pnpm add centrifuge
pnpm add tus-js-client
pnpm add better-sqlite3 drizzle-orm
pnpm add postgres drizzle-orm
```

Start with the narrowest public entrypoint that owns the repeated mechanic:

| Need                                                      | Entrypoint or command                                                           | The application still owns                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Authentication defaults and browser action state          | `ras-stack/auth`, `ras-stack/auth/client`, `ras-stack/auth/react`               | Better Auth configuration, forms, policy, and navigation       |
| RPC, mutation-origin, health, and canonical-host handling | `ras-stack/server`, `ras-stack/tanstack/server`                                 | Routes, authorization, logging, and health work                |
| SQLite or PostgreSQL lifecycle                            | `ras-stack/database/*`                                                          | Schemas, migrations, repositories, and transactions            |
| Realtime publication and browser lifecycle                | `ras-stack/realtime/*`                                                          | Channels, tickets, payloads, presence models, and invalidation |
| Email, uploads, and production assets                     | `ras-stack/email`, `ras-stack/uploads`, `ras-stack-assets`                      | Templates, metadata, quotas, storage, and asset contents       |
| Production or development realtime runtime                | `ras-stack/runtime`, `ras-stack-realtime`                                       | Images, ports, secrets, volumes, and distributed policy        |
| Compiler, lint, CI, release, and preview mechanics        | `ras-stack/config/*`, `actions/*`, `.github/workflows/*`, `ras-stack/preview/*` | Triggers, permissions, services, deployment, and verification  |
| Generated repository policy and adoption checks           | `ras-stack-policy`                                                              | Which policies apply and every declared exception              |

## Guides

| Guide                                                    | What it covers                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [Application primitives](docs/application-primitives.md) | Authentication, request security, databases, realtime clients, email, uploads, and stateful development resources                           |
| [Repository tooling](docs/repository-tooling.md)         | TypeScript and Oxlint configuration, generated policy, fleet checks, GitHub Actions, previews, releases, and production runtime composition |
| [Full-stack example](docs/full-stack-example.md)         | The `workspace:*` integration contract, local development, production container, and two-browser journey                                    |

## Development

Development requires Node 24, pnpm 11.15.0, and Just 1.58.0.

```sh
just install
just check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for release instructions. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0](LICENSE).
