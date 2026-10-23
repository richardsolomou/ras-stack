# Upgrades and dependency ownership

[Documentation](README.md) · [Installation](managed-installation.md) · [Configuration](configuration.md)

RAS owns exact direct versions and configuration for selected capabilities. pnpm owns installation, resolution, integrity, authentication, and the lockfile. Application manifests contain application-owned packages only.

## Change selections

Edit `ras.config.ts`, then run:

```sh
pnpm exec ras sync
```

Sync refreshes managed bot policy and invokes native installation. A plain `pnpm install` also applies selections and regenerates local presets; refresh bot policy with sync when the managed package names change. Review the lockfile and policy diff, then run application checks. `.ras/` is local generated state and is not committed.

The shipped hook disables pnpm's `optimisticRepeatInstall` shortcut because a change to the external typed configuration must be evaluated even when `package.json` is unchanged. Unchanged installations reuse the lockfile; this does not force transitive dependency upgrades.

## Upgrade the stack

```sh
pnpm exec ras update
```

The default target is `latest`. Choose another release explicitly:

```sh
pnpm exec ras update next
```

The CLI delegates to `pnpm dlx ras-stack@<target> sync --upgrade`. The selected release updates the single RAS declaration under `configDependencies`, refreshes policy, and runs `pnpm install --no-frozen-lockfile`. pnpm loads that release's hook before resolving the new application graph. One user command applies the complete upgrade, including under CI. Review the workspace/lockfile diff and run application checks before merging.

pnpm 12.12+ can update configuration dependencies directly. Prefer `ras update` for a coordinated change because native config-dependency updates can require a subsequent install to apply the new hook's graph. Fresh clones and CI use native frozen installs.

## Automated upgrade pull requests

Opt in with `.github/workflows/update-ras.yml` in the application repository:

```yaml
name: Update RAS

on:
  schedule:
    - cron: '23 8 * * 1'
  workflow_dispatch:

jobs:
  update:
    permissions:
      contents: write
      pull-requests: write
    uses: richardsolomou/ras-stack/.github/workflows/update-stack.yml@v1
```

The shared workflow checks out the application's default branch, installs its pinned toolchain and frozen dependencies, runs `ras update`, and verifies the result with `ras sync --check`. It maintains one `chore/ras-stack-update` PR, updates that PR when another release is available, and creates nothing when the graph is unchanged. The PR contains only the workspace settings, lockfile, and managed Dependabot policy. Normal repository CI validates application behavior; upgrades are not merged automatically.

The caller owns the schedule and permissions. An optional `target` input selects a version or tag; it defaults to `latest`. The workflow honors the repository's release-age, registry, and build policies. A release blocked by policy must age or receive an intentional repository-owned exception; the updater does not bypass the policy.

Enable **Allow GitHub Actions to create and approve pull requests** in the repository's Actions settings. The built-in `GITHUB_TOKEN` is sufficient to open update PRs, but [GitHub requires maintainer approval before bot-created PR workflows run](https://github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved/). To start PR CI without that approval, pass an optional `UPGRADE_TOKEN` secret containing a fine-grained PAT or GitHub App token with contents and pull-requests write access. Keep that credential in the consumer repository. The workflow uses the maintained [create-pull-request action](https://github.com/peter-evans/create-pull-request) for branch and PR management.

## Opt out or transfer ownership

Remove a selection and install again. pnpm removes packages no remaining selection or application-owned declaration needs. No ownership inventory or dependency versions are stored in `package.json`.

To keep a package while taking responsibility for its version and configuration, remove the selecting descriptor and add the package to the appropriate ordinary dependency group. A selected package cannot also be declared there; the hook rejects duplicate ownership rather than choosing a version silently.

RAS uses one package version for boot configuration and its application runtime. Runtime SDKs are optional peers, so selected libraries share application instances. Build/test packages are injected only as application development dependencies; RAS does not turn them into production dependencies.

The consumer lockfile pins resolved transitives. Application-owned upgrades may move shared transitives; RAS does not impose a universal transitive snapshot.

## Installation policy

The hook preserves existing registry routing, release-age restrictions, integrity policy, and build approvals. `allowBuilds` in the typed selection can add an explicit approval. Conflicting direct overrides or explicit build denials are errors. Version-scoped and matching parent-scoped overrides are checked before installation; selectors for other workspace packages or nonmatching versions remain application-owned. RAS does not blanket-approve transitive scripts.

Configuration dependencies are installed before hooks, so any reviewed release-age exception for RAS itself belongs in `pnpm-workspace.yaml`:

```yaml
minimumReleaseAge: 10080
minimumReleaseAgeExclude:
  - ras-stack@5.0.0
```

Use the version actually reviewed and retain unrelated policy. Moving between fresh releases can require retaining the old exact exception until the old boot/application entries have been pruned. RAS does not disable the repository's gate to install itself.

## Dependabot and security updates

For existing npm update rules covering `/`, `ras sync` maintains ignored names for RAS and selected packages. Generated entries carry `Managed by RAS.` comments; handwritten rules, schedules, groups, and other ecosystems remain intact. Repositories without Dependabot are left alone.

Handle RAS upgrades through the CLI or separate automation; consumer Dependabot is not the RAS config-dependency updater. Managed direct versions are fixed by the release's hook even though the lockfile records their complete graph. Vulnerability alerts remain visible, and managed security fixes need a RAS upgrade or an intentional transfer to application ownership.

Ignores apply across the matching rule, including the same names in other workspace manifests. Choose update-rule boundaries deliberately when those packages need independent bot upgrades. Application-owned changes can still move shared transitive versions in the lockfile.

## Prerelease candidates

Stable installations use `ras-stack@5` or `latest`. To evaluate a future candidate, use its exact prerelease version or the `next` tag after checking which version it selects: `pnpm dlx ras-stack@<candidate> sync` or `pnpm exec ras update <candidate>`. The v5 `next.1` and `next.2` candidates use an unsupported ordinary-manifest installation model; use stable v5 for the hook implementation described here.

Configuration dependencies must come from a registry. Git URLs and local archive specifiers cannot bootstrap this model. Test a packed candidate through a local registry fixture before publishing that same archive. The hook bundles its selector-parsing dependencies and keeps only Node builtins as external imports, because pnpm does not install a config dependency's regular dependencies during boot.

Candidate pins and stable-release merge requirements belong in migration PR descriptions. Permanent consumer docs link here rather than duplicating the rollout instructions.

## Migrate from v4

1. Remove `ras-stack-config`, `ras-stack`, and the selected managed packages from ordinary dependency groups. Remove abandoned RAS ownership metadata if present. Preserve application-owned libraries.
2. Create root `ras.config.ts` selections using the [catalogue](configuration.md). Use pnpm 12.12 or newer and a unique root package name.
3. Bootstrap with the target release's sync command. Commit its workspace configuration, lockfile, and applicable bot policy changes.
4. Point local compiler/linter inheritance at `.ras/tsconfig.json` and `.ras/oxlint.json`, retaining local includes, aliases, rules, and exceptions.
5. Stop tracking generated `.ras` files. Let the hook rebuild them during installation. Copy typed selections before installing container dependencies.
6. Compose Vite overrides with `defineViteConfig` if managed presets should apply. Remove duplicate plugins/stylesheet imports, retaining product-specific plugins and runtime/provider composition.
7. Keep a frozen native CI install and `ras sync --check`. Check upstream API compatibility, builds, tests, production pruning, and affected runtime flows before merging.

The in-repository full-stack fixture uses `workspace:*` and maintains direct development dependencies. Packed-package checks exercise the external hook installation contract; the fixture is not a generated managed consumer.

## Troubleshooting

| Symptom                                                   | Action                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Run ras sync; managed files are out of date`             | Refresh hook wiring and bot policy with the installed release's sync command                         |
| A managed package is already declared                     | Remove duplicate manifest ownership, or deselect it and keep it application-owned                    |
| Selected package is not installed at the expected version | Run native installation or the complete target-release upgrade                                       |
| Release-age or build-policy rejection                     | Review the rejected version and policy, then retry after an intentional change or the release ages   |
| Frozen installation rejects the graph                     | Install locally after changing selections and commit the resulting lockfile                          |
| Conflicting override or denied build                      | Reconcile the explicit policy with the selected release                                              |
| `.ras` is treated as consumer-owned                       | Inspect its contents and ownership marker before replacing anything; preserve application-owned data |
| Existing custom pnpmfile                                  | Resolve hook ownership explicitly; RAS does not overwrite another hook                               |

Installation failures leave the workspace configuration reviewable. Correct the cause and rerun the same command. For a failed upgrade, use the same target release so the config dependency and application graph converge. Avoid concurrent sync/update commands in a checkout. pnpm may regenerate ignored local presets before running a tool or check; the RAS check itself does not install or modify tracked files.
