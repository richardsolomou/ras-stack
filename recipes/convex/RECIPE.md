---
name: convex
version: 2
summary: Convex as the backend of a TanStack Start application, with Convex queries served through TanStack Query.
requires: [start-app]
conflicts: []
dependencies: [convex, '@convex-dev/react-query']
devDependencies: []
wires: [package.json, .oxlintrc.json, .oxfmtrc.json, vite.config.ts, src/router.tsx, src/server/contentSecurityPolicy.ts]
starters: [convex/schema.ts, convex/notes.ts, convex/_generated/]
---

# convex

## Use it when

The application keeps its data in Convex: reactive queries that update every open page, mutations with optimistic updates, and no database or server process of its own to run. It sits on `start-app`, so the same application still has server rendering, server functions and API routes for anything that is not Convex.

Use a database recipe (`database-sqlite`, `database-libsql`, `database-postgres`) instead when the data lives beside the server and changes reach other pages through `realtime`, or `spacetimedb` when the backend is a SpacetimeDB module.

## Decisions

- **Convex queries go through TanStack Query.** `connectConvex` sets the `ConvexQueryClient` hash and query functions as the Query client's defaults, so `useSuspenseQuery(convexQuery(api.notes.list, {}))` works with route loaders, Suspense, and `setupRouterSsrQueryIntegration` like any other query. The server render fetches each Convex query once over HTTP (`consistentQuery`, so every query in one render reads the same snapshot), the browser hydrates it, and the WebSocket subscription then pushes every change into the cache. `staleTime` is `Infinity` on Convex queries because the subscription, not refetching, keeps them current.
- **Other queries are untouched.** The Convex hash and query functions fall through to Query's own for keys that are not `convexQuery`, so server function queries keep their `queryFn` and `start-app`'s defaults.
- **Unused subscriptions close after ten seconds.** A Convex query stays subscribed until Query garbage-collects it, and Query's five-minute default kept the WebSocket subscribed to every page visited. Ten seconds, set only for `convexQuery` keys, still covers navigating back and forth.
- **One Convex client per router.** `getRouter` runs once per browser session and once per server request, so each server render gets its own Convex HTTP client and no user's data crosses into another's render. The browser client opens its WebSocket lazily on the first subscription, so creating it during server rendering costs nothing.
- **`ConvexProvider` mounts through the router's `Wrap`**, not `__root.tsx`, because the client is created with the router. `useConvexMutation` and the other `convex/react` hooks need it. `setupRouterSsrQueryIntegration` keeps an existing `Wrap` inside its `QueryClientProvider`.
- **A missing `VITE_CONVEX_URL` throws when the router is created.** Every page depends on Convex, so failing loudly beats rendering pages whose queries never resolve. The URL is a `VITE_` variable, so Vite inlines it into both the browser and server bundles at build time.
- **The Content Security Policy allows the deployment's origin** over HTTPS and WebSockets (HTTP and plain WebSockets for a local deployment). `start-app`'s policy allows only `'self'`, which blocks the Convex client entirely. Both scheme pairs are listed explicitly rather than relying on browsers matching `https:` sources to `wss:`.
- **`convex/_generated` is committed**, as Convex recommends and the templates do. `convex codegen` refuses to run without a deployment (`No CONVEX_DEPLOYMENT set`), so CI, a fresh clone, and the recipe stacks could not type-check otherwise. The files are the unformatted output of `convex dev`, which rewrites them on every run, so Oxfmt and Oxlint ignore the directory; formatting them would make `format:check` fail after every `pnpm dev`.
- **No CI check for stale generated files.** Checking them needs a running deployment, and staleness is already caught: `dataModel.d.ts` derives its types from `schema.ts`, and a function module missing from `api.d.ts` fails `pnpm typecheck` as soon as the client references it.
- **`convex/tsconfig.json` is Convex's own**, so `convex dev` and `convex deploy` type-check functions without the browser and Vite types the application's config adds. The application's `pnpm typecheck` covers the same files through the generated `api.d.ts` imports.
- **`pnpm dev` is `convex dev --start 'vite dev'`.** One process pushes functions on every save, regenerates `convex/_generated`, writes `.env.local` (`CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`) on first run, and starts Vite once the first push succeeds, without a process runner such as `concurrently`.
- **Functions deploy from CI on push to main**, with a deploy key, and deploys queue rather than cancel, since a half-finished deploy leaves functions and schema from different commits. `--typecheck enable` fails the deploy when TypeScript cannot run, instead of the CLI's default of skipping the check.
- **The schema and `notes` functions are a placeholder** that shows the shape: validated arguments, a bounded query, and a `ConvexError` the client receives with its message. Replace them.

## Files

| File                                  | Job                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `convex/schema.ts`                    | The data model; replace the placeholder `notes` table.                          |
| `convex/notes.ts`                     | A placeholder query and mutation pair; replace it.                              |
| `convex/tsconfig.json`                | Type checking for `convex dev` and `convex deploy`.                             |
| `convex/_generated/*`                 | Generated by `convex dev`; committed, never edited.                             |
| `src/client/convex.ts`                | `connectConvex`: the Convex client and its Query defaults.                      |
| `src/server/convex.ts`                | `convexConnectSources`: the Content Security Policy sources for the deployment. |
| `src/**/convex.test.ts`               | Query keys, garbage collection, untouched defaults, and the policy sources.     |
| `.github/workflows/deploy-convex.yml` | Deploys functions and schema on push to main.                                   |

## Wiring

With `start-app`, see `stacks/convex/`:

- `src/router.tsx`: after `createQueryClient()`, call `const convex = connectConvex(queryClient)`, and pass `Wrap: ({ children }) => <ConvexProvider client={convex.convexClient}>{children}</ConvexProvider>` to `createRouter` (`ConvexProvider` from `convex/react`).
- `src/server/contentSecurityPolicy.ts`: add `...convexConnectSources(import.meta.env.VITE_CONVEX_URL)` to `connect-src`.
- `package.json`: `"dev": "convex dev --start 'vite dev'"`.
- `.oxlintrc.json`: add `convex/_generated/**` to `ignorePatterns`.
- `.oxfmtrc.json`: add `"ignorePatterns": ["convex/_generated/**"]`.

Routes read with `context.queryClient.ensureQueryData(convexQuery(api.module.fn, args))` in the loader and `useSuspenseQuery` in the component, and write with `useMutation({ mutationFn: useConvexMutation(api.module.fn) })`; see `stacks/convex/src/routes/notes.tsx`. Add `.withOptimisticUpdate(...)` to the mutation for instant feedback.

With a deploy recipe, the production build needs `VITE_CONVEX_URL` at build time: a Docker build argument for `deploy-dokploy`, a build variable for `deploy-cloudflare`.

With `deploy-cloudflare`, the build prerenders pages, which creates the router and so needs `VITE_CONVEX_URL` even for pages that read nothing from Convex. In `vite.config.ts`, add a `filter` to the prerender options that leaves out every route reading Convex (`filter: (page) => page.path !== '/notes'`): prerendering one would query the deployment from the build and bake that snapshot into the HTML, which the subscription then replaces after hydration. `stacks/convex/.env` sets a placeholder URL so the stack builds without a deployment; an application builds with its real URL.

With `auth`, Convex must trust the application's tokens: Better Auth's JWT plugin as a custom JWT provider in `convex/auth.config.ts`, and `ConvexProviderWithAuth` in place of `ConvexProvider` with a `useAuth` that fetches the token. This is not wired yet; no application combines the two today.

## Configuration

| Variable            | Where                 | Value                                                                                                                        |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `VITE_CONVEX_URL`   | Build                 | The deployment URL, such as `https://happy-otter-123.convex.cloud`. `convex dev` writes the development one to `.env.local`. |
| `CONVEX_DEPLOYMENT` | Development           | Written to `.env.local` by `convex dev`; selects the development deployment.                                                 |
| `CONVEX_DEPLOY_KEY` | GitHub Actions secret | A production deploy key from the Convex dashboard (**Settings > Deploy keys**).                                              |

Run `pnpm dev` once and choose a project, or set `CONVEX_AGENT_MODE=anonymous` to develop against a local backend without a Convex account (it keeps its data in `.convex/`, which ignores itself). Convex environment variables that functions read (`process.env` inside `convex/`) are set with `pnpm exec convex env set NAME value`, per deployment.

## Verify

- `pnpm dev`, open a route that reads a Convex query, and see server-rendered data with no Content Security Policy errors in the console.
- Run `pnpm exec convex run notes:add '{"text":"from the CLI"}'` with the page open: the note appears without a reload.
- `pnpm check` passes with `convex/_generated` as `convex dev` left it.
