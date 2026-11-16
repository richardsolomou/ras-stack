---
name: deploy-cloudflare
version: 1
summary: TanStack Start on Cloudflare Workers with prerendered pages and the security headers on static assets, deployed by Workers Builds.
requires: [start-app]
conflicts: [deploy-dokploy]
dependencies: []
devDependencies: ['@cloudflare/vite-plugin', wrangler]
wires: [vite.config.ts, .gitignore, .oxlintrc.json, pnpm-workspace.yaml]
---

# deploy-cloudflare

## Use it when

The application's server only renders pages and answers stateless server functions and API routes: tools that do their work in the browser, such as remove-bg, img-to-palette, icon-gen, local-quest, and local-chat. Workers cost nothing at this scale, need no server, and serve prerendered pages from Cloudflare's edge.

Use `deploy-dokploy` instead when the server holds state between requests: a database file, WebSockets, uploads to disk, or background work.

## Decisions

- **The Cloudflare Vite plugin runs the SSR environment in workerd.** `cloudflare({ viteEnvironment: { name: 'ssr' } })` comes before `tanstackStart()`, so `vite dev`, `vite build`, and `vite preview` all run the server in the Workers runtime, and code that only works in Node fails locally instead of in production. `wrangler.jsonc` points `main` at Start's server entry; the build writes the deployable Worker and its generated config to `dist/server` and the assets to `dist/client`.
- **`nodejs_compat` with a recent compatibility date.** It provides what `start-app`'s server code uses, checked in workerd: `process.env` holds the Worker's variables and secrets, `process.getBuiltinModule('node:async_hooks')` returns `AsyncLocalStorage` for server function names, `AsyncDisposableStack` exists, and `process.once` exists but no signal ever reaches a Worker, so the composition root is created and never closed. That is fine: a Worker's resources live as long as its isolate.
- **Every page Start can find is prerendered.** `tanstackStart({ prerender: { enabled: true } })` crawls links from `/` during the build and writes each page as HTML into `dist/client`, which Cloudflare serves from its cache without running the Worker. Loader data is baked in at build time and refreshed on hydration, so a page whose first render depends on the request (a session, a query string) should turn prerendering off for that route.
- **Static assets get the security headers from `_headers`.** `start-app` adds them in request middleware, which never runs for an asset Cloudflare serves directly, so the prerendered HTML would go out without a Content Security Policy. `scripts/staticHeaders.ts`, a Vite plugin, writes `securityHeaders` from `src/server/middleware.ts` into `dist/client/_headers` for every path, so one map serves both. It loads the middleware through Vite's module runner because the config loader cannot follow the middleware's extensionless imports, and importing project files from `vite.config.ts` makes Vite warn that its future native config loader will not either. `run_worker_first` was the alternative; it sends every asset through the Worker and skips the prerendered pages.
- **Worker source maps are uploaded.** The plugin emits them by default for readable stack traces in Workers Logs, and `observability` keeps those logs. The SSR build's `sourcemapBroken` check is off because Vite's stub module for `styles.css?url` has no map to give.
- **Deploys come from Workers Builds, not GitHub Actions.** Every Cloudflare application already deploys this way: Cloudflare builds and deploys on each push to `main` with no API token stored in GitHub, and it reads Node 24 and the pnpm version from `package.json`. The trade-off is that it does not wait for CI; `main` only takes pull requests whose `check` passed, so the code it builds has passed too. An application that needs to gate deploys on more than that moves to a workflow running `pnpm build` and `pnpm exec wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- **One custom domain and no `workers.dev`.** `workers_dev: false` keeps the Worker off a second public hostname, which also turns off preview URLs. With one hostname, `start-app`'s canonical redirect has nothing to do, so `APP_URL` is optional.

## Files

| File                       | Job                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `wrangler.jsonc`           | Worker name, compatibility date and flags, Start's server entry, custom domain, observability. |
| `scripts/staticHeaders.ts` | `staticHeaders`: the Vite plugin that writes `securityHeaders` to `dist/client/_headers`.      |

Replace `app` in `name` with the application's name and `app.ras.sh` in `routes` with its hostname.

## Wiring

With `start-app`, see `stacks/client-only/`:

- `vite.config.ts`: add `cloudflare({ viteEnvironment: { name: 'ssr' } })` from `@cloudflare/vite-plugin` before `tanstackStart()`, pass `{ prerender: { enabled: true } }` to `tanstackStart`, import `staticHeaders` from `./scripts/staticHeaders.ts` and add it last in `plugins`, and set `environments.ssr.build.rolldownOptions.checks.sourcemapBroken` to `false`.
- `.gitignore`: add `.wrangler/` and `.dev.vars*`.
- `.oxlintrc.json`: add `.wrangler/**` to `ignorePatterns`.
- `pnpm-workspace.yaml`: add `workerd: true` to `allowBuilds`; `workerd`'s install script checks its platform binary, and pnpm fails a fresh install on any build script `allowBuilds` does not mention.

`pnpm preview` serves the built Worker and assets in workerd, like production.

## Configuration

| Variable  | Where                   | Value                                                                                   |
| --------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `APP_URL` | Worker variable         | Optional; set it when the Worker answers on more than one hostname.                     |
| `VITE_*`  | Workers Builds variable | Build-time values such as PostHog's project token, set as build variables, not runtime. |

Locally, server variables go in `.dev.vars`, which the Cloudflare plugin reads.

In the Cloudflare dashboard, under **Workers & Pages > Create > Import a repository**, connect the GitHub repository with build command `pnpm build` and deploy command `npx wrangler deploy` (the defaults besides the build command), on the `main` branch. The first deploy attaches the custom domain in `routes`; the zone must be on the same Cloudflare account.

## Verify

- `pnpm build` prints the prerendered pages and `Parsed 1 valid header rule`, and `dist/client/_headers` lists every header in `securityHeaders`.
- `pnpm preview`, then `curl -i localhost:4173/` returns the prerendered page with `content-security-policy`, and `curl -i localhost:4173/api/health` answers `{"ok":true}` from the Worker.
- `pnpm exec wrangler deploy --dry-run` after a build lists the Worker and its assets with no errors.
- After the first Workers Builds deploy, the custom domain serves the page with the same headers.
