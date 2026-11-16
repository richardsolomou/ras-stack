# spacetimedb

## 2

Wire the Content Security Policy through `start-app`'s `src/server/contentSecurityPolicy.ts`, so the application's policy changes stay out of the recipe-owned middleware.

Upgrade: after updating `start-app` to version 2, move `'unsafe-eval'` and the SpacetimeDB `connect-src` sources from `src/server/middleware.ts` into `src/server/contentSecurityPolicy.ts`.

## 1

SpacetimeDB module scaffold with committed client bindings, the browser connection, the server HTTP API helper, and a workflow that checks bindings and publishes the module.
