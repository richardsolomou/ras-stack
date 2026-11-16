# Recipes

Recipes are how Richard's applications are built: working code an application copies once and then owns, with the decisions behind it written down. Each application records the recipes it took in `ras-recipes.json`, and the [`ras-recipes` skill](../skills/ras-recipes/SKILL.md) adds them, merges later recipe changes into the application's own copy, and reports drift. To change a recipe, follow [AUTHORING.md](AUTHORING.md).

## Choosing

Every application starts with [`tooling`](tooling/README.md), [`start-app`](start-app/README.md), [`posthog-web`](posthog-web/README.md), and [`ci`](ci/README.md). Then answer these in order.

**Where does the data live?**

| The application                                                    | Recipes                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Has no backend data: a tool that runs in the browser               | none, and deploy to Cloudflare                                                                           |
| Keeps relational data on its own server                            | [`database-sqlite`](database-sqlite/README.md), the default: one file, online backup, no database server |
| Needs SQLite without a native build                                | [`database-libsql`](database-libsql/README.md)                                                           |
| Needs several replicas, a managed database, or Postgres features   | [`database-postgres`](database-postgres/README.md)                                                       |
| Is a live, collaborative product and should not run its own server | [`convex`](convex/README.md)                                                                             |
| Is a game or simulation whose state and rules live in the database | [`spacetimedb`](spacetimedb/README.md), usually beside a SQL database for accounts                       |

**Where does it run?**

| The application                                      | Recipe                                               |
| ---------------------------------------------------- | ---------------------------------------------------- |
| Has a server process, a database file, or Centrifugo | [`deploy-dokploy`](deploy-dokploy/README.md) on hera |
| Is prerendered pages and stateless server functions  | [`deploy-cloudflare`](deploy-cloudflare/README.md)   |

**What else does it need?**

| Need                                                | Recipe                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Server analytics, errors, logs, metrics, and traces | [`posthog-server`](posthog-server/README.md), for every application on Dokploy |
| Accounts                                            | [`auth`](auth/README.md), with a SQL database                                  |
| Analytics tied to the signed-in user                | [`posthog-auth-identity`](posthog-auth-identity/README.md)                     |
| Transactional email                                 | [`email-posthog`](email-posthog/README.md), the default                        |
| Email through a mail server someone else configures | [`email-smtp`](email-smtp/README.md)                                           |
| Live updates on top of a SQL application            | [`realtime`](realtime/README.md)                                               |
| File uploads                                        | [`uploads`](uploads/README.md)                                                 |

Resend and other email providers are not recipes: PostHog sends the same email without another account, and its sends join the recipient's product history.

## Stacks

Each stack in [`../stacks`](../stacks) is a complete application assembled from recipes and checked in CI. Read the matching stack file when a recipe's wiring is unclear.

| Stack                                  | Shape                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| [`full-stack`](../stacks/full-stack)   | Accounts, SQLite, PostHog email, realtime, and uploads in one container on Dokploy. |
| [`postgres`](../stacks/postgres)       | Accounts on PostgreSQL with SMTP email, on Dokploy.                                 |
| [`spacetime`](../stacks/spacetime)     | A SpacetimeDB application with accounts on libsql, on Dokploy.                      |
| [`convex`](../stacks/convex)           | A Convex application on Cloudflare.                                                 |
| [`client-only`](../stacks/client-only) | A browser tool with no backend data on Cloudflare.                                  |

## Checks

`pnpm recipes` (or `just check-recipes [stack…]`) validates every recipe and assembles and checks every stack. See [AUTHORING.md](AUTHORING.md#checks).
