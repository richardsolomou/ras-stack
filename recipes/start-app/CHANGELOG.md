# start-app

## 2

Move the Content Security Policy's sources into `src/server/contentSecurityPolicy.ts`, a starter the application owns, so its own sources no longer conflict with updates to `src/server/middleware.ts`.

Render the document from the root route's `shellComponent` and mount providers in its `component`, so root-level error and not-found pages render inside the document.

Upgrade: the update adds `src/server/contentSecurityPolicy.ts` with the default policy. Move every source the application added to the policy in `src/server/middleware.ts` into it, and keep the recipe's `securityHeaders`, which builds the header from it. If the application's root route has its own document, move it into the `Document` shell and keep its providers in `Root`. If it commits `src/routeTree.gen.ts`, run `git rm --cached src/routeTree.gen.ts`. Drop any `notes` entry about policy edits in `src/server/middleware.ts`, which the application no longer makes.

## 1

TanStack Start application shell with Query, Tailwind, request-origin security, deploy survival, a canonical host, security headers, a health route, and the server composition root.
