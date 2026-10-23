# Installation

[Documentation](README.md) · [Configuration](configuration.md) · [Upgrades](upgrades.md)

RAS adds configured capabilities to an existing pnpm application. Selected packages remain available through their upstream imports without being declared in the application's physical `package.json`. Routes, providers, schemas, credentials, and product behavior remain local.

## Prepare the application

Use Node 24 and pin pnpm 12.12 or newer. Run managed commands from the pnpm workspace root and give that root package a unique name:

```json
{
  "name": "example-app",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "packageManager": "pnpm@12.13.0"
}
```

Keep application-owned dependencies and scripts. Remove RAS and selected managed packages from all ordinary dependency groups before enabling the hook; duplicate ownership is an error. Plain libraries such as Zod remain application-owned.

## Select configured capabilities

Create `ras.config.ts` at the workspace root:

```ts
import { defineConfig, tanstackQuery, typescript, oxlint, oxfmt, vite, vitest } from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackQuery],
  tooling: [typescript, oxlint, oxfmt, vite, vitest],
})
```

Selections are typed descriptors. The [configuration catalogue](configuration.md) lists their included packages and defaults. Only selected capabilities and their dependencies enter the application graph.

## Run the first sync

```sh
pnpm dlx ras-stack@5 sync
```

Use `ras-stack@5` for the latest v5 release, or select an exact version. The target CLI can load selections before RAS is installed locally. It adds the configuration dependency and shipped hook to `pnpm-workspace.yaml`, maintains existing Dependabot policy, and runs pnpm installation with lockfile updates allowed. It does not write dependencies or RAS metadata into `package.json`.

The resulting workspace settings look like this, alongside the application's existing policy:

```yaml
configDependencies:
  ras-stack: 5.0.0
pnpmfile: node_modules/.pnpm-config/ras-stack/pnpmfile.mjs
```

The version is the selected RAS release. This configuration can also be written directly before running `pnpm install`. RAS reserves the `pnpmfile` setting for its shipped hook and refuses to replace an existing custom hook silently.

pnpm installs [configuration dependencies](https://pnpm.io/config-dependencies) before resolving the application. RAS reads `ras.config.ts` and uses the native [readPackage hook](https://pnpm.io/pnpmfile#hooksreadpackagepkg-context-pkg--promisepkg) to add exact runtime and development selections to the application's manifest in memory. pnpm creates ordinary package links and records the complete graph in its lockfile. RAS's optional peers share the application's runtime instances; tools are not attached to RAS's runtime dependency graph.

## Files and ownership

| File                                | Ownership                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `ras.config.ts`                     | Handwritten selections and explicit build approvals                                  |
| `package.json`                      | Application-owned dependencies, scripts, and package metadata only                   |
| `pnpm-workspace.yaml`               | RAS config dependency, shipped hook location, and repository policy                  |
| `pnpm-lock.yaml`                    | Boot configuration dependency version/integrity and the application dependency graph |
| `.ras/`                             | Generated, ignored local compiler/linter/editor configuration                        |
| `.github/dependabot.yml` or `.yaml` | Existing policy; `ras sync` maintains marked managed-name ignores                    |

Commit the selections, workspace settings, lockfile, and any policy changes. `.ras/.gitignore` ignores the generated directory, including itself. Do not commit `.ras` presets or create a consumer pnpmfile, lifecycle installer, formatter exclusion, or second lockfile. The hook regenerates local presets during normal pnpm commands. It rejects an existing `.ras` directory without the generated ownership marker.

Runtime SDKs enter the application's in-memory `dependencies`; tools and types enter `devDependencies`. Original upstream imports work normally:

```ts
import { useQuery } from '@tanstack/react-query'
import { createQueryClient } from 'ras-stack/query'
```

## Run tools and customize defaults

For the selections above:

```sh
pnpm exec ras typecheck
pnpm exec ras lint .
pnpm exec ras format --check .
pnpm exec ras test
pnpm exec ras build
```

The compiler and linter use generated configuration when there is no local config. Vite uses the bundled config when there is no local Vite config. Existing application files take precedence; extend `.ras/tsconfig.json` and `.ras/oxlint.json`, and compose Vite settings with `defineViteConfig`. See [configuration](configuration.md#local-compiler-and-linter-settings).

The editor settings file is a reference for choosing the normally installed TypeScript SDK, rather than an automatically activated VS Code workspace setting. Applications still place providers, import their global stylesheet, and own credentials and product policy.

## Fresh clones and CI

Use native installation:

```sh
pnpm install --frozen-lockfile
pnpm exec ras sync --check
```

The hook prepares ignored local presets. `ras sync --check` verifies hook wiring, applicable bot policy, and selected installed versions without changing tracked files or installing packages. A changed selection that requires another dependency graph must be installed locally and committed with its new lockfile before a frozen CI install can succeed.

After editing selections, use `pnpm install`. Use `ras sync` when managed bot ignores also need refreshing. Both let pnpm resolve and prune the graph; [upgrades](upgrades.md#change-selections) explains the review steps.

For container dependency stages, copy `ras.config.ts` and any local modules it imports alongside the manifest, workspace configuration, and lockfile before installing. `.ras` is generated by the hook and does not need copying from the checkout.

A production dependency stage can use:

```sh
pnpm install --prod --frozen-lockfile --ignore-scripts
```

Development selections are excluded from both application links and the physical application package store. `--ignore-scripts` does not disable pnpm configuration hooks. Use it only when runtime dependencies do not need install scripts, and build assets before pruning development dependencies.

## Workspaces

The root package owns `ras.config.ts` and the config dependency. RAS adds selections only to that root's in-memory manifest. Other workspace manifests keep their own versions; there are no workspace-wide version overrides or custom hoisting rules.

Dependabot's marked name-based ignores can affect matching names elsewhere in the same update rule. Read the [workspace policy boundary](upgrades.md#dependabot-and-security-updates) when workspace packages need independent bot updates.
