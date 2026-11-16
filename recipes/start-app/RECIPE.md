---
name: start-app
version: 1
summary: TanStack Start, React, Query, and Tailwind application shell with request security and deploy survival.
requires: []
conflicts: []
dependencies:
  ['@tanstack/react-query', '@tanstack/react-router', '@tanstack/react-router-ssr-query', '@tanstack/react-start', react, react-dom]
devDependencies: ['@tailwindcss/vite', '@types/react', '@types/react-dom', '@vitejs/plugin-react', tailwindcss]
wires: [package.json, .gitignore, .oxlintrc.json]
starters: [src/routes/index.tsx]
---

# start-app

## Use it when

The application has a server: pages rendered by TanStack Start, server functions, or API routes. This is the default for every full-stack application, and the recipe every other server recipe wires into. Add a deploy recipe (`deploy-dokploy` or `deploy-cloudflare`) to ship it.

A client-only tool with no backend data, such as an image converter, uses it too, prerendered on Cloudflare: Start's server routes carry PostHog's ingest proxy, and one shell keeps every application the same shape. See `stacks/client-only/`.

## Decisions

- **Deploy-target agnostic.** The recipe adds TanStack Start, React, and Tailwind to `vite.config.ts` and nothing else. `vite build` alone produces `dist/client` and a `dist/server/server.js` fetch handler, and `vite preview` serves them, so the shell builds and runs without either deploy plugin. `deploy-dokploy` adds Nitro and `deploy-cloudflare` adds the Cloudflare plugin to the same plugin list.
- **`src/routeTree.gen.ts` is generated, not committed.** Every application ignores it, so `build` runs before `typecheck` in `check`, and the file is listed in `.gitignore` (which also keeps `oxfmt` off it) and in Oxlint's `ignorePatterns`.
- **Every server function passes TanStack's CSRF middleware**, configured to accept the same origins as `requireSameOrigin`. Once `src/start.ts` exists, TanStack drops its built-in CSRF check, so an application without this middleware leaves every server function open to cross-site calls and logs a warning in development. It relies on `Sec-Fetch-Site` and falls back to the `Origin` header, which also covers `GET` server functions, whose same-origin `fetch` carries no `Origin`.
- **`mutationRpc` checks the origin again, strictly.** `requireSameOrigin` demands an `Origin` header from this application and rejects anything a browser marks other than `same-origin`, including same-site siblings. It is the guard for state-changing work wherever it runs, including API routes outside server functions, and the one the `auth` recipe builds on.
- **Forwarded headers count only with `TRUST_PROXY=true`.** Any client can send `X-Forwarded-Host`; trusting it without a proxy that replaces it would let a request choose the origin used in absolute links, such as a password reset URL. `APP_URL` is accepted always, so a proxied deployment with `APP_URL` set needs no `TRUST_PROXY`. `publicOrigin` prefers `APP_URL`, then the trusted forwarded origin, then the request's own.
- **`rpc` turns a thrown `Response` into an `Error` carrying its body**, so the client sees the message, and reports only failures that are the server's: anything that is not a `Response`, and `Response`s with a 5xx status. A 4xx is the caller's to fix and would only add noise. A thrown 5xx `Response` is reported because otherwise an unreachable upstream disappears entirely.
- **Failures name their server function.** A server function's path is an opaque hash, so `serverFunctionIdentity` records the compiled name and file for the call in `AsyncLocalStorage`, and `rpc` adds it to the failure log. The storage comes from `process.getBuiltinModule`, because `src/start.ts` pulls the middleware into the browser bundle too, where a `node:` import would break the build.
- **Stale server functions answer 404 with plain text.** A tab opened before a deploy can call a server function the deploy removed. TanStack answers with a JSON 500 that its client treats as a successful result; the middleware replaces it with a plain-text 404 that the client throws, with a message telling the user to refresh.
- **Chunk recovery is an inline head script.** When a deploy removes the entry modules an open page needs, the server-rendered HTML stays inert. The script reloads the page, at most once per ten seconds through `sessionStorage`, and then reveals the `update-notice` element instead. It ignores module scripts from other origins, such as those browser extensions inject. TanStack Router already reloads for lazy route chunks; this covers the entry graph the router cannot reach. The function is serialized with `toString()`, so it must not use imports or closures.
- **One canonical host.** With `APP_URL` set, a request for any other hostname gets a 301 to `APP_URL` with the same path, so old links keep working and land on the current name. The redirect lives in the application because Dokploy regenerates its Traefik routers on every deploy and would drop one written there. Loopback callers are never redirected: Centrifugo's connect proxy calls over `127.0.0.1`, and Go's HTTP client turned the redirected POST into a GET that landed on the page shell, so Centrifugo parsed HTML as JSON and retried forever. `/api/health` is served on any host, because container health checks use the internal name.
- **Security headers come from Start request middleware**, not Nitro route rules, so the same headers reach both deploy targets. They cover everything Start renders (pages, server functions, API routes) but not static assets the platform serves directly, which do not need a page policy. A route that sets a header keeps its own value. `Response.redirect()` and `fetch()` responses have immutable headers, so those are copied before the headers are added. The policy allows inline scripts because Start streams hydration data as inline scripts and the root route adds chunk recovery.
- **The server composition root is one global instance.** `app()` creates the server's long-lived resources on first use and stores them on `globalThis`, so Vite's development module reloads reuse the database connection instead of opening another on every edit. The trade-off: editing `createApp` itself takes effect after restarting the dev server. `createApp` stays synchronous, so callers never await `app()`. When `createApp` throws partway, it closes the resources it already opened and rethrows, keeping no instance, so the next `app()` call retries from scratch; without that, a missing secret opened another database connection on every health check. Because `createApp` is synchronous, that cleanup runs in the background and logs its own failures.
- **Resources close in reverse order through an `AsyncDisposableStack`.** Each resource registers its cleanup where it is created, so adding one is one block in `createApp`. The stack closes later resources first, since they may depend on earlier ones, runs every cleanup even when one fails, and rejects with all the failures. The deploy target closes the instance when the server stops: `deploy-dokploy` does it from Nitro's close hook after requests in flight finish, and Workers never stop a process. A signal handler here would close resources under requests still running.
- **The health route builds the composition root.** `GET /api/health` answers `{ ok: true }` once `app()` succeeds, so a missing environment variable fails the container health check instead of the first real request. Failures answer 503 without the cause, which goes to the server log; a check can map a failure to a stable code for monitors. Responses are `no-store`.
- **A Query client per browser session and per server request**, created by the router, so cached data never crosses between users. `setupRouterSsrQueryIntegration` mounts the provider and carries server-fetched queries into the browser, so there is no separate `QueryClientProvider`. `staleTime` is one second: long enough that hydrated queries are not fetched again straight away, short enough that navigating back shows fresh data. Sixty seconds would refetch less when moving between pages but show data up to a minute old, and every application chose one second. A query whose data rarely changes sets its own longer `staleTime`.
- **Tailwind scans only `src/`**, through `source('./')` on the import in `src/styles.css`, so build output and generated files outside `src/` never add classes.
- **Port 3000 in development**, the same as Nitro's production default, so local `APP_URL` and OAuth redirect URLs do not change between the two.

## Files

| File                           | Job                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `vite.config.ts`               | Start, React, and Tailwind plugins and the dev server port.                                |
| `src/start.ts`                 | Request and server function middleware lists.                                              |
| `src/router.tsx`               | The router, its Query client, and the SSR Query integration.                               |
| `src/routes/__root.tsx`        | The document, head tags, chunk recovery, the update notice, and where providers mount.     |
| `src/routes/index.tsx`         | A placeholder home page; replace it.                                                       |
| `src/routes/api/health.ts`     | `GET /api/health`.                                                                         |
| `src/styles.css`               | The Tailwind entry stylesheet.                                                             |
| `src/client/queryClient.ts`    | Query client defaults.                                                                     |
| `src/client/chunkRecovery.ts`  | The inline script that recovers from missing entry modules, and the notice element id.     |
| `src/server/app.ts`            | The server composition root: `app()` and `closeApp()`.                                     |
| `src/server/middleware.ts`     | Canonical host, security headers, CSRF, stale server functions, server function identity.  |
| `src/server/origins.ts`        | Request origins: `requireSameOrigin`, `publicOrigin`, `trustedOrigins`, `acceptedOrigins`. |
| `src/server/rpc.ts`            | `rpc` and `mutationRpc`, the wrappers every server function handler uses.                  |
| `src/server/serverFunction.ts` | The current server function's name, for logs and telemetry.                                |
| `src/server/health.ts`         | `healthResponse`.                                                                          |
| `src/**/*.test.ts`             | Tests for each of the above, including the mutation-origin conformance cases.              |

### Seams other recipes extend

Other recipes add to these files. Each is a seam with a fixed contract, so recipes compose without knowing about each other.

**`src/server/app.ts`.** Create a resource inside the `try` in `createApp`, register its cleanup on `resources`, and return it. Register each cleanup as soon as the resource exists, since a later throw closes only what is registered. `adopt` returns the value, so one statement does both:

```ts
const database = resources.adopt(openDatabase(), (db) => {
  db.$client.close()
})
return { database, close: () => resources.disposeAsync() }
```

Use `resources.defer(() => telemetry.shutdown())` when the value is created separately. Create telemetry first so it closes last and records the others closing. A resource that needs asynchronous setup keeps its promise in the returned object and awaits it where it is used; `createApp` itself stays synchronous. Read resources with `app().database` from server code only.

Every cleanup has a deadline, because the deploy target stops waiting. Docker, and so Dokploy, sends `SIGKILL` ten seconds after `SIGTERM`, and the budget is:

| Phase                                         | Deadline                                      | Owner                                                    |
| --------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Caddy drains requests (with `realtime`)       | 3 s                                           | `realtime`'s Caddyfile `grace_period`                    |
| Nitro drains requests                         | 5 s; 1 s with `realtime`, after Caddy drained | `SERVER_SHUTDOWN_TIMEOUT` (`deploy-dokploy`, `realtime`) |
| The realtime publisher sends what is queued   | 1 s                                           | `src/server/realtime.ts`                                 |
| Telemetry sends what is queued, last          | 2 s                                           | `telemetry.shutdown()` in `src/server/telemetry.ts`      |
| Centrifugo stops, and anything left is killed | 8 s in all                                    | `realtime`'s supervisor                                  |

That is at most 7 seconds without `realtime` and 8 with it. A new cleanup that can wait on the network takes a deadline of its own and fits inside this table; telemetry closes last with its own slot, so the events describing a slow shutdown still leave.

**`src/routes/__root.tsx`.** Wrap `<Outlet />` in providers, such as PostHog's, inside `<body>`. Add inline head scripts to `scripts` in `head()`. Keep the `update-notice` element and the chunk recovery script.

**`src/start.ts`.** Add request middleware to `requestMiddleware` and server function middleware to `functionMiddleware`. Keep `canonicalHost` first so a redirect skips the rest, and keep `securityHeadersMiddleware` before anything whose responses need the headers. Middleware modules imported here also load in the browser, so they must not import `node:` modules or `@tanstack/react-start/server` at the top level.

**`vite.config.ts`.** Add plugins to `plugins`: Nitro after `tanstackStart()`, the Cloudflare plugin before it. Add dev proxies under `server.proxy`. A recipe that needs `.env` values here converts the export to the `defineConfig(({ mode }) => ...)` form with `loadEnv`.

**`src/routes/api/health.ts`.** Replace the body of the check with the dependency it proves, keeping `app()` in it, and pass a failure mapping when monitors need a stable code. The container's health check restarts the container when this fails, so check only what a restart can fix: a local SQLite file, yes; a database on another server, no (see `database-postgres`).

```ts
healthResponse(
  () => app().database.get(sql`SELECT 1`),
  () => ({ code: 'database_unavailable', message: 'database unavailable' }),
)
```

**`src/server/rpc.ts`.** Telemetry wraps the `try` in `run` with its observer and replaces `reportFailure` with its own reporter, which receives the error and the `RpcErrorContext`. A reporter that can fail must catch its own errors, so the application's failure is the one the client sees.

**`src/server/origins.ts`.** Import, do not copy. Better Auth takes `trustedOrigins` as its `trustedOrigins` callback and `publicOrigin(request)` for absolute links.

**`src/server/middleware.ts`.** Add a path to `pathsServedOnAnyHost` when something calls it by an internal name other than loopback. Change `securityHeaders` when the application loads from another origin, such as PostHog assets or realtime WebSockets on another host.

## Wiring

With `tooling`, see `stacks/client-only/`:

- `package.json`: add `"dev": "vite dev"`, `"build": "vite build"`, and `"preview": "vite preview"`, and put `pnpm build` before `pnpm typecheck` in `check`, since type checking needs the generated route tree.
- `.gitignore`: add `.tanstack/` and `src/routeTree.gen.ts`.
- `.oxlintrc.json`: add `src/routeTree.gen.ts` to `ignorePatterns`.

## Configuration

| Variable      | Where       | Value                                                                                                     |
| ------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `APP_URL`     | Server only | The public origin, such as `https://example.com`. Turns on the canonical redirect; accepted as an origin. |
| `TRUST_PROXY` | Server only | `true` only behind a proxy that replaces `X-Forwarded-Host` and `X-Forwarded-Proto`. Unset by default.    |

Both are optional in development.

Rename the application: `"name": "app"` in `package.json` and the `title` in `src/routes/__root.tsx`.

## Verify

- `pnpm dev`, open the app, and see the home page with no console errors (a Content Security Policy violation shows there).
- `curl -i localhost:3000/api/health` answers 200 with `{"ok":true}`, `cache-control: no-store`, and the security headers.
- A server function called with `Sec-Fetch-Site: cross-site` answers 403, and a call to a made-up `/_serverFn/<id>` answers 404 with the refresh message.
- With `APP_URL=https://example.com`, `curl -i -H 'Host: old.example' localhost:3000/some/path` gets a 301 to `https://example.com/some/path`.
