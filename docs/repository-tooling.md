# Repository tooling

[Back to the ras-stack overview](../README.md)

These configs, commands, actions, and workflows keep repository mechanics consistent without taking ownership of application-specific paths, services, permissions, or deployment policy.

## Shared project configuration

Extend the supplied configuration and override anything specific to the application:

```json
{
  "extends": ["./node_modules/ras-stack/config/oxlint.json"],
  "rules": {
    "application-specific-rule": "off"
  }
}
```

```json
{
  "extends": "ras-stack/config/typescript/tanstack",
  "include": ["src", "vite.config.ts"]
}
```

TypeScript bases are also available at `ras-stack/config/typescript/browser` and `ras-stack/config/typescript/library`.

The TypeScript configs compose by runtime role:

- `base` contains runtime-neutral strictness and module-safety options.
- `bundler` adds ESM bundler resolution without assuming DOM or Node globals.
- `browser` adds DOM, JSX, and no-emit defaults.
- `tanstack` adds Vite and Node types to the browser role.
- `node-bundler` targets bundled Node 24 workers and scripts.
- `library` uses NodeNext resolution and declaration-friendly strictness.

Oxlint applications can extend the strict default plus independent layers for shared application preferences and generated TanStack files:

```json
{
  "extends": ["./node_modules/ras-stack/config/oxlint/application.json", "./node_modules/ras-stack/config/oxlint/tanstack.json"],
  "rules": {
    "application-specific-rule": "off"
  }
}
```

These configs do not set include paths, aliases, generated directories outside TanStack's route tree, or framework-specific worker globals. Keep those differences in the consuming repository.

## Adopting the tooling

`ras init` lays down the shared tooling a repository wants:

```sh
pnpm exec ras init
```

It offers the repository policy and its generated files, the declared Node and pnpm versions, a `tsconfig.json` extending a shared preset, an `.oxlintrc.json`, a CI workflow calling the shared check workflow, and a justfile. Every step is a separate question, so a repository can take the parts that fit and decline the rest. A file that already exists is never replaced without a separate answer for that file, and the generated workflow pins the release that generated it.

`--dry-run` reports the plan without writing anything. The questions need a terminal, so `--yes` accepts every step for a non-interactive run.

This lays down tooling; it is not an application starter. [`examples/full-stack`](../examples/full-stack) remains an integration contract rather than something to copy.

## Repository policy

Policy files which cannot inherit can stay committed while being checked against the shared source. Select only the policies a repository wants in `ras-stack.policy.json`:

```json
{
  "changesets": {
    "overrides": {
      "access": "restricted",
      "privatePackages": { "version": true, "tag": true }
    }
  },
  "dependabot": true,
  "pnpm": {}
}
```

Then generate or verify the effective files:

```sh
pnpm exec ras policy sync
pnpm exec ras policy check
```

`changesets` and `dependabot` produce deterministic complete files, with optional deep overrides. The Dependabot policy creates separate patch and minor version update groups, leaves routine major upgrades to planned work, and still permits security updates. It applies a seven-day cooldown except to ras-stack's own actions and reusable workflows. The pnpm policy changes only `minimumReleaseAge` in the existing `pnpm-workspace.yaml`, preserving local package layout, build approvals, dependency overrides, exclusions, and comments. Its default is seven days; set `"minimumReleaseAge": 0` only as an explicit repository exception. Commit both the selection and generated files so policy changes remain visible in review.

The package does not police which ras-stack version a repository is on. Pick the version you want to ship; if it lacks something you use, the type checker and the failing import say so more precisely than a declared floor ever could.

`ras-stack/policy` exposes the same operations to a repository that needs them in its own script rather than through the command line:

```ts
import { checkRepositoryPolicy, syncRepositoryPolicy } from 'ras-stack/policy'

const drift = await checkRepositoryPolicy(process.cwd())
if (drift.length > 0) throw new Error(`policy drift: ${drift.join(', ')}`)
await syncRepositoryPolicy(process.cwd(), 'write')
```

## Production server assets

A bundled server usually needs files the bundler does not carry, such as Drizzle migrations. Declare them in `ras-stack.assets.json` and copy them into the build output after it exists:

```json
{
  "outputDirectory": ".output/server",
  "assets": [{ "source": "drizzle", "destination": "drizzle" }]
}
```

```sh
pnpm exec ras assets sync
pnpm exec ras assets check
```

`sync` copies each declared source into the output, and `check` fails when the output drifts from the source, so a stale build cannot ship. Both refuse paths that escape the repository or the output directory, overlapping destinations, and symbolic links. `ras-stack/build` exposes `loadServerAssetsConfig`, `syncServerAssets`, and `checkServerAssets` for a repository that drives them from its own build script.

## GitHub Actions

The JavaScript setup action reads the Node version from `engines.node` and the pnpm version from `packageManager` in the consuming repository:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: richardsolomou/ras-stack/actions/setup-js@v0.38.2
  - run: pnpm check
```

Just is independent of the application language and is installed separately when a repository uses it:

```yaml
- uses: richardsolomou/ras-stack/actions/setup-just@v0.38.2
  with:
    version: '1.58.0'
```

Applications using Changesets can call the reusable release workflow after their own required checks:

```yaml
release:
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  needs: [check]
  permissions:
    contents: write
  uses: richardsolomou/ras-stack/.github/workflows/release-changesets.yml@v0.38.2
  secrets: inherit
```

Browser jobs can cache the pinned Playwright payload through the shared setup action. Production-container E2E can use the reusable workflow, while repository-specific preparation and the actual test command remain inputs:

```yaml
e2e:
  uses: richardsolomou/ras-stack/.github/workflows/check-container-browser.yml@v0.38.2
  with:
    image: my-app-e2e
    cache-scope: my-app-e2e
    prepare-command: just prepare-e2e
    command: just e2e-run
    just-version: '1.58.0'
```

The loaded image tag is also available to the command as `RAS_STACK_TEST_IMAGE`. Build and browser durations are written to the job summary, and failure artifacts remain configurable. Applications that need extra caches, services, registry publication, or a different PR/main topology can use `actions/build-container` and `actions/setup-playwright` inside their own job instead. The Playwright setup action installs system dependencies by default; set `install-dependencies: 'false'` only for runner images that already provide the browser libraries.

Container actions export the smaller final-image cache by default. `publish-production-image` reads both its production cache and the `e2e-image` cache, so an E2E build can warm unchanged layers for the release build without paying to upload every intermediate BuildKit layer.

Production deployments can point Dokploy at the exact image that the workflow already published instead of asking Dokploy to rebuild the repository:

```yaml
- id: image
  uses: richardsolomou/ras-stack/actions/resolve-container-image@v0.38.2
  with:
    image: ghcr.io/example/application:sha-${{ github.sha }}
- uses: richardsolomou/ras-stack/actions/deploy-dokploy-image@v0.38.2
  with:
    url: ${{ secrets.DOKPLOY_URL }}
    api-key: ${{ secrets.DOKPLOY_API_KEY }}
    application-id: ${{ secrets.DOKPLOY_APPLICATION_ID }}
    image: ${{ steps.image.outputs.reference }}
```

The action switches the application to Dokploy's Docker-image provider before deploying. Public images need no registry inputs; private images supply `registry-url`, `registry-username`, and `registry-password` together. The caller owns image publication, the immutable tag or digest, application environment, domains, health verification, and deployment policy.

Preview images use the application package with a readable, commit-specific tag: `preview-pr-<number>-sha-<40-character commit>`. Resolve that tag through `actions/resolve-container-image` before deployment to retain its readable identity while pinning the exact manifest digest. On pull request close, and from a scheduled orphan sweep, `actions/prune-preview-images` removes only versions whose tags all match that preview convention; production versions are never candidates.

Straightforward single- or multi-platform releases can use `actions/publish-production-image` to publish `latest`, the release tag, and `sha-<commit>` together and receive the digest-pinned commit reference as an output. Applications retain checkout, release orchestration, generated build inputs, scanning, and deployment; complex manifest assembly can keep using Buildx directly and resolve the resulting tag separately.

Dokploy applications share the complete preview lifecycle through three reusable workflows:

- `build-dokploy-preview.yml` builds same-repository images directly in GHCR and keeps fork images in an untrusted artifact.
- `deploy-dokploy-preview.yml` publishes fork artifacts, resolves immutable image digests, deploys or deletes the Dokploy application, verifies health, reports status, and removes closed-PR images.
- `prune-dokploy-previews.yml` removes orphaned applications and images on a schedule.

Callers provide only their package, application prefix, port, environment template, status marker, and note. Supplying `domain` creates `https://<subdomain-prefix>-<number>.<domain>` with Let's Encrypt; `subdomain-prefix` defaults to `pr`. Omitting `domain` asks Dokploy for an HTTP `sslip.io` domain, which avoids caller-owned DNS and certificates but requires the origin to accept direct port 80 traffic and must only be used with disposable preview credentials and data. The environment template supports `{{PR_NUMBER}}`, `{{PREVIEW_URL}}`, and `{{RANDOM_HEX_32}}`, so resolved URLs and secrets do not require repository scripts. All callers use the standard `DOKPLOY_URL`, `DOKPLOY_API_KEY`, and `DOKPLOY_ENVIRONMENT_ID` secrets; the environment ID must identify a staging environment rather than production.

Origins restricted to Cloudflare can set `cloudflare-zone-id` and inherit a `CLOUDFLARE_API_TOKEN` secret with DNS Write access limited to that zone. The deploy workflow creates or updates a proxied A record at the custom preview hostname before deployment, while close and prune workflows delete only records carrying the matching ras-stack ownership comment. Use a first-level hostname such as `sealed-lists-pr-42.ras.sh` when the zone's Universal SSL certificate covers `*.ras.sh`; a nested hostname requires separate certificate coverage.

Applications without custom lifecycle hooks use the workflows' built-in `ras preview dokploy deploy`, `delete`, and `prune` commands. An application that owns external preview resources can set `deploy-script` to a trusted repository script built on `ras-stack/preview/dokploy`; the reusable workflows still own all GitHub, image, and scheduling mechanics. `playwright-config` adds a post-deploy browser verification without replacing the lifecycle.

`dokployPreviewFromEnvironment` reads the same variables the commands use and returns the resolved configuration alongside a `DokployPreviewManager`, so a script only writes the part that differs:

```ts
import { dokployPreviewFromEnvironment } from 'ras-stack/preview/dokploy'

const { manager } = dokployPreviewFromEnvironment()
await manager.deploy({
  prNumber: process.env.PR_NUMBER!,
  image: process.env.PREVIEW_IMAGE!,
  environment: ({ url }) => `APP_URL=${url}\n`,
  configure: async ({ applicationId, url }) => provisionTenantFor(applicationId, url),
})
```

`DokployClient` underneath it exposes the raw Dokploy API for anything the manager does not model.

Managers created by `dokployPreviewFromEnvironment` write the resolved URL to the current GitHub Actions step output before application configuration and deployment. Custom lifecycle scripts therefore retain ready and failed status links when they use generated domains.

All three commands require `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_ENVIRONMENT_ID`, `PREVIEW_APPLICATION_PREFIX`, and `PREVIEW_PORT`. `PREVIEW_DOMAIN` selects a custom HTTPS hostname, and `PREVIEW_SUBDOMAIN_PREFIX` changes the default `pr` prefix; omitting the domain selects a Dokploy-generated HTTP hostname. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` together enable owned, proxied A-record lifecycle for custom hostnames. `PREVIEW_HEALTH_PATH` optionally overrides the default `/api/health`; private images set `PREVIEW_REGISTRY_USERNAME` and `PREVIEW_REGISTRY_PASSWORD` together.

| Command  | Additional environment                                                       |
| -------- | ---------------------------------------------------------------------------- |
| `deploy` | `PR_NUMBER`, `PREVIEW_IMAGE`, and a multiline `PREVIEW_ENVIRONMENT` template |
| `delete` | `PR_NUMBER`                                                                  |
| `prune`  | Space-separated `OPEN_PR_NUMBERS` (empty means no previews remain open)      |

Preview comments and commit checks can use the same state transition without carrying a GitHub API client in every repository:

```ts
import { reportPreviewStatus } from 'ras-stack/preview/github'

await reportPreviewStatus(
  { repository, token, marker: '<!-- app-preview -->', note: 'Preview data is disposable.' },
  { state: 'ready', prNumber, sha, previewUrl, runUrl },
)
```

The reporter keeps one marked comment and one named check run, preserves the last ready commit while a replacement builds, bounds comment pagination, and validates repository, pull request, commit, marker, and URL inputs. Building and failed states may omit the URL while Dokploy resolves a generated domain; ready states always require it. Applications retain their preview access note, seed credentials, and product cleanup hooks.

The lower-level status workflow remains available when an application needs to report a transition outside the standard lifecycle:

```yaml
mark-preview-ready:
  permissions:
    contents: read
    checks: write
    issues: write
  uses: richardsolomou/ras-stack/.github/workflows/report-preview-status.yml@v0.38.2
  with:
    state: ready
    pr-number: ${{ github.event.workflow_run.pull_requests[0].number }}
    sha: ${{ github.event.workflow_run.head_sha }}
    preview-url: https://pr-${{ github.event.workflow_run.pull_requests[0].number }}.example.com
    run-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    marker: <!-- app-preview -->
    note: Preview data is disposable.
  secrets:
    token: ${{ secrets.GITHUB_TOKEN }}
```

The standard Dokploy workflows compose this reporter with the lower-level image actions. Their `workflow_run` boundary ensures fork code receives neither deployment secrets nor a writable package token: a fork creates a one-day image artifact, and trusted default-branch workflow code publishes and deploys it after approval.

Self-hosted images that run the app, Centrifugo, and Caddy together can share the lifecycle without sharing a Dockerfile:

```ts
import { runRealtimeStack } from 'ras-stack/runtime'

await runRealtimeStack({
  app: { command: 'node', args: ['.output/server/index.mjs'], env: { ...process.env, PORT: '3001' } },
  centrifugo: {
    configPath: '/app/realtime.json',
    env: process.env,
    environment: realtime,
  },
  caddy: {
    configPath: '/tmp/app/Caddyfile',
    env: process.env,
  },
})
```

`runRealtimeStack()` creates the Caddy configuration and supervises the standard app, Centrifugo, and Caddy topology. Any unexpected child exit stops its siblings; orchestrator signals receive a graceful window before remaining children are force-killed. Lower-level configuration and supervision functions remain available when a topology differs. Applications retain base images, namespaces, ports, volumes, secrets, per-process environment inheritance, preview seeding, and distributed-mode policy.

The separately released `ghcr.io/richardsolomou/ras-stack-runtime-binaries` image provides verified static Caddy and Centrifugo binaries without imposing an application base image. Copy the binaries from an immutable release and pin its digest:

```dockerfile
FROM ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.2@sha256:311119db377ac80e87b3116e634912eeca2059b16c170a4d342923de3fd90ba9 AS runtime-binaries
COPY --from=runtime-binaries /usr/local/bin/caddy /usr/local/bin/caddy
COPY --from=runtime-binaries /usr/local/bin/centrifugo /usr/local/bin/centrifugo
```

For local development, the package can run the same pinned Centrifugo binary in Docker while the application and its Vite proxy remain local:

```sh
ras realtime \
  --config realtime.json \
  --name example-realtime \
  --port 8000 \
  --origin http://localhost:3000 \
  --secret development-secret
```

The foreground command follows terminal signals and leaves an existing named container alone. Add `--detach` to replace that named development container and return after startup. The host binding defaults to `127.0.0.1`; container-based callers that must reach Centrifugo through the Docker host can explicitly pass `--bind-address 0.0.0.0`. Applications with a Centrifugo connect proxy can pass its Docker-reachable URL through `--connect-proxy-endpoint`; channel definitions, proxy authorization, application environment, and Vite configuration remain in the application.

`runtime/VERSION` and `runtime/Dockerfile` own the release and source versions. Runtime tags publish independently from npm releases so binary changes must pass the full-stack production-container gate before a `runtime-v*` tag is created. Land and publish a changed runtime version before advancing application, starter, development, or documentation references; those consumers must continue using the last published immutable digest until the new multi-platform index exists and its actual digest can be pinned.

Read-only containers can pass writable `configHome` and `dataHome` paths to `caddyRuntimeEnvironment()`; both default to isolated directories under `/tmp`.

The workflow consumes pending changesets, commits the resulting versions and changelogs, pushes the commit and tag atomically, and creates a GitHub Release. It does nothing when no versioned changeset is present. The caller owns its checks, Changesets configuration, release policy, and any deployment that follows the release.

Pin actions and reusable workflows to a release tag and let Dependabot propose upgrades.

Reusable workflows cannot refer to an action at their own dynamic release tag. Their implementations therefore pin ras-stack actions to one older independently published bootstrap tag. Keep every ras-stack action in the shared workflows on that same tag and advance them together. Consumer examples and direct action calls should use the current release.

The JavaScript setup action and shared check workflow reject Dependabot branches that do not contain the base commit recorded by the pull request event. Custom dependency workflows can apply the same guard directly:

```yaml
- uses: richardsolomou/ras-stack/actions/require-current-base@v0.38.2
  if: github.event_name == 'pull_request' && startsWith(github.head_ref, 'dependabot/')
  with:
    base-sha: ${{ github.event.pull_request.base.sha }}
    head-sha: ${{ github.event.pull_request.head.sha }}
```

Keep strict up-to-date branch protection enabled for the required check. When the guard fails, update or rebase the dependency branch onto current `main`, regenerate its lockfile, and let the normal policy check run against that refreshed result. Do not merge it with an administrative bypass.

The reusable check workflow owns checkout and toolchain setup while the repository keeps its check command:

```yaml
jobs:
  check:
    uses: richardsolomou/ras-stack/.github/workflows/check-js.yml@v0.38.2
    with:
      command: just check
      just-version: '1.58.0'
```

Simple Playwright jobs can also share browser installation and failure artifacts:

```yaml
jobs:
  end-to-end:
    uses: richardsolomou/ras-stack/.github/workflows/check-browser.yml@v0.38.2
    with:
      prepare-command: pnpm build
      command: pnpm test:e2e:run
      artifact-path: test-results
```

Callers continue to own workflow triggers, concurrency, required-job dependencies, permissions, services, caches, custom setup, and release or deployment policy. Keep jobs local when they need steps beyond these stable shapes.
