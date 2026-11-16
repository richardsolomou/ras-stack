# start-app

## 2

Move the Content Security Policy's sources into `src/server/contentSecurityPolicy.ts`, a starter the application owns, so its own sources no longer conflict with updates to `src/server/middleware.ts`.

Upgrade: the update adds `src/server/contentSecurityPolicy.ts` with the default policy. Move every source the application added to the policy in `src/server/middleware.ts` into it, and keep the recipe's `securityHeaders`, which builds the header from it.

## 1

TanStack Start application shell with Query, Tailwind, request-origin security, deploy survival, a canonical host, security headers, a health route, and the server composition root.
