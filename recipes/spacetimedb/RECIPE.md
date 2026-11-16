---
name: spacetimedb
version: 2
summary: A SpacetimeDB module beside a TanStack Start application, with committed bindings, the browser connection, the server HTTP API helper, and a guarded publish.
requires: []
conflicts: []
dependencies: [react, spacetimedb]
devDependencies: [tsx]
wires:
  [
    package.json,
    .oxlintrc.json,
    .oxfmtrc.json,
    vitest.config.ts,
    src/routes/__root.tsx,
    src/routes/api/health.ts,
    src/server/contentSecurityPolicy.ts,
    Dockerfile,
    .github/workflows/deploy.yml,
  ]
starters: [spacetimedb/src/index.ts, spacetimedb/src/index.test.ts, src/spacetime/generated/]
---

# spacetimedb

## Use it when

Live state belongs in a SpacetimeDB module: a game world (tro.gg), or signals and records many players watch at once (praetorium.gg). Browsers subscribe to tables over a WebSocket and call reducers; the application's server calls the module over HTTP as an operator.

Use `convex` instead when no module logic needs to run next to the data in a custom server, or a database recipe with `realtime` when the data belongs in SQL and only change notifications need to reach the browser.

## Decisions

- **The module lives in `spacetimedb/` with its own `package.json` and `tsconfig.json`, but is not a workspace package.** `spacetime build` and `spacetime generate` resolve `spacetimedb/server` from the root `node_modules`, so the module, the browser SDK, and the bindings always use the one pinned `spacetimedb` version. tro.gg kept a separate dependency in the module's `package.json` and it drifted a minor version behind the client. A workspace package would also need a name that cannot shadow the npm `spacetimedb` package under a hoisted linker. The module's `tsconfig.json` extends the bundler preset without DOM or Node types, matching the runtime the module runs in, and `pnpm typecheck` checks it with a second `tsc -p spacetimedb`.
- **Module tests run in Vitest through `spacetimedbModuleTestPlugin`**, which stubs the host and lets `createModuleTestHarness` call reducers against an in-memory datastore, as praetorium does. Test validation and permissions there; they are the module's only guard.
- **Bindings in `src/spacetime/generated` are committed as the CLI writes them** and excluded from Oxfmt and Oxlint, so the CI check compares them byte for byte without a formatting step. Regenerate with `pnpm spacetime:generate` after any change to the module's tables, reducers, procedures, or views, and commit the result. The `bindings` job regenerates them with the pinned CLI and fails when anything differs or a file is new, because stale bindings fail only at runtime, when the client sends arguments the module no longer reads.
- **The CLI version is pinned once, in `.github/actions/setup-spacetime`, equal to the `spacetimedb` package**, with the release archive's SHA-256 (read from the GitHub release's asset digest). Generated bindings record the CLI version, and the module ABI moves with it, so the CLI, SDK, and bindings change together. Bump the action and the package in one commit.
- **Publishing goes through `publishSpacetimeModule`, not `spacetime publish -y`.** It asks the migration planner (`pre_publish`) first: a missing database is created, an automatic migration is applied, and a migration that needs manual steps is refused before anything changes. A migration that would break clients still running the old bindings is refused unless the workflow is dispatched with `break-clients`. `spacetime publish -y` means `--yes=all` in 2.14, which accepts breaking clients without asking; tro.gg's deploy workflow relies on it while its comment says breaking changes fail. The HTTP path also carries Cloudflare Access service-token headers, which praetorium's server needs and the CLI cannot send.
- **A publish that got no answer is retried from the plan, twice.** praetorium's uploads stalled in the tunnel; planning again accounts for a publish that did land, and a refusal is never retried.
- **The server HTTP helper guards its token.** Every request validates the origin and database name (no path, credentials, query, or fragment; plain HTTP only to loopback or the configured `internalHost`), sends the bearer token plus any extra headers, refuses redirects (a redirect would resend the token wherever it points), and times out. Failures throw `SpacetimeRequestError` with the status and at most 300 characters of the body. `deleteSpacetimeDatabase` treats a missing database as deleted, so preview cleanup can run repeatedly. The helper has its own loopback check rather than importing `start-app`'s, because the publish script loads it outside Vite, where `middleware.ts` cannot load.
- **The browser uses the SDK's `SpacetimeDBProvider`, not a hand-written reconnect loop.** Since 2.14 the SDK reconnects a dropped connection with jittered backoff inside the same `DbConnection`, replays subscriptions, refreshes tokens through `withTokenProvider`, and the provider rebuilds a connection whose first attempt failed. That covers what tro.gg's `reconnect.ts` and praetorium's `maintainSpacetimeConnection` built by hand when deploys closed every socket at once. `useTable`, `useReducer`, and `useSpacetimeDB().isActive` give components rows, calls, and connection state.
- **A visitor keeps their anonymous identity** by storing the token SpacetimeDB issues on first connect in `localStorage` and presenting it next time (tro.gg's guest persistence). A stored token the server rejects (401 or 403, for example after the database was reset) is removed and the page reloads to connect anonymously. Reloading is deliberate: the provider resumes every rebuild with the token the failed connection held, so without it the page retries the rejected token forever. Storage that throws (blocked cookies) or is missing (server rendering) means connecting without a token.
- **The SDK log level is `warn`.** It logs every connect at info through `console.log`, which PostHog's console capture recorded as noise in praetorium.
- **The connection settings are `VITE_` build-time variables**, like tro.gg, so a static client knows where to connect without asking the server. The image build takes them as build arguments, because `.dockerignore` keeps `.env` files out of the image. praetorium instead serves them, with a short-lived token, from `/api/spacetime/token`, because one image runs against several databases; switch to that when the auth wiring below applies.
- **The Content Security Policy allows the SpacetimeDB origin over HTTP and WebSockets, and `'unsafe-eval'` in `script-src`.** The SDK exchanges the stored token over HTTP (`/v1/identity/websocket-token`) before opening the socket, and compiles its binary codecs with `Function()` in the browser, which `start-app`'s policy blocks with "Something went wrong". praetorium adds `'unsafe-eval'` for the same reason.
- **`SpacetimeProvider` wraps the whole application** in `__root.tsx`, so a page that subscribes needs nothing else, and `spacetimeConnection` throws when the settings are missing rather than rendering pages that never connect. An application that uses SpacetimeDB on a few pages can wrap only those routes instead.
- **`/api/health` fails when the build has no settings.** Without them every page answers 500 while a health route that ignores them answers 200, so a deploy built without the build arguments would turn green. Checking `spacetimeSettings()` in the health route keeps that deploy from turning healthy. It checks only the configuration, not that the server is reachable: a SpacetimeDB outage should not take the application's own pages down with it.
- **The deploy workflow publishes the module before deploying the image, by calling `spacetime.yml`.** A client built from new bindings fails at runtime against the old module, and a publish triggered separately on push would race the deploy. One workflow run publishes then deploys the same commit, a refused migration stops the deploy, and the publish steps stay in this recipe's file. Without a deploy workflow, nothing publishes automatically; call `spacetime.yml` from whatever deploys the client.
- **The `note` table and `add_note` reducer are a placeholder** that shows the shape: a public table, a reducer that validates and throws `SenderError` (which the caller's promise rejects with), and the caller's identity from `ctx.sender`. Replace them.

## Files

| File                                     | Job                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `spacetimedb/package.json`               | Marks the module as ESM; no dependencies of its own.                                                       |
| `spacetimedb/tsconfig.json`              | Type checking for the module's runtime.                                                                    |
| `spacetimedb/src/index.ts`               | The schema and reducers; replace the placeholder `note` table.                                             |
| `spacetimedb/src/index.test.ts`          | Reducer tests through the module test harness.                                                             |
| `src/spacetime/generated/**`             | Client bindings from `pnpm spacetime:generate`; committed, never edited.                                   |
| `src/client/spacetime.tsx`               | `spacetimeSettings`, `spacetimeConnection`, and `SpacetimeProvider`: settings, stored identity, log level. |
| `src/client/spacetime.test.ts`           | Stored tokens, rejected tokens, and missing settings.                                                      |
| `src/server/spacetime.ts`                | The HTTP API helper: calls, publishing with migration planning, deletion.                                  |
| `src/server/spacetime.test.ts`           | URL validation, headers, bounded errors, migration refusals, idempotent deletion.                          |
| `src/server/spacetimeOrigin.ts`          | `spacetimeConnectSources`: the Content Security Policy sources for the server.                             |
| `src/server/spacetimeOrigin.test.ts`     | HTTPS and secure WebSocket sources for a hosted server, plain ones for a local one.                        |
| `scripts/publishSpacetimeModule.ts`      | Publishes a built bundle from `SPACETIME_*` variables, retrying stalls.                                    |
| `scripts/publishSpacetimeModule.test.ts` | Retrying a publish that got no answer, never one the server refused.                                       |
| `.github/actions/setup-spacetime/`       | The pinned CLI version and checksum, used by every SpacetimeDB job.                                        |
| `.github/workflows/spacetime.yml`        | Checks bindings on every pull request and push; builds and publishes when the deploy workflow calls it.    |

## Wiring

With `start-app` and `tooling`, see `stacks/spacetime/`:

- `src/routes/__root.tsx`: wrap `<Outlet />` in `<SpacetimeProvider>`, in the root's `Root` component, so a missing setting reaches the root's error boundary.
- `src/server/contentSecurityPolicy.ts`: add `"'unsafe-eval'"` to `script-src` and `...spacetimeConnectSources(import.meta.env.VITE_SPACETIME_URL)` to `connect-src`.
- `package.json`: `"typecheck": "tsc --noEmit && tsc --noEmit -p spacetimedb"` and `"spacetime:generate": "spacetime generate --lang typescript --module-path spacetimedb --out-dir src/spacetime/generated --yes"`.
- `vitest.config.ts`: add `plugins: [spacetimedbModuleTestPlugin()]` (from `spacetimedb/server/test-utils/vitest`) and `'spacetimedb/src/**/*.test.ts'` to `include`.
- `.oxlintrc.json`: add `src/spacetime/generated/**` and `spacetimedb/dist/**` to `ignorePatterns`.
- `.oxfmtrc.json`: add `"ignorePatterns": ["src/spacetime/generated/**"]`.
- `src/routes/api/health.ts`: call `spacetimeSettings()` (from `src/client/spacetime`) first in the check.

With `deploy-dokploy`, see `stacks/spacetime/`:

- `Dockerfile`: in the build stage, add `ARG VITE_SPACETIME_URL VITE_SPACETIME_DATABASE` before `RUN … pnpm build`.
- `.github/workflows/deploy.yml`:
  1. Give `workflow_dispatch` a boolean `break-clients` input, described as accepting a migration that breaks clients still running the previous bindings.
  2. Add a `spacetime` job before `deploy` with the `deploy` job's `if`, `uses: ./.github/workflows/spacetime.yml`, `with: { ref: ${{ github.event.workflow_run.head_sha || github.sha }}, break-clients: ${{ inputs.break-clients || false }} }`, and `secrets: inherit`.
  3. Add `needs: spacetime` to `deploy`.
  4. Add `VITE_SPACETIME_URL=${{ vars.VITE_SPACETIME_URL }}` and `VITE_SPACETIME_DATABASE=${{ vars.VITE_SPACETIME_DATABASE }}` to the image's `build-args`.

Server code calls the module as an operator with `callSpacetime({ url, database, token }, 'procedure_name', args)`, building the connection from server-only variables (`SPACETIME_URL`, `SPACETIME_DATABASE`, `SPACETIME_TOKEN`); keep it in `src/server/app.ts` when several modules use it.

With `auth`, Better Auth can become the identity issuer, as in praetorium. `stacks/spacetime` runs both recipes side by side without this yet: accounts live in SQL and SpacetimeDB identities stay anonymous. To link them:

1. Add Better Auth's `jwt` plugin with `issuer: ${APP_URL}/api/auth`, `audience` set to the database name, a five-minute `expirationTime`, `getSubject` returning the session id, and `definePayload` returning `userId` and an `exp` no later than the session's expiry.
2. Add `GET /api/spacetime/token`: answer 401 without a session, otherwise `{ token }` from `auth.api.getToken({ headers })` with `cache-control: no-store`.
3. In `spacetimeConnection`, for a signed-in visitor, fetch that token for `withToken` and pass `withTokenProvider(fetchToken)` so the SDK refreshes it on reconnect; keep the stored anonymous token for signed-out visitors only, and never store the issued one.
4. In the module, declare `schema(tables, { env: { AUTH_ISSUER: t.string(), AUTH_AUDIENCE: t.string() } })`, and in `spacetime.clientConnected` refuse (`throw new SenderError(...)`) a JWT whose issuer or single audience does not match `ctx.env`, or whose expiry is missing or too far out. Validate the issuer as HTTPS (loopback HTTP locally) and fail closed on malformed configuration. See praetorium's `spacetimedb/src/admission.ts`.
5. Publish the environment on the first publish with `publishSpacetimeModule(connection, bundle, { environment: { AUTH_ISSUER, AUTH_AUDIENCE } })`; SpacetimeDB keeps it across later publishes.

## Configuration

| Variable                         | Where                    | Value                                                                                               |
| -------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| `VITE_SPACETIME_URL`             | Actions variable, build  | The server the browser connects to, such as `wss://spacetime.example.com` or `ws://127.0.0.1:3001`. |
| `VITE_SPACETIME_DATABASE`        | Actions variable, build  | The database name, such as `app`.                                                                   |
| `SPACETIME_URL`                  | Actions variable, server | HTTP origin of the server for publishing and operator calls; may be an internal name.               |
| `SPACETIME_DATABASE`             | Actions variable, server | The database to publish.                                                                            |
| `SPACETIME_TOKEN`                | Actions secret, server   | A token for the identity that owns the database (`spacetime login show --token`).                   |
| `SPACETIME_ACCESS_CLIENT_ID`     | Actions secret           | Optional; Cloudflare Access service token id when the server sits behind Access.                    |
| `SPACETIME_ACCESS_CLIENT_SECRET` | Actions secret           | Optional; its secret.                                                                               |

Keep the publish secrets at repository level, not in the `production` environment: the publish job runs without an environment.

For local development, install the CLI at the pinned version (`spacetime version install 2.14.1`), run `spacetime start`, publish with `spacetime publish --server local --module-path spacetimedb app`, and put the two `VITE_SPACETIME_*` values in `.env.local`.

## Verify

- `pnpm dev` against a local server: a page using `useTable` shows "connected" state and rows with no Content Security Policy errors; a reducer call from the page appears without a reload, and an invalid one rejects with the module's `SenderError` message.
- Stop and restart the local server with the page open: the page reconnects on its own and shows the rows again.
- Put a made-up value in `localStorage['spacetime:token']` and reload: the page reloads once and connects with a new identity.
- Publish a module that removes a column: `publishSpacetimeModule` refuses with "needs a manual migration" and the database is unchanged.
- `pnpm spacetime:generate` leaves `git status` clean.
- `pnpm build` without the `VITE_SPACETIME_*` values, then `PORT=3456 pnpm start`: `curl -i localhost:3456/api/health` answers 503.
- On a push to main, the Deploy run's `spacetime / publish` job finishes before its `deploy` job starts.
