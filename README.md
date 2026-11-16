<div align="center">
  <img src="apps/web/public/favicon.svg" width="80" alt="ras-stack logo" />

# ras-stack

**Opinionated recipes for TypeScript web apps. Copy them in, extend them, own them.**

[Recipes](#recipes-) · [Get started](#get-started-) · [Documentation](docs/README.md) · [npm](https://www.npmjs.com/package/ras-stack)

[![npm](https://img.shields.io/npm/v/ras-stack)](https://www.npmjs.com/package/ras-stack) [![Build](https://img.shields.io/github/actions/workflow/status/richardsolomou/ras-stack/ci.yml?branch=main)](https://github.com/richardsolomou/ras-stack/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/richardsolomou/ras-stack)](LICENSE)

Working, tested code for the parts web apps keep needing: the app shell, accounts, email, databases, realtime, uploads, analytics, deploys, and CI. The configuration is still there; you just don't have to think about it.

</div>

## How it works ✨

Think [shadcn/ui](https://ui.shadcn.com), for the rest of the stack. A recipe is not a dependency: once you copy it in, it's yours.

1. **Pick recipes** from the [catalogue](#recipes-) or the [decision guide](recipes/README.md).
2. **Your agent adds them** with the [`ras-recipes` skill](skills/ras-recipes/SKILL.md), which copies the files, wires them in, and records them in `ras-recipes.json`.
3. **Extend them.** The code lives in your repository, so change it like any other code.
4. **Update when you want.** The skill merges recipe fixes into your edited copy and asks about anything it can't merge.

## Why copy instead of depend? 🔁

A library hides its code behind an API: when it almost fits, you wait for a release, wrap it, or fork it. A recipe puts the code where you and your agent can read and change it.

Copying usually means losing updates. Recipes keep them: `ras-recipes.json` records where each recipe came from, so later fixes merge into your copy without overwriting your changes.

## Opinionated on purpose 🎯

One focused set of tools, not a menu of every option. Each recipe makes one choice and writes down why, often because of something that broke in production. From [`email-posthog`](recipes/email-posthog):

> **Errors throw.** `posthog.emails.send` resolves `{ data, error }` and never rejects; the adapter turns `error` into a rejection, so a failed reset email fails the request instead of silently succeeding.

The choices the recipes make:

- **TanStack Start, React, Query, and Tailwind** for every app, even browser-only tools.
- **SQLite** unless you need more: Postgres, Convex, or SpacetimeDB.
- **PostHog** for analytics, errors, logs, traces, and email.
- **Better Auth** for accounts.
- **Dokploy** for anything with state, **Cloudflare Workers** for the rest.
- **One `pnpm check`** for formatting, linting, types, and tests.

## Recipes 📚

| Area          | Recipe                                                   | What it adds                                                  |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Foundation    | [`tooling`](recipes/tooling)                             | Shared presets and one `pnpm check`.                          |
|               | [`start-app`](recipes/start-app)                         | The app shell, with request security and deploy recovery.     |
|               | [`ci`](recipes/ci)                                       | Checks on every pull request, and grouped Dependabot updates. |
| Data          | [`database-sqlite`](recipes/database-sqlite)             | SQLite with Drizzle, migrations, and backups.                 |
|               | [`database-libsql`](recipes/database-libsql)             | SQLite through libsql, with no native build.                  |
|               | [`database-postgres`](recipes/database-postgres)         | PostgreSQL with Drizzle and migrations.                       |
|               | [`convex`](recipes/convex)                               | Convex served through TanStack Query.                         |
|               | [`spacetimedb`](recipes/spacetimedb)                     | A SpacetimeDB module with a guarded publish.                  |
| Accounts      | [`auth`](recipes/auth)                                   | Better Auth sign-in and server sessions.                      |
| Email         | [`email-posthog`](recipes/email-posthog)                 | Transactional email from PostHog templates.                   |
|               | [`email-smtp`](recipes/email-smtp)                       | Transactional email over SMTP.                                |
| Features      | [`realtime`](recipes/realtime)                           | Live updates with Centrifugo.                                 |
|               | [`uploads`](recipes/uploads)                             | Resumable uploads with limits.                                |
| Observability | [`posthog-web`](recipes/posthog-web)                     | PostHog in the browser, with a same-origin proxy.             |
|               | [`posthog-server`](recipes/posthog-server)               | PostHog on the server: events, errors, logs, and traces.      |
|               | [`posthog-auth-identity`](recipes/posthog-auth-identity) | PostHog people from the signed-in user.                       |
| Deploy        | [`deploy-dokploy`](recipes/deploy-dokploy)               | A container on Dokploy, with a preview per pull request.      |
|               | [`deploy-cloudflare`](recipes/deploy-cloudflare)         | Cloudflare Workers with prerendered pages.                    |

Each recipe's page explains when to use it, its decisions, and how to wire and verify it.

## Get started 🚀

Install the skill into your coding agent:

```sh
npx skills add richardsolomou/ras-stack
```

Or link `skills/ras-recipes` from a clone into your agent's skills directory. It needs Node 24 and git.

Then ask your agent in plain words:

- **A new application**: "Start a new app with ras recipes: SQLite, accounts, PostHog email, deployed to Dokploy."
- **A new capability**: "Add the uploads recipe."
- **Existing code**: "Adopt the ras recipes for what this app already does."
- **Updates**: "Update the ras recipes."

Or run the skill's script yourself from the application's root:

```sh
node <skill>/scripts/recipes.mjs list                   # every recipe, its version, and summary
node <skill>/scripts/recipes.mjs add database-sqlite    # copy the files and record the recipe
node <skill>/scripts/recipes.mjs status                 # what you took, what you changed, what is behind
node <skill>/scripts/recipes.mjs update database-sqlite # merge the recipe's changes into your copy
```

## Stacks 🧱

Each stack is a complete application built from recipes and checked in CI, so every recipe is proven working together with the others.

| Stack                               | Shape                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| [`full-stack`](stacks/full-stack)   | Accounts, SQLite, PostHog email, realtime, and uploads in one container on Dokploy. |
| [`postgres`](stacks/postgres)       | Accounts on PostgreSQL with SMTP email, on Dokploy.                                 |
| [`spacetime`](stacks/spacetime)     | A SpacetimeDB application with accounts on libsql, on Dokploy.                      |
| [`convex`](stacks/convex)           | A Convex application on Cloudflare.                                                 |
| [`client-only`](stacks/client-only) | A browser tool with no backend data, on Cloudflare.                                 |

## The npm package 📦

The [`ras-stack`](packages/ras-stack/README.md) package holds the little that stays shared: the TypeScript and Oxlint presets, and `ras preview` for Dokploy previews. The repository also publishes [GitHub Actions and reusable workflows](docs/repository-tooling.md). Coming from v5? See [Migrate from v5](docs/upgrades.md).

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
