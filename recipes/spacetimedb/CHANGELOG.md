# spacetimedb

## 4

Wire `packages: ['.']` into `pnpm-workspace.yaml`, because pnpm otherwise treats the module's `package.json` as a workspace project and reinstalls before every `pnpm exec` and `pnpm run`.

Upgrade: add `packages: ['.']` to `pnpm-workspace.yaml`.

## 3

`SpacetimeRequestError` declares `status` as a field instead of a parameter property, which Node's type stripping refused, so scripts run with `node` can import `src/server/spacetime.ts`. A connection takes an optional `fetch`.

Upgrade: none.

## 2

Wire the Content Security Policy through `start-app`'s `src/server/contentSecurityPolicy.ts`, so the application's policy changes stay out of the recipe-owned middleware.

Upgrade: after updating `start-app` to version 2, move `'unsafe-eval'` and the SpacetimeDB `connect-src` sources from `src/server/middleware.ts` into `src/server/contentSecurityPolicy.ts`.

## 1

SpacetimeDB module scaffold with committed client bindings, the browser connection, the server HTTP API helper, and a workflow that checks bindings and publishes the module.
