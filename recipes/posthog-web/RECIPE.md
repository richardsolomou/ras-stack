---
name: posthog-web
version: 1
summary: Browser PostHog with privacy defaults, a same-origin ingest proxy, render error capture, and source-map upload.
requires: [start-app]
conflicts: []
dependencies: [posthog-js, '@posthog/react']
devDependencies: ['@posthog/rollup-plugin']
wires:
  [
    vite.config.ts,
    pnpm-workspace.yaml,
    src/router.tsx,
    src/routes/__root.tsx,
    Dockerfile,
    .github/workflows/deploy.yml,
    .github/workflows/preview.yml,
  ]
---

# posthog-web

## Use it when

Every application with a browser UI: product analytics, session replay, web vitals, browser exceptions, browser logs and metrics, and feature flags. It fits full-stack applications on either deploy target and the client-only tools on Cloudflare alike, because the ingest proxy is a TanStack Start server route.

An application without TanStack Start, such as a game client built with plain Vite, initializes `posthog-js` itself with the options from `postHogOptions` and sends straight to the PostHog host (see Direct ingestion below).

## Decisions

- **The project token turns PostHog on.** Without `VITE_POSTHOG_PROJECT_TOKEN` nothing initializes, the proxy answers 404, and the provider renders its children alone, so local development and previews need no PostHog project. US Cloud is the default host; `VITE_POSTHOG_HOST` selects EU Cloud or a self-hosted instance, and the UI and assets hosts are derived from it. A host with credentials, a query, or a fragment throws, and so does a host without a token, so a malformed or half-made configuration fails the first request and the health check instead of sending events somewhere unexpected or turning analytics off unnoticed.
- **The browser bundle fixes the project.** `bundledPostHog` reads `import.meta.env`, which Vite inlines at build time into both the browser and the server bundle. The proxy uses the same value, so it always forwards to the hosts the browser's token belongs to, on Node and on Cloudflare Workers, where `process.env` may be empty.
- **The ingest proxy is a server route at `/t`, not a Vite or Nitro proxy.** One `ANY` handler in `src/routes/t/$.ts` serves `vite dev`, `vite preview`, the Nitro server from `deploy-dokploy`, and the Worker from `deploy-cloudflare`. Nitro route rules exist only with Nitro, and Cloudflare has no Nitro, so the earlier pair of Vite and Nitro proxy tables would have needed a third implementation; the route also gets the security headers and canonical host handling every other route gets. The path is `/t` because ad-blocker lists match the literal `/ingest` segment on any host. `static/` and `array/` paths go to the assets host, everything else to the ingestion host.
- **The proxy forwards neither credentials nor cookies.** Every same-origin request carries the application's session cookie and any bearer token, and PostHog reads neither, so `cookie` and `authorization` are dropped before forwarding; an earlier proxy forwarded both to PostHog. `set-cookie` from upstream is dropped too, so a third party cannot set cookies on the application's origin. Hop-by-hop headers, `host`, `content-length`, and `accept-encoding` are left to `fetch`, which decodes the response body itself; the response's `content-encoding` and `content-length` are removed because they describe bytes the response no longer carries.
- **`X-Forwarded-For` is forwarded as received, and set from `CF-Connecting-IP` on Cloudflare.** PostHog records the first address as the client's. Behind Traefik that is already the client. A Worker's own fetch would otherwise give every event Cloudflare's location, so the Cloudflare client address replaces the header there, and other `cf-` headers are not forwarded. An edge that rewrites `X-Forwarded-For` to its own address gives every event the same location; have it put the client first.
- **PostHog initializes when the browser first loads `src/client/posthog.tsx`**, before hydration, instead of in the provider's effect. React runs children's effects before their parents', so with the provider initializing, a child's first-render capture or identify ran against an unloaded SDK, which applications worked around by queueing events until `loaded`. `PostHogProvider` receives the initialized client.
- **The SDK options are pinned and privacy-first.** `defaults: '2026-05-30'` pins the SDK's dated defaults (history-change pageviews, head-injected scripts that do not break hydration), so an SDK upgrade does not change behavior until the date is raised on purpose. `person_profiles: 'identified_only'` is explicit even though it is the SDK default today, because anonymous profiles are billed. URLs are masked with `mask_personal_data_properties`, plus the `token` query parameter that reset and invitation links carry. Replay masks every input regardless of the project's replay settings; `.ph-no-capture` blocking is the SDK's own default.
- **Tracing headers go only to this application's host.** `tracing_headers` adds the PostHog person and session headers to same-origin `fetch` and XHR requests, which `posthog-server` reads; no third party receives them.
- **Browser logs and metrics name the service `<serviceName>-web`.** `serviceName` in `src/contracts/posthog.ts` names both sides, and the server reports as `<serviceName>-server`, so the two are told apart in PostHog's logs and metrics.
- **No console log capture.** Console output from the application and its dependencies can hold secrets and personal data. The code does not enable `captureConsoleLogs`; the SDK also follows the project's remote logs setting, so leave console capture off there too.
- **Render errors are captured in two places.** A route with an `errorComponent` catches its render errors in the router's boundary, before any outer boundary and before the window `error` event the SDK listens to, so the router's `defaultOnCatch` captures them. A route without one throws past the router to `PostHogErrorBoundary` inside `PostHogIntegration`, which captures and shows a reload message. Both were verified in a browser; neither path alone covers every route.
- **Source maps upload only from CI with credentials.** `POSTHOG_CLI_API_KEY` and `POSTHOG_CLI_PROJECT_ID`, the names `posthog-cli` itself reads, plus `CI=true` turn uploads on, so a developer with the key in a local `.env` does not upload every local build. `POSTHOG_UPLOAD_SOURCEMAPS=true` forces an upload anywhere, such as a Docker build where `CI` is not passed, and fails the build without credentials; `false` turns uploads off. Upload credentials stay in the build environment, never in `VITE_` variables, which reach the browser.
- **Uploaded maps are hidden and deleted.** The plugin builds hidden maps, which carry no `sourceMappingURL`, and deletes them after upload, so the original source never ships on the public site. A test builds with a stand-in `posthog-cli` and checks both.
- **Only the browser bundle and its web workers are uploaded.** That is the code whose minified stack traces PostHog symbolicates. The server bundle is not what browsers run, and Nitro bundles it again, so maps from Vite's server environment would describe nothing deployed. Workers build separately with their own plugin instance.
- **The Content Security Policy needs no change.** Events, remote config, and the SDK's lazy-loaded scripts all come through `/t` on the application's own origin, which `start-app`'s `'self'` sources allow. Canvas recording in replay needs `worker-src 'self' blob:`, and survey images or the toolbar need their PostHog hosts; add those to `src/server/contentSecurityPolicy.ts` only when the application uses them.

## Files

| File                               | Job                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `src/contracts/posthog.ts`         | `serviceName`, `ingestPath`, `postHogEnvironment`, and the build's `bundledPostHog`.    |
| `src/client/posthog.tsx`           | SDK options, initialization, `PostHogIntegration`, and `captureRenderError`.            |
| `src/server/posthogProxy.ts`       | `forwardToPostHog`: routing, header filtering, and response cleanup for the proxy.      |
| `src/routes/t/$.ts`                | The ingest proxy route.                                                                 |
| `scripts/posthogSourceMaps.ts`     | `postHogSourceMaps`: when to upload, and the client and worker plugin instances.        |
| `src/**/*.test.ts(x)`, `scripts/*` | Environment parsing, SDK options, proxy behavior against a local upstream, and uploads. |

## Wiring

With `start-app` and `tooling`, see `stacks/full-stack/` (and `stacks/client-only/vite.config.ts` for the Cloudflare form of `vite.config.ts`, which client-only tools copy):

- `src/routes/__root.tsx`: wrap `<Outlet />` in `<PostHogIntegration>`, inside `<body>`. Providers that use `usePostHog()`, such as `posthog-auth-identity`'s identity component, go inside it.
- `src/router.tsx`: pass `defaultOnCatch: captureRenderError` to `createRouter`.
- `vite.config.ts`: convert the export to `defineConfig(({ mode }) => ...)`, call `postHogSourceMaps({ ...loadEnv(mode, process.cwd(), ''), ...process.env })`, add `sourceMaps?.client` to `plugins`, and set `worker: { plugins: () => [sourceMaps.worker()] }` when it is defined.
- `pnpm-workspace.yaml`: add `'@posthog/cli': true` to `allowBuilds`, because the upload plugin's CLI downloads its binary in an install script, and `core-js: false`, because `posthog-js` depends on `core-js`, whose install script only prints a banner, and pnpm fails a fresh install on any build script `allowBuilds` does not mention.

With `deploy-cloudflare`, nothing else changes: the Cloudflare plugin bundles `posthog-js` and `@posthog/react` into the Worker, and `sourceMaps?.client` goes before its `staticHeaders` plugin.

With `deploy-dokploy`, a Docker build sees only the build arguments it is given:

- `Dockerfile`: before `RUN pnpm build`, add `ARG VITE_POSTHOG_PROJECT_TOKEN VITE_POSTHOG_HOST POSTHOG_UPLOAD_SOURCEMAPS POSTHOG_CLI_PROJECT_ID POSTHOG_CLI_HOST`, and run the build as `RUN --mount=type=secret,id=posthog_cli_api_key,env=POSTHOG_CLI_API_KEY pnpm build`, so the upload key is a BuildKit secret that never lands in an image layer. Add `# check=skip=SecretsUsedInArgOrEnv` under the `syntax` line: Docker flags any `ARG` named like a token, and this one is public, since it ships in the browser bundle.
- `.github/workflows/deploy.yml`: pass those values to `publish-production-image` as `build-args` from repository variables, `POSTHOG_UPLOAD_SOURCEMAPS=${{ secrets.POSTHOG_CLI_API_KEY != '' }}`, and `secrets: posthog_cli_api_key=${{ secrets.POSTHOG_CLI_API_KEY }}`.
- `.github/workflows/preview.yml`: pass `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST` as `build-args`; previews do not upload source maps.

## Configuration

| Variable                     | Where     | Value                                                                                       |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `VITE_POSTHOG_PROJECT_TOKEN` | Build     | The project token (`phc_...`). Turns PostHog on. Shared with `posthog-server`.              |
| `VITE_POSTHOG_HOST`          | Build     | Optional; `https://eu.i.posthog.com` for EU Cloud or the self-hosted URL. US Cloud default. |
| `POSTHOG_CLI_API_KEY`        | Build, CI | A personal API key with source-map write access. Secret.                                    |
| `POSTHOG_CLI_PROJECT_ID`     | Build, CI | The numeric project id.                                                                     |
| `POSTHOG_CLI_HOST`           | Build, CI | Optional; the PostHog host for uploads, such as `https://eu.posthog.com`.                   |
| `POSTHOG_UPLOAD_SOURCEMAPS`  | Build     | Optional; `true` forces uploads (and requires the credentials), `false` turns them off.     |

Set `serviceName` in `src/contracts/posthog.ts` to the application's name. On Dokploy, set `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`, `POSTHOG_CLI_PROJECT_ID`, and `POSTHOG_CLI_HOST` as GitHub Actions variables and `POSTHOG_CLI_API_KEY` as a secret; the workflows pass them to the image build.

### Direct ingestion

To send straight to PostHog instead of through `/t`, for example to keep a Worker out of every analytics request, set `api_host: environment.host` in `postHogOptions`, delete `src/routes/t/$.ts` and `src/server/posthogProxy.ts`, and add the ingestion and assets hosts to `connect-src` and `script-src` in `src/server/contentSecurityPolicy.ts`. Ad blockers then block more events.

## Verify

- With the token set, open the app: the network panel shows `/t/flags/`, `/t/e/`, and `/t/static/...` requests answering 200, and no Content Security Policy errors in the console. The events appear in PostHog's activity view.
- `curl -i -X POST localhost:3000/t/e/ -H 'cookie: session=x'` answers PostHog's response without `set-cookie`.
- Throw from a route component: the `$exception` reaches PostHog, with and without a route `errorComponent`.
- After a CI deploy, an exception from the browser shows its original source in error tracking, and the deployed `assets/` directory holds no `.map` files.
