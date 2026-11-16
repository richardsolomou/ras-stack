# convex

## 2

Wire the Content Security Policy through `start-app`'s `src/server/contentSecurityPolicy.ts`, so the application's policy changes stay out of the recipe-owned middleware.

Upgrade: after updating `start-app` to version 2, move the Convex `connect-src` sources from `src/server/middleware.ts` into `src/server/contentSecurityPolicy.ts`.

## 1

Convex backend for a TanStack Start application: functions under `convex/` with committed generated types, Convex queries through TanStack Query with server rendering, the Content Security Policy for the deployment, and a deploy workflow.
