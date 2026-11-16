---
name: deploy-dokploy
version: 2
summary: Nitro Node server in a small non-root image, deployed to Dokploy from main by digest, with a preview per pull request.
requires: [start-app]
conflicts: [deploy-cloudflare]
dependencies: []
devDependencies: [nitro]
wires: [vite.config.ts, package.json, .gitignore, .oxlintrc.json, .github/dependabot.yml]
---

# deploy-dokploy

## Use it when

The application runs a long-lived server: a database on disk, WebSockets, background work, or anything else a request-scoped runtime cannot hold. It deploys to a Dokploy server on arm64, such as a Hetzner Ampere machine, as a container image from GHCR.

Use `deploy-cloudflare` instead for an application whose server only renders pages and answers stateless server functions.

## Decisions

- **Nitro's `node-server` preset, set explicitly.** Nitro picks a preset from the environment it builds in, so a build on a CI provider it recognizes could emit that provider's output instead of a Node server. `vite build` writes `.output/server/index.mjs`, which serves the static files in `.output/public` and everything Start renders, and reads `PORT` (3000 by default).
- **Nitro owns shutdown.** On `SIGTERM` or `SIGINT`, srvx (Nitro's server) stops accepting connections, waits up to five seconds (`SERVER_SHUTDOWN_TIMEOUT`) for requests in flight, and then runs Nitro's `close` hooks. `src/server/shutdown.ts` closes the composition root from that hook. It reads the instance from `globalThis` under `app.ts`'s key rather than importing `closeApp`: Nitro bundles plugins apart from the routes, so the import put a second copy of the composition root, and everything it imports, into the plugin bundle and loaded it at startup. An application that changes the key in `app.ts` changes it here too; `src/server/shutdown.test.ts` fails until they match. Closing resources and exiting as soon as the signal arrives would cut off requests in flight: a two-second request sent before `SIGTERM` loses its connection instead of finishing. Without the exit, the process ends when the server and resources have closed; a resource whose cleanup leaves a handle open shows up as a stop that takes the container's full grace period.
- **`'use client'` warnings are off for the server bundle.** Nitro bundles React Query into the server, and Rolldown warns about each `'use client'` directive, which means nothing outside React Server Components.
- **Images build natively on arm64.** The Dokploy server is arm64, so the production and preview images build for `linux/arm64` on GitHub's `ubuntu-24.04-arm` runners rather than under QEMU, which is several times slower and turns native module compiles into minutes. A private repository without arm64 runners can switch the deploy job to `ubuntu-latest` and add `docker/setup-qemu-action`.
- **Alpine, two stages, only `.output` in the final image.** Nitro traces the server's dependencies into `.output/server/node_modules`, native binaries included, so the final stage needs no `node_modules`, package manager, or compiler. The build stage has `python3`, `make`, and `g++` so a native module such as `better-sqlite3` compiles when no prebuilt binary matches musl on arm64; because the build stage runs on the target platform, the traced binary is the right one. The final stage removes npm, corepack, and yarn, which the server never runs, and is the Node base plus the build output.
- **`corepack install` reads `packageManager`.** The image installs exactly the pnpm version `package.json` declares, so the image, CI, and local installs cannot drift. `pnpm-workspace.yaml` is copied before installing because it holds the release-age and build-script policy.
- **Non-root, with `/data` for anything written.** The server runs as `node`. `/data` exists and belongs to `node`, and `DATA_DIR` points at it, so recipes that write files (SQLite, uploads) write there. A Docker named volume copies that ownership on first mount; a bind mount does not, so production uses a volume.
- **No `VOLUME` instruction.** Dokploy runs each deploy as a new Swarm task, and a `VOLUME` without a configured mount gives every task a fresh anonymous volume: production would silently start empty after each deploy while the old volumes pile up on the server, one per preview deploy too. Production mounts a named volume at `/data` in Dokploy; previews write to the container layer and start empty on every deploy, which is what they promise.
- **`tini` is PID 1.** It forwards signals to Node and reaps zombies, which matters once the `realtime` recipe runs Centrifugo and Caddy as children. It is the `ENTRYPOINT`, so a recipe that changes how the container starts replaces only `CMD`.
- **The health check is `/api/health` over `127.0.0.1`.** `start-app` answers it on any host, builds the composition root inside it, and returns 503 when a dependency is missing, so a misconfigured deploy fails Dokploy's health check instead of its first visitor. Busybox `wget` is already in the image.
- **Deploy after CI passes on `main`, from a separate workflow.** `deploy.yml` runs on `workflow_run` of `CI`, so a red `main` never deploys, and has its own concurrency group that never cancels: CI cancels superseded runs, and cancelling a deploy halfway through Dokploy's API calls could leave the application pointed at an image it never started. Only `push` runs deploy, because a fork's pull request from its own `main` branch matches the `main` branch filter too. `workflow_dispatch` on `main` redeploys.
- **Dokploy runs the exact digest CI built.** `publish-production-image` tags `production`, `latest`, and `sha-<commit>`, and returns `sha-<commit>@sha256:…`; `deploy-dokploy-image` switches the application to that image without Dokploy rebuilding the repository. The readable tag says which commit is live and the digest makes it immutable. SBOM and provenance attestations are off: nothing verifies them, and they add about 20 seconds per release.
- **Dependabot updates the Dockerfile's images.** Its `docker` ecosystem moves a tag pinned by digest to the newest tag and digest, which is how a recipe's pinned image, such as `realtime`'s runtime binaries, reaches applications. `node:24-alpine` follows its tag on every build, so Dependabot ignores its majors: moving Node is a deliberate change alongside `engines` and CI.
- **Private images use one optional secret.** With `GHCR_PULL_TOKEN` set, the deploy passes GHCR credentials to Dokploy; without it, the image must be public. The action clears any registry configured in Dokploy's UI, so credentials have to come from the workflow.
- **Previews use the shared reusable workflows.** `ras-stack`'s `build-dokploy-preview.yml`, `deploy-dokploy-preview.yml`, and `prune-dokploy-previews.yml` own the image build, the fork boundary (forks build an artifact without secrets; the trusted `workflow_run` publishes and deploys it after approval), the pull request comment and check, Cloudflare DNS, and cleanup. They run `pnpm exec ras preview …`, which comes from the `ras-stack` development dependency `tooling` installs. Each preview lives at `https://<app>-pr-<number>.ras.sh`, a first-level name so the `*.ras.sh` Universal SSL certificate covers it, proxied through Cloudflare so the origin only accepts Cloudflare traffic. `APP_URL` is the preview URL, so the canonical host redirect and absolute links use it.
- **Preview deploys queue rather than cancel.** `preview-deploy.yml` groups each pull request's runs and never cancels one in progress, matching the reusable workflow's own deploy group: cancelling a run midway through Dokploy and Cloudflare API calls leaves the pull request's status on building and can leave the preview half updated. A newer run waiting in the group replaces an older waiting one, so a burst of pushes still deploys only the latest, and the deploy job skips a commit that is no longer the pull request's head.
- **A fork's preview runs only after a maintainer approves its workflow run.** A fork's `pull_request` run builds the image without secrets, but its `workflow_run` then deploys that image to the server with no further check, so GitHub's approval of the fork's run is the only gate between a stranger's code and the server. GitHub's default asks for approval only from first-time contributors, so the repository must require it for every outside contributor (see **Configuration**). Approving a run means having read the diff, because the image runs whatever it contains.

## Files

| File                                   | Job                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `Dockerfile`                           | Builds on Alpine, runs `.output` as `node` under `tini`, health check, `/data`.      |
| `.dockerignore`                        | Keeps dependencies, build output, Git, and local environment files out of builds.    |
| `src/server/shutdown.ts`               | Nitro plugin that closes the composition root after the server drains.               |
| `src/server/shutdown.test.ts`          | The close hook closes the app.                                                       |
| `.github/workflows/deploy.yml`         | After CI passes on `main`: publish the arm64 image and deploy its digest to Dokploy. |
| `.github/workflows/preview.yml`        | Builds each pull request's preview image.                                            |
| `.github/workflows/preview-deploy.yml` | Deploys, reports, and deletes previews.                                              |
| `.github/workflows/preview-prune.yml`  | Weekly removal of previews and images whose pull requests are gone.                  |

The preview workflows name the application `app`. Replace every `app` in them (`package`, `local-image`, `application-prefix`, `subdomain-prefix`, `marker`) with the repository name, which is also the GHCR package name `deploy.yml` publishes. Write the preview `note` for the application, such as seeded sign-in details.

### Seams other recipes extend

**`Dockerfile`.** Files the server reads at runtime that Nitro does not bundle are copied from the build stage after `.output`, owned by `node`. Database recipes add their migrations:

```dockerfile
COPY --from=build --chown=node:node /app/drizzle ./drizzle
```

Recipes that run more than the Node server, such as `realtime`, add a stage for their binaries, copy them into the final stage, and replace `CMD` with their supervisor; `tini` stays the `ENTRYPOINT`. A build-time value, such as PostHog's project token, is an `ARG` set before `RUN pnpm build`, passed through `build-args` in `deploy.yml` and `preview.yml`.

**`.github/workflows/preview-deploy.yml`.** Add each variable a preview needs to `environment`, one per line. `{{RANDOM_HEX_32}}` generates a secret per deploy, such as `BETTER_AUTH_SECRET={{RANDOM_HEX_32}}`.

## Wiring

With `start-app`, see `stacks/postgres/`:

- `vite.config.ts`: import `nitro` from `nitro/vite` and add it after `tanstackStart()`, with `preset: 'node-server'`, `plugins: ['./src/server/shutdown.ts']`, and `rolldownConfig: { checks: { moduleLevelDirective: false } }`.
- `package.json`: add `"start": "node .output/server/index.mjs"` after `preview`.
- `.gitignore`: add `.output/`.
- `.oxlintrc.json`: add `.output/**` to `ignorePatterns`.
- `.github/dependabot.yml` (from `ci`): add a `docker` ecosystem for `/` with the same weekly schedule and seven-day cooldown, and ignore `node`'s semver-major updates. See `stacks/postgres/.github/dependabot.yml`.

## Configuration

| Variable                                                 | Where   | Value                                                                                                                                                |
| -------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                                | Dokploy | The production origin, such as `https://example.com`.                                                                                                |
| `DOKPLOY_URL`                                            | Actions | Secret. The Dokploy base URL.                                                                                                                        |
| `DOKPLOY_API_KEY`                                        | Actions | Secret. A Dokploy API key.                                                                                                                           |
| `DOKPLOY_APPLICATION_ID`                                 | Actions | Secret. The production application's ID.                                                                                                             |
| `DOKPLOY_ENVIRONMENT_ID`                                 | Actions | Secret. The Dokploy environment reserved for previews, never production's.                                                                           |
| `CLOUDFLARE_API_TOKEN`                                   | Actions | Secret. DNS Write on the `ras.sh` zone only, for preview records.                                                                                    |
| `CLOUDFLARE_ZONE_ID`                                     | Actions | Variable. The preview domain's Cloudflare zone, such as `ras.sh`'s.                                                                                  |
| `GHCR_PULL_TOKEN`                                        | Actions | Optional secret. A token with `read:packages`, when the image is private.                                                                            |
| `PREVIEW_REGISTRY_USERNAME`, `PREVIEW_REGISTRY_PASSWORD` | Actions | Optional secrets. The same GHCR credentials for previews of a private image.                                                                         |
| `PREVIEW_APP_SECRETS`                                    | Actions | Optional secret. JSON of product secrets a custom preview `deploy-script` may read.                                                                  |
| `SERVER_SHUTDOWN_TIMEOUT`                                | Dokploy | Optional. Seconds to drain requests on shutdown; 5 by default, and 1 under the realtime supervisor. See the shutdown budget in `start-app`'s README. |

In Dokploy:

1. Create the production application in its project, set its environment (`APP_URL` and whatever other recipes need), and add the domain on port 3000 with HTTPS.
2. Add a **volume** mount (not a bind mount) at `/data` when the application writes files.
3. Create a separate environment for previews and use its ID as `DOKPLOY_ENVIRONMENT_ID`. Dokploy must have its public server IP configured, because preview DNS points at it.

In GitHub:

1. Add the secrets above and a `production` environment (the deploy job uses it, so it can hold the production secrets and protection rules).
2. Under **Settings > Actions > General > Approval for running fork pull request workflows from contributors**, choose **Require approval for all external contributors** (`gh api -X PUT repos/<owner>/<repo>/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors`), so every run from a fork waits for a maintainer before it can reach the preview deploy.
3. Create a `dependabot-preview` environment with required reviewers. The preview workflow refuses to deploy Dependabot pull requests without it.
4. Run **Deploy** once by hand, or merge to `main`, to publish the first image; then make the GHCR package public or set `GHCR_PULL_TOKEN`.

In Cloudflare, proxy the production hostname to the server like the other `ras.sh` applications.

## Verify

- `pnpm build && PORT=3456 pnpm start`, then `curl -i localhost:3456/api/health` answers 200 with the security headers.
- With a slow request in flight, `kill -TERM` the server: the request completes, then the app's resources close and the process exits 0.
- `docker build -t app . && docker run --rm -p 3000:3000 app`: `docker ps` shows `healthy` within 15 seconds, `docker exec` shows `id` as `node` and `/data` writable, and `docker stop` returns in about a second.
- Merge to `main`: **Deploy** runs after CI, its summary names the `sha-<commit>@sha256:…` reference, and Dokploy shows the same image.
- Open a pull request: the preview comment moves from building to ready with a working `https://<app>-pr-<number>.ras.sh`, and closing the pull request deletes it.
