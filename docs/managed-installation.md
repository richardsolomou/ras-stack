# Installation

[Documentation](README.md) · [Configuration](configuration.md) · [Upgrades](upgrades.md)

RAS adds configured capabilities to an existing pnpm application. It does not generate routes, application entrypoints, database schemas, credentials, or product UI. This guide describes v5; use the `next` tag while reviewing the v5 prerelease.

## Prepare the application

Use Node 24 and run managed commands from the pnpm workspace root. Give the root package a unique name and pin pnpm 11 or newer in `package.json`. For example:

```json
{
  "name": "example-app",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "packageManager": "pnpm@12.13.0"
}
```

Keep existing application scripts and dependencies. RAS respects registry configuration, release-age restrictions, build approvals, and compatible repository policies. A fresh candidate may need an exact, reviewed `minimumReleaseAgeExclude` entry; see [update policies](upgrades.md#installation-policy).

## Select configured capabilities

Create `ras.config.ts` at the workspace root:

```ts
import { defineConfig, tanstackQuery, typescript, oxlint, oxfmt, vite, vitest } from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackQuery],
  tooling: [typescript.browser, oxlint.application, oxfmt, vite, vitest],
})
```

Selections are typed descriptors, not string identifiers. The [configuration catalogue](configuration.md) lists their dependencies and defaults. Only selected integrations, their included capabilities, and their transitive dependencies are installed. Plain libraries such as Zod remain application-owned.

## Run the first sync

During the v5 prerelease:

```sh
pnpm dlx ras-stack@next sync
```

For a released v5, use `pnpm dlx ras-stack@5 sync`, or replace the target with an exact release. The target CLI can load `ras.config.ts` before RAS is installed locally. It writes its own dependency and the selected packages, then runs pnpm installation. There is no separate initial `pnpm add ras-stack` step.

For later selection changes, use the installed release:

```sh
pnpm exec ras sync
```

Sync updates ordinary manifests, generated presets, and applicable policy files. It deliberately allows lockfile updates during installation. It does not rewrite handwritten `ras.config.ts`, application entrypoints, or local compiler/linter files.

## Review and commit the result

| File                                | Ownership                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `ras.config.ts`                     | Handwritten selections and explicit build approvals                                       |
| `package.json`                      | Ordinary runtime/dev dependencies; generated `ras.managedDependencies` tracks owned names |
| `pnpm-lock.yaml`                    | pnpm's complete application dependency graph                                              |
| `.ras/.gitignore`                   | Generated ownership marker; it does not ignore the presets                                |
| `.ras/tsconfig.json`                | Generated when a TypeScript preset is selected                                            |
| `.ras/oxlint.json`                  | Generated when Oxlint presets are selected                                                |
| `.ras/vscode-settings.json`         | Generated editor settings when TypeScript is selected                                     |
| `pnpm-workspace.yaml`               | Repository policy; sync adds explicitly selected build approvals                          |
| `.github/dependabot.yml` or `.yaml` | Existing update policy; sync maintains marked ignores for managed names                   |

Commit `.ras/` alongside the manifest, lockfile, configuration, and policy changes. Do not add it to `.gitignore` or `.dockerignore`. RAS refuses to take over an existing `.ras` directory without its generated marker. The editor settings file is a reference for local editor configuration, not an automatically activated VS Code workspace setting.

Runtime SDKs are written to `dependencies`; selected build/test tools and type definitions go into `devDependencies`. RAS uses optional peers to share runtime SDK instances with the application. Tooling resolves from the application, so installing RAS does not retain all of its build tools in production.

Use upstream imports normally:

```ts
import { useQuery } from '@tanstack/react-query'
import { createQueryClient } from 'ras-stack/query'
```

The RAS helper supplies configured behavior; it does not replace the upstream API. Provider placement, request data, credentials, and cache policy remain application decisions.

## Run tools and customize defaults

For the selections above:

```sh
pnpm exec ras typecheck
pnpm exec ras lint .
pnpm exec ras format --check .
pnpm exec ras test
pnpm exec ras build
```

`ras typecheck` and `ras lint` use generated configuration when no local config is present. Vite commands use the bundled default configuration when no local Vite config is present. Existing application files take precedence; extend the generated compiler/linter files and use `defineViteConfig` to compose local build settings. See [configuration](configuration.md#local-compiler-and-linter-settings).

Selections configure infrastructure, not the application's React tree or routes. The app still imports its global stylesheet. See [build configuration](configuration.md#build-configuration) and [runtime helpers](application-primitives.md) for these boundaries.

## Fresh clones and CI

Once the generated files are committed:

```sh
pnpm install --frozen-lockfile
pnpm exec ras sync --check
```

Then run the application's check/build commands. `sync --check` compares committed managed files without changing them or installing packages. Ordinary pnpm installation does not interpret changed selections; the check detects a missing sync.

No consumer install hook, generated pnpmfile, config dependency, hoisting rule, or link repair is needed. A container build must copy committed `.ras/` files before a build that reads them; normal dependency installation needs only the usual manifests, workspace policy, and lockfile.

For a production-only dependency stage:

```sh
pnpm install --prod --frozen-lockfile --ignore-scripts
```

Use `--ignore-scripts` only when the application's production dependencies do not require install scripts. Development selections are excluded, although upstream runtime dependencies may have their own tooling dependencies. Build assets before pruning development dependencies.

## Workspaces

Run sync/update from the root package that owns `ras.config.ts`, with a pinned pnpm version. Its selections belong to that package. Other workspace manifests keep their own dependencies and versions; RAS does not apply workspace-wide version overrides.

Dependabot's name-based ignores can affect matching names elsewhere in the same update rule. Read the [workspace policy boundary](upgrades.md#dependabot-and-security-updates) before choosing independent update policies.
