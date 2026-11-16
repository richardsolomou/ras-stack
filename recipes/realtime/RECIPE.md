---
name: realtime
version: 1
summary: Centrifugo live updates with signed tokens, React hooks, a Docker dev server, and a container supervisor.
requires: [start-app]
conflicts: []
dependencies: [centrifuge]
devDependencies: [react-test-renderer, '@types/react-test-renderer']
wires: [package.json, pnpm-workspace.yaml, vite.config.ts, src/server/app.ts, Dockerfile, .github/dependabot.yml]
---

# realtime

## Use it when

Pages must change when something happens elsewhere: another user edits a list, a background job finishes, a teammate joins a board. The server publishes a small event on a channel, and browsers subscribed to it refetch or update in place.

It assumes one container on Dokploy, where Centrifugo and Caddy run beside the app. On Cloudflare, or when every change comes from the browser that made it, use Query invalidation after mutations instead. Applications whose state lives in SpacetimeDB or Convex already have subscriptions; use those.

## Decisions

- **Centrifugo, in the same container as the app.** It is one static binary with history, recovery, presence, and an HTTP publish API, so the app needs no hosted service or extra account. Browsers reach it at `/connection/websocket` on the app's own origin, so cookies, the Content Security Policy, and proxies treat it as part of the app. Start's `connect-src 'self'` already allows the same-origin WebSocket.
- **Signed tokens, not Centrifugo's connect proxy.** The browser asks `POST /api/realtime/token` for a five-minute HS256 token, and Centrifugo verifies it with the shared secret. The connect proxy instead has Centrifugo call back into the app with the browser's cookies, which needs a proxy secret, a route reachable from Centrifugo (`host.docker.internal` and Vite's `allowedHosts` in development), and origin checks that work on a request the browser did not send. A canonical-host redirect once turned that callback's POST into a GET that returned HTML, and Centrifugo retried it forever. With tokens, the token route is an ordinary same-origin request, Centrifugo never calls the app, and every token refresh re-checks access, so revoking a user takes effect within five minutes.
- **The token route is a POST behind `requireSameOrigin`.** A same-origin `fetch` GET carries no `Origin` header, so only a POST can be held to the same origin check as every other mutation. Tokens are `no-store`.
- **Two kinds of channel.** Channels in the connection token's `channels` claim are server-side subscriptions: the browser cannot leave or forge them, which suits per-user channels such as `user:<id>`. Every other channel needs a subscription token, which `canSubscribe` grants or refuses per channel. Both rules live in `src/server/realtimeChannels.ts`, the application's policy file.
- **A refusal stops the client; anything else retries.** The token route answers 401 when the viewer lookup refuses and 403 for a channel the policy refuses. The client turns both into Centrifuge's `UnauthorizedError`, which stops reconnecting or resubscribing; a 5xx or network failure is retried with backoff.
- **Who may connect is decided in `src/server/app.ts`.** `createRealtime` takes a viewer lookup, so the auth recipe's session becomes the realtime identity in the composition root, and the recipe never imports auth. Without auth, the lookup returns an anonymous viewer (`id: ''`), which may follow public `updates:` channels and has no server-side channels.
- **One secret.** `REALTIME_SECRET` signs connection and subscription tokens and is Centrifugo's API key. The API listens only on loopback inside the container, so a separate key would guard nothing more. The container generates the secret once into `$DATA_DIR/realtime-secret` (48 random bytes, mode 0600, created through a hard link so two starts cannot write different secrets) and hands it to the app and Centrifugo through the environment, so redeploys keep existing tokens valid. Outside production, the app and the development command fall back to the same fixed development secret; in production the app refuses to start without one.
- **The publisher never blocks a request.** `publish` queues and returns at once. Publications to one channel keep their order and coalesce to the latest while one is in flight, so a payload should say what changed (`{ type: 'list.changed', id }`) rather than carry state a client must not miss. At most 8 channels publish at once and 1,024 wait; past that `publish` returns `false` and reports why. Network failures, timeouts (5 seconds), 5xx and 429 answers, and Centrifugo's internal error (code 100, which it reports inside a 200 response) are retried three times a second apart; other errors are reported once. `onError` can never throw into the queue, and a publication queued while an earlier one fails still goes out. A publication to an empty channel name drains instead of stalling the queue.
- **Shutdown drains publications for at most one second.** `close` refuses new publications and waits for accepted ones and their retries, but stops waiting at one second so a dead Centrifugo cannot hold the container past Docker's kill, and telemetry, which closes after it, keeps its slot in the shutdown budget. Publications still queued then are dropped, which payloads that say what changed tolerate.
- **Best effort, with recovery.** A publication can be lost if Centrifugo is down for longer than the retries. The default namespaces keep the last 10 publications for 5 minutes with `force_recovery`, so a reconnecting client replays what it missed, and `useServerChannel`'s `unrecovered` callback tells it when it could not, so it refetches. When a lost event costs more than a refetch, write an outbox row in the same database transaction as the change and publish from a worker. Have it retry the oldest row first with capped backoff, so a failing row is never overtaken, cap the queue so writes answer 503 rather than grow it without end, and move a row that keeps failing aside where readiness reports it. That needs a database, so it is application code.
- **One connection per page, from `RealtimeProvider`.** The provider connects after mount and disconnects on unmount. Its client and hooks return `undefined` whenever the connection is torn down, so a caller never holds a disconnected client after its inputs change. Key the provider by the signed-in user, because the connection token belongs to whoever was signed in when it connected. Hook callbacks must keep their identity, because a new one restarts the connection or subscription. A `configure` callback that throws is passed to `reportError`, where PostHog's exception autocapture sees it, and leaves the client or subscription `undefined`; rethrowing from the effect would unmount the whole page for a live-update feature.
- **Development runs the production binary in Docker.** `pnpm realtime` starts Centrifugo from the image the Dockerfile's `runtime-binaries` stage pins, which it reads from the Dockerfile so the pin lives in one place, published on `127.0.0.1:8000` only, and Vite proxies `/connection` to it. It runs in the foreground with `--rm`, so Ctrl-C stops and removes it. The container is named after the project directory, so two projects do not collide.
- **The binaries come from `ghcr.io/richardsolomou/ras-stack-runtime-binaries`, pinned by digest.** That image builds Caddy and Centrifugo from checksummed source with patched Go dependencies and is rebuilt when they have advisories, without imposing a base image. A tag can move; a digest cannot. Dependabot's `docker` ecosystem, which `deploy-dokploy` adds, proposes each new tag and digest, so fixed binaries reach the application as a reviewed pull request that updates development and production together. The image skips Dependabot's cooldown, because ras-stack publishes it to ship advisory fixes.
- **Caddy fronts the container.** It listens on `PORT` (3000) and sends `/connection/*` to Centrifugo and everything else to the app; both listen on loopback only (the app through `NITRO_HOST` and `NITRO_PORT`, so the public `PORT` keeps its meaning). Caddy refuses a WebSocket whose `Origin` names another host, which needs no configuration, in addition to Centrifugo's own allowed origins check. It trusts `X-Forwarded-*` only from private ranges, where Dokploy's Traefik runs, and replaces `X-Forwarded-For` with the visitor's address alone: its default appends Traefik's address, and Better Auth trusts only a single-value header, so every visitor would share one sign-in rate-limit bucket and one attacker could lock everyone out. It compresses responses with zstd and gzip (it skips upgrades and compressed content itself), and keeps its state in `/tmp/caddy` so it never writes outside writable paths.
- **One supervisor owns the three processes.** On SIGTERM it stops Caddy first so no new requests arrive, then the app, which finishes its requests and publications while Centrifugo still runs, then Centrifugo. All phases share one 8-second deadline, inside Docker's 10 seconds between SIGTERM and SIGKILL, and anything still running at the deadline is killed. Caddy waits for requests in flight forever by default, which spent the whole deadline on one slow request and killed the app before it closed its resources, so its `grace_period` is 3 seconds; the app then gets `SERVER_SHUTDOWN_TIMEOUT=1`, since Caddy already drained, and the publisher one second to send what is queued. The whole budget is in `start-app`'s RECIPE.md. If any process exits on its own, the supervisor stops the others at once and exits with that status, so Dokploy's restart policy restarts the whole container rather than leaving it half alive. It runs under `tini` without `-g`: forwarding signals to the whole process group would stop all three at once and break the order.
- **The scripts run with Node's type stripping.** `node scripts/realtime.ts` needs no build step or bundler, so the image copies the one file. It imports only Node built-ins, uses only erasable syntax, and keeps the development and container commands together so Centrifugo's environment is defined once.
- **One replica.** Centrifugo uses its in-memory engine. Running several replicas needs its Redis engine (`CENTRIFUGO_ENGINE_TYPE=redis` and `CENTRIFUGO_ENGINE_REDIS_ADDRESS` in `containerProcesses`).

## Files

| File                                     | Job                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `centrifugo.json`                        | Channel namespaces and their history; secrets and addresses come from the environment.                       |
| `scripts/realtime.ts`                    | `dev`: Centrifugo in Docker. `container`: the persisted secret, the Caddyfile, and the supervisor.           |
| `src/server/realtime.ts`                 | `createRealtime`, the token route's handler, token signing, and the secret.                                  |
| `src/server/realtimeChannels.ts`         | Application policy: server-side channels per viewer, and which channels a browser may subscribe to.          |
| `src/server/realtimePublisher.ts`        | `CentrifugoPublisher`: ordered, coalescing, bounded, retrying background publication.                        |
| `src/routes/api/realtime.token.ts`       | `POST /api/realtime/token`.                                                                                  |
| `src/client/realtime.ts`                 | The same-origin client, token requests, subscription options, and `watchServerChannel`.                      |
| `src/client/useRealtime.tsx`             | `RealtimeProvider`, `useRealtimeClient`, `useRealtimeSubscription`, `useServerChannel`, and the client hook. |
| `scripts/*.test.ts`, `src/**/*.test.ts*` | The supervisor's shutdown order and deadlines, Caddy routes, the secret, tokens, the publisher, the hooks.   |

Publish from server code with `app().realtime.publish(channel, data)`. In the browser, wrap the part of the page that listens in `<RealtimeProvider key={user?.id}>`, then use `useRealtimeSubscription('updates:<id>', configure)` for channels the browser picks, or `useServerChannel('user:<id>', publication, unrecovered)` for channels its token grants.

## Wiring

See `stacks/full-stack/`:

- `package.json`: add `"realtime": "node scripts/realtime.ts dev"` after `preview`.
- `pnpm-workspace.yaml`: add `protobufjs: false` to `allowBuilds`. `centrifuge` depends on `protobufjs`, whose install script only checks version ranges, and pnpm fails a fresh install on any build script `allowBuilds` does not mention.
- `vite.config.ts`: add `proxy: { '/connection': { target: 'ws://127.0.0.1:8000', ws: true } }` to `server`.
- `src/server/app.ts`: create the instance in `createApp` with the viewer lookup and return it. Create it before resources that publish, such as uploads, so it closes after them:

  ```ts
  const realtime = resources.adopt(createRealtime(viewer), (instance) => instance.close())
  return { realtime, close: () => resources.disposeAsync() }
  ```

  Without `auth`, pass `() => ({ id: '' })`. With `auth`, use its session:

  ```ts
  const viewer = async (request: Request) => {
    const user = await currentUser(request)
    return user ? { id: user.id, info: { name: user.name } } : undefined
  }
  ```

  Return `{ id: '' }` instead of `undefined` when signed-out visitors should still follow public channels.

- `Dockerfile` (from `deploy-dokploy`): keep its build stage, `tini` entrypoint, `/data` directory, `DATA_DIR=/data`, `PORT=3000`, `EXPOSE 3000`, and health check, which now pass through Caddy. Then:
  1. Add the binaries stage before the others. `pnpm realtime` reads its image from this line, so keep the `AS runtime-binaries` name:

     ```dockerfile
     FROM ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.9@sha256:b72916b0db314c9cdaab83142b845e3cba77777c44ecefaaf9e2661c24b5e164 AS runtime-binaries
     ```

  2. In the final stage, after copying `.output`:

     ```dockerfile
     COPY --from=runtime-binaries /usr/local/bin/caddy /usr/local/bin/caddy
     COPY --from=runtime-binaries /usr/local/bin/centrifugo /usr/local/bin/centrifugo
     COPY --chown=node:node centrifugo.json ./
     COPY --chown=node:node scripts/realtime.ts ./scripts/
     ```

  3. Replace the command with `CMD ["node", "scripts/realtime.ts", "container"]`, keeping `ENTRYPOINT ["/sbin/tini", "--"]`.

  The app moves to `127.0.0.1:3001` and Centrifugo listens on `127.0.0.1:8000`; neither is exposed. Keep `/data` on a volume so the generated secret survives redeploys.

- `.github/dependabot.yml` (from `ci`): in the `docker` ecosystem `deploy-dokploy` adds, exclude `'*ras-stack-runtime-binaries'` from the cooldown (`cooldown.exclude`). See `stacks/full-stack/.github/dependabot.yml`.

## Configuration

| Variable          | Where       | Value                                                                                                                                                                                    |
| ----------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REALTIME_SECRET` | Server only | Optional. The container generates one into `$DATA_DIR/realtime-secret`; set it only to share a secret across containers. Required in production when the app runs outside the container. |
| `APP_URL`         | Server only | The public origin, from `start-app`. Centrifugo accepts WebSockets only from it; without it, Caddy's origin guard alone applies.                                                         |
| `PORT`            | Container   | Caddy's public port; 3000 by default.                                                                                                                                                    |
| `DATA_DIR`        | Container   | Where the generated secret lives; `/data` by default.                                                                                                                                    |

Docker must be running for `pnpm realtime`. Change channels in `src/server/realtimeChannels.ts` and their namespaces in `centrifugo.json` together; Centrifugo rejects a channel whose namespace it does not know.

## Verify

- Run `pnpm realtime` and `pnpm dev`. Open two browsers signed in as different users on a page that subscribes to an `updates:` channel and publish to it from a server function: both receive it, with no console errors. A `user:<id>` publication reaches only that user.
- `curl -i -X POST localhost:3000/api/realtime/token -H 'origin: https://attacker.example'` answers 403.
- Build the image and run it with a `/data` volume. `/api/health` answers 200 through Caddy, `/data/realtime-secret` exists and survives a restart, a WebSocket upgrade with `Origin: https://attacker.example` answers 403, and `docker stop` logs Caddy, then the app, then Centrifugo shutting down and exits 0. Killing Centrifugo inside the container stops the container with a nonzero status.
