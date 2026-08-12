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
  "pnpm": {},
  "adoption": {
    "minimumRasStackVersion": "0.33.0",
    "node": ">=24 <25",
    "pnpm": "11.15.0",
    "just": "1.58.0"
  }
}
```

Then generate or verify the effective files:

```sh
pnpm exec ras policy sync
pnpm exec ras policy check
pnpm exec ras policy sync adoption
pnpm exec ras policy check adoption
```

`changesets` and `dependabot` produce deterministic complete files, with optional deep overrides. The pnpm policy changes only `minimumReleaseAge` in the existing `pnpm-workspace.yaml`, preserving local package layout, build approvals, dependency overrides, exclusions, and comments. Its default is seven days; set `"minimumReleaseAge": 0` only as an explicit repository exception. Commit both the selection and generated files so policy changes remain visible in review.

Adoption synchronization updates older ras-stack package and workflow references plus the declared Node, pnpm, and Just versions. It preserves package range style, explicit workflow-version exceptions, newer ras-stack versions, application dependencies, and workflow structure. Check mode reports the exact files that would change without writing them. Shared config references remain check-only because adding them requires application-specific include paths and overrides.

## GitHub Actions

The JavaScript setup action reads the Node version from `engines.node` and the pnpm version from `packageManager` in the consuming repository:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: richardsolomou/ras-stack/actions/setup-js@v0.34.0
  - run: pnpm check
```

Just is independent of the application language and is installed separately when a repository uses it:

```yaml
- uses: richardsolomou/ras-stack/actions/setup-just@v0.34.0
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
  uses: richardsolomou/ras-stack/.github/workflows/release-changesets.yml@v0.34.0
  secrets: inherit
```

Browser jobs can cache the pinned Playwright payload through the shared setup action. Production-container E2E can use the reusable workflow, while repository-specific preparation and the actual test command remain inputs:

```yaml
e2e:
  uses: richardsolomou/ras-stack/.github/workflows/check-container-browser.yml@v0.34.0
  with:
    image: my-app-e2e
    cache-scope: my-app-e2e
    prepare-command: just prepare-e2e
    command: just e2e-run
    just-version: '1.58.0'
```

The loaded image tag is also available to the command as `RAS_STACK_TEST_IMAGE`. Build and browser durations are written to the job summary, and failure artifacts remain configurable. Applications that need extra caches, services, registry publication, or a different PR/main topology can use `actions/build-container` and `actions/setup-playwright` inside their own job instead.

Production deployments can point Dokploy at the exact image that the workflow already published instead of asking Dokploy to rebuild the repository:

```yaml
- id: image
  uses: richardsolomou/ras-stack/actions/resolve-container-image@v0.36.0
  with:
    image: ghcr.io/example/application:sha-${{ github.sha }}
- uses: richardsolomou/ras-stack/actions/deploy-dokploy-image@v0.36.0
  with:
    url: ${{ secrets.DOKPLOY_URL }}
    api-key: ${{ secrets.DOKPLOY_API_KEY }}
    application-id: ${{ secrets.DOKPLOY_APPLICATION_ID }}
    image: ${{ steps.image.outputs.reference }}
```

The action switches the application to Dokploy's Docker-image provider before deploying. Public images need no registry inputs; private images supply `registry-url`, `registry-username`, and `registry-password` together. The caller owns image publication, the immutable tag or digest, application environment, domains, health verification, and deployment policy.

Preview images use the application package with a readable, commit-specific tag: `preview-pr-<number>-sha-<40-character commit>`. Resolve that tag through `actions/resolve-container-image` before deployment to retain its readable identity while pinning the exact manifest digest. On pull request close, and from a scheduled orphan sweep, `actions/prune-preview-images` removes only versions whose tags all match that preview convention; production versions are never candidates.

Straightforward single- or multi-platform releases can use `actions/publish-production-image` to publish `latest`, the release tag, and `sha-<commit>` together and receive the digest-pinned commit reference as an output. Applications retain checkout, release orchestration, generated build inputs, scanning, and deployment; complex manifest assembly can keep using Buildx directly and resolve the resulting tag separately.

Dokploy previews can share the application/domain/image/environment/deploy/health/delete/prune lifecycle through `ras-stack/preview/dokploy`. Product-specific Stripe, storage, seed, and verification work stays around the manager's configure and cleanup hooks.

Applications without custom lifecycle hooks can use `ras preview dokploy deploy`, `delete`, and `prune` directly. Applications with external resources keep using `DokployPreviewManager` so their setup and cleanup remain visible in repository-owned code.

All three commands require `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_ENVIRONMENT_ID`, `PREVIEW_APPLICATION_PREFIX`, `PREVIEW_DOMAIN`, and `PREVIEW_PORT`. `PREVIEW_HEALTH_PATH` optionally overrides the default `/api/health`; private images set `PREVIEW_REGISTRY_USERNAME` and `PREVIEW_REGISTRY_PASSWORD` together.

| Command  | Additional environment                                                                |
| -------- | ------------------------------------------------------------------------------------- |
| `deploy` | `PR_NUMBER`, `PREVIEW_IMAGE`, and the complete multiline `PREVIEW_ENVIRONMENT` string |
| `delete` | `PR_NUMBER`                                                                           |
| `prune`  | Space-separated `OPEN_PR_NUMBERS` (empty means no previews remain open)               |

Preview comments and commit checks can use the same state transition without carrying a GitHub API client in every repository:

```ts
import { reportPreviewStatus } from 'ras-stack/preview/github'

await reportPreviewStatus(
  { repository, token, marker: '<!-- app-preview -->', note: 'Preview data is disposable.' },
  { state: 'ready', prNumber, sha, previewUrl, runUrl },
)
```

The reporter keeps one marked comment and one named check run, preserves the last ready commit while a replacement builds, bounds comment pagination, and validates repository, pull request, commit, marker, and URL inputs. Applications retain their preview hostname, access note, seed credentials, and product cleanup hooks.

Trusted preview wrappers can delegate each status transition to the reusable workflow instead of checking out and running a repository-owned comment script:

```yaml
mark-preview-ready:
  permissions:
    contents: read
    checks: write
    issues: write
  uses: richardsolomou/ras-stack/.github/workflows/report-preview-status.yml@v0.34.0
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

The workflow uses `ras preview` from the consuming repository's pinned package. It owns only GitHub check/comment reporting; the caller retains the trusted event conditions, permissions, deployment, deletion, secret mapping, and product verification.

The reusable `build-preview-image.yml` workflow publishes same-repository pull requests directly but turns fork builds into one-day artifacts without exposing a token or secret. A trusted `workflow_run` job can publish that artifact with `actions/publish-preview-image` before running its repository-owned deployment command. The event wrapper and secret-to-environment mapping remain in each application so the trust boundary is visible locally.

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
FROM ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.0@sha256:5f82b2d53b93465bf91cc1bc90b292e94cbdd823cedd3f432dca94097e59163d AS runtime-binaries
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

`runtime/VERSION` and `runtime/Dockerfile` own the release and source versions. Runtime tags publish independently from npm releases so binary changes must pass the full-stack production-container gate before a `runtime-v*` tag is created.

Read-only containers can pass writable `configHome` and `dataHome` paths to `caddyRuntimeEnvironment()`; both default to isolated directories under `/tmp`.

The workflow consumes pending changesets, commits the resulting versions and changelogs, pushes the commit and tag atomically, and creates a GitHub Release. It does nothing when no versioned changeset is present. The caller owns its checks, Changesets configuration, release policy, and any deployment that follows the release.

Pin actions and reusable workflows to a release tag and let Dependabot propose upgrades.

Reusable workflows cannot refer to an action at their own dynamic release tag. Their implementations therefore pin ras-stack actions to an older independently published bootstrap tag and advance that pin only when the action contract changes. Consumer examples and direct action calls should use the current release.

The JavaScript setup action and shared check workflow reject Dependabot branches that do not contain the base commit recorded by the pull request event. Custom dependency workflows can apply the same guard directly:

```yaml
- uses: richardsolomou/ras-stack/actions/require-current-base@v0.34.0
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
    uses: richardsolomou/ras-stack/.github/workflows/check-js.yml@v0.34.0
    with:
      command: just check
      just-version: '1.58.0'
```

Simple Playwright jobs can also share browser installation and failure artifacts:

```yaml
jobs:
  end-to-end:
    uses: richardsolomou/ras-stack/.github/workflows/check-browser.yml@v0.34.0
    with:
      prepare-command: pnpm build
      command: pnpm test:e2e:run
      artifact-path: test-results
```

Callers continue to own workflow triggers, concurrency, required-job dependencies, permissions, services, caches, custom setup, and release or deployment policy. Keep jobs local when they need steps beyond these stable shapes.
