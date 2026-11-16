<div align="center">
  <img src="apps/web/public/favicon.svg" width="80" alt="ras-stack logo" />

# ras-stack

**Full-stack application code you copy, own, and keep up to date.**

[Recipes](#recipes-) · [Get started](#get-started-) · [Documentation](docs/README.md) · [npm](https://www.npmjs.com/package/ras-stack)

[![npm](https://img.shields.io/npm/v/ras-stack)](https://www.npmjs.com/package/ras-stack) [![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/ras-stack/ci.yml?branch=main)](https://github.com/richardsolomou/ras-stack/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/ras-stack)](LICENSE)

Recipes for the parts every web application needs: the app shell, accounts, email, databases, realtime, uploads, analytics, deploys, previews, and CI. An agent copies a recipe into your application, and later merges the recipe's fixes into the copy you have changed.

</div>

## How it works ✨

Think [shadcn/ui](https://ui.shadcn.com), but for full-stack application code and how it runs in production. A recipe is not a dependency. It is working code, with its tests, that you copy into your repository once and then own.

1. **Pick recipes** for what the application needs, from the [catalogue](#recipes-) or the [decision guide](recipes/README.md).
2. **Your agent adds them** with the [`ras-recipes` skill](skills/ras-recipes/SKILL.md): it copies the files, installs the packages, wires the recipe into the files other recipes own, and records what it took in `ras-recipes.json`.
3. **Change the code freely.** It is yours, so you and your agent read and edit it like the rest of the application, and write down deliberate differences as notes.
4. **Take updates when you want them.** The skill three-way merges each recipe change into your edited copy, using the commit you took it from as the base, and walks you through anything it cannot merge.

## Why copy instead of depend? 🔁

A runtime library hides its code behind an API. When it does almost what you need, you wait for a release, wrap it, or fork it, and your agent can only guess at what happens inside. A recipe puts the code where you and your agent can read it, debug it, and change it in place.

Copying usually means losing updates. Recipes keep them: `ras-recipes.json` records the commit each recipe came from, so a fix to a recipe merges into your copy without overwriting your changes, and its changelog says why it changed and what a merge cannot do for you.

## Opinionated on purpose 🎯

Each recipe makes one choice and writes down why, including the incidents behind it, so whoever changes the code next knows what it protects against. The recipes come from applications running in production, and many of the reasons are what broke there. From [`email-posthog`](recipes/email-posthog):

> **Errors throw.** `posthog.emails.send` resolves `{ data, error }` and never rejects; the adapter turns `error` into a rejection, so a failed reset email fails the request instead of silently succeeding.

The choices the recipes make:

- **One shell for every application**: TanStack Start, React, TanStack Query, and Tailwind, with request security and recovery from deploys built in. Even a browser-only tool uses it, so every application has the same shape.
- **SQLite unless you need more**: one file, online backup, and no database server. Postgres when you need replicas or a managed database, Convex for a live, collaborative product, and SpacetimeDB for a game.
- **PostHog for analytics, errors, logs, traces, and transactional email**, so one account covers them and every email joins the recipient's product history.
- **Better Auth for accounts**, on the application's own database.
- **Two ways to deploy**: a container on an arm64 Dokploy server for anything that keeps state, with a preview per pull request, and Cloudflare Workers for prerendered pages and stateless server functions.
- **One `pnpm check`** across Oxfmt, type-aware Oxlint, TypeScript, and Vitest, which CI runs on every pull request, and packages must be a week old before they install.

## Recipes 📚

| Area          | Recipe                                                   | What it adds                                                                                                 |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Foundation    | [`tooling`](recipes/tooling)                             | TypeScript, Oxlint, Oxfmt, and Vitest on the shared presets, behind one `pnpm check`.                        |
|               | [`start-app`](recipes/start-app)                         | The TanStack Start, React, Query, and Tailwind shell, with request security and deploy survival.             |
|               | [`ci`](recipes/ci)                                       | `pnpm check` on every pull request and push to main, with a grouped, cooled-down Dependabot policy.          |
| Data          | [`database-sqlite`](recipes/database-sqlite)             | SQLite through better-sqlite3 and Drizzle, migrated at startup, with online backup and validated restore.    |
|               | [`database-libsql`](recipes/database-libsql)             | SQLite through the libsql client and Drizzle, with no native build step.                                     |
|               | [`database-postgres`](recipes/database-postgres)         | PostgreSQL through Postgres.js and Drizzle, migrated at startup.                                             |
|               | [`convex`](recipes/convex)                               | Convex as the backend, with Convex queries served through TanStack Query.                                    |
|               | [`spacetimedb`](recipes/spacetimedb)                     | A SpacetimeDB module beside the application, with committed bindings and a guarded publish.                  |
| Accounts      | [`auth`](recipes/auth)                                   | Email, password, and social sign-in with Better Auth, and sessions for server functions.                     |
| Email         | [`email-posthog`](recipes/email-posthog)                 | Transactional email from PostHog email templates.                                                            |
|               | [`email-smtp`](recipes/email-smtp)                       | Transactional email through an SMTP server, with a hard deadline on every exchange.                          |
| Features      | [`realtime`](recipes/realtime)                           | Centrifugo live updates with signed tokens, React hooks, and a container supervisor.                         |
|               | [`uploads`](recipes/uploads)                             | Resumable tus uploads with owners, limits, and cleanup.                                                      |
| Observability | [`posthog-web`](recipes/posthog-web)                     | Browser PostHog with privacy defaults, a same-origin ingest proxy, error capture, and source-map upload.     |
|               | [`posthog-server`](recipes/posthog-server)               | Server analytics, exceptions, logs, metrics, and spans, flushed on shutdown.                                 |
|               | [`posthog-auth-identity`](recipes/posthog-auth-identity) | PostHog identity from the Better Auth session, in the browser and on the server.                             |
| Deploy        | [`deploy-dokploy`](recipes/deploy-dokploy)               | A small non-root image deployed to Dokploy from main by digest, with a preview per pull request.             |
|               | [`deploy-cloudflare`](recipes/deploy-cloudflare)         | Cloudflare Workers with prerendered pages and security headers on static assets, deployed by Workers Builds. |

Each recipe's page covers when to use it, every decision and why, its files, the wiring into other recipes' files, configuration, and how to verify it. The [decision guide](recipes/README.md) picks the recipes for an application.

## Get started 🚀

Install the skill into your coding agent:

```sh
npx skills add richardsolomou/ras-stack
```

Or clone this repository and link `skills/ras-recipes` into your agent's skills directory. The skill reads recipes from this repository's `main` branch, from the clone it sits in or from one it makes in `~/.cache/ras-stack`, and needs Node 24 and git.

Then ask your agent in plain words:

- **A new application**: "Start a new app with ras recipes: SQLite, accounts, PostHog email, deployed to Dokploy."
- **A new capability**: "Add the uploads recipe."
- **Existing code**: "Adopt the ras recipes for what this app already does." The skill records the recipe over your code instead of copying it twice, so future updates merge.
- **Updates**: "Update the ras recipes." The skill shows what changed and why, merges each recipe, and asks you to resolve real conflicts.

The skill's script does the mechanical part, and you can run it yourself from the application's root:

```sh
node <skill>/scripts/recipes.mjs list                   # every recipe, its version, and summary
node <skill>/scripts/recipes.mjs add database-sqlite    # copy the files and record the recipe
node <skill>/scripts/recipes.mjs status                 # what you took, what you changed, what is behind
node <skill>/scripts/recipes.mjs update database-sqlite # merge the recipe's changes into your copy
```

The wiring and configuration in each recipe's page are for you or your agent to apply.

## Stacks 🧱

Every recipe is proven in a stack: a complete application assembled from recipes, wired, and checked in CI on every change. When a recipe's wiring is unclear, read the matching stack.

| Stack                               | Shape                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| [`full-stack`](stacks/full-stack)   | Accounts, SQLite, PostHog email, realtime, and uploads in one container on Dokploy. |
| [`postgres`](stacks/postgres)       | Accounts on PostgreSQL with SMTP email, on Dokploy.                                 |
| [`spacetime`](stacks/spacetime)     | A SpacetimeDB application with accounts on libsql, on Dokploy.                      |
| [`convex`](stacks/convex)           | A Convex application on Cloudflare.                                                 |
| [`client-only`](stacks/client-only) | A browser tool with no backend data, on Cloudflare.                                 |

## The npm package 📦

Applications copy almost everything. The [`ras-stack`](packages/ras-stack/README.md) package holds the little they share instead: the TypeScript and Oxlint presets the `tooling` recipe extends, and the `ras preview` command the Dokploy preview workflows run. This repository also publishes GitHub Actions, reusable workflows, and a runtime binaries image; see [repository tooling](docs/repository-tooling.md).

Coming from v5, whose runtime helpers these recipes replace? Follow [Migrate from v5](docs/upgrades.md).

## Development 🛠️

Development requires Node 24.x, pnpm 11.15.0, and Just 1.58.0.

```sh
just install
just check
just check-recipes
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and releases, and [AUTHORING.md](recipes/AUTHORING.md) to write or change a recipe. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

<!-- markdownlint-disable-file MD033 MD041 -->
