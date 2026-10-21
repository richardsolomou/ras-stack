# Managed installation

RAS can own the upstream dependency versions used by an application, alongside its compiler and linter. Applications choose integrations through typed descriptors from `ras-stack/config`. Unselected integrations are not added to the dependency graph. Applications still use the upstream APIs and original imports.

Managed installation is the supported installation model from RAS 5 onward. Direct peer installation and the separate `ras-stack-config` package are retired. Presets ship inside `ras-stack` and version with its integration catalogue.

## Select integrations and tools

Install `ras-stack`, then create `ras.config.ts`:

```ts
import { defineConfig, tanstackQuery, spacetimeDB, typescript, oxlint, vite, vitest } from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackQuery, spacetimeDB],
  tooling: [typescript.browser, oxlint.application, vite, vitest],
})
```

Run:

```sh
pnpm exec ras install
```

Query includes its shared React/React DOM versions and types. SpacetimeDB is installed only when selected, or when another selected integration requires it. Dependencies required by a selected integration are installed normally, including their platform-specific optional dependencies.

Use original imports:

```ts
import { QueryClient, useQuery } from '@tanstack/react-query'
import { Identity } from 'spacetimedb'
```

The built-in integrations are `react`, `tanstackQuery`, `tanstackStart`, `spacetimeDB`, `betterAuth`, `sqlite`, `postgres`, `libsql`, `email`, `uploads`, `realtime`, and `posthog.browser`, `posthog.react`, and `posthog.server`. The catalogue records exact tested versions in the RAS release. Conflicting version selections fail before installation.

The tool selections are `typescript.base`, `typescript.bundler`, `typescript.browser`, `typescript.library`, `typescript.tanstack`, `oxlint.base`, `oxlint.application`, `oxlint.tanstack`, `oxlint.domain`, `oxlint.layers`, `oxfmt`, `vite`, `vitest`, `playwright`, `tailwind`, `tailwind.animations`, `nitro`, and `posthog.build`. Choose one TypeScript preset. Oxlint presets compose, for example `[oxlint.application, oxlint.tanstack, oxlint.domain]`.

RAS owns configured capabilities. Plain libraries such as Zod, icon libraries, class utilities, and compression libraries remain dependencies of the application. A custom descriptor that only moves those version strings into another file does not provide an integration.

## Configured builds

Selecting `vite` configures React compilation and the `@` alias for `src/`. Selecting `tanstackStart`, `nitro`, `tailwind`, or `posthog.build` adds their build configuration automatically. `ras dev` and `ras build` use a generated Vite configuration when the application has no Vite config file.

Tailwind processes the application's global stylesheet at `src/styles.css`. Keep application styles and theme declarations there; RAS supplies the Tailwind import. `tailwind.animations` also supplies the animation stylesheet import. The app still imports its global stylesheet as part of its application entrypoint.

For application-specific settings, use the shared config factory:

```ts
import { defineViteConfig } from 'ras-stack/vite'

export default defineViteConfig({
  assetsInclude: ['**/*.woff'],
  ras: {
    stylesheet: 'src/styles.css',
    nitro: { routeRules: { '/health': { headers: { 'Cache-Control': 'no-store' } } } },
  },
})
```

The factory also accepts an async Vite config callback. Application plugins and settings compose with the selected presets. `ras.start` and `ras.nitro` accept upstream plugin options; `ras.stylesheet` changes the global stylesheet path.

`posthog.build` instruments client and worker builds. Uploads activate in CI when `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID` are set, or explicitly with `POSTHOG_UPLOAD_SOURCEMAPS=true`. The `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID`, and `POSTHOG_CLI_HOST` aliases are supported. `POSTHOG_UPLOAD_SOURCEMAPS=false` disables automatic uploads. Enabled uploads require credentials, emit hidden source maps, and delete uploaded maps. Set `ras.posthog` for application-specific release metadata or an explicit `enabled` override.

For a custom configured build tool:

```ts
import { defineIntegration } from 'ras-stack/config'

export const bundledLibrary = defineIntegration({
  name: 'bundled-library',
  packages: { esbuild: '0.28.2' },
  commands: {
    build: { package: 'esbuild', bin: 'esbuild', args: ['src/index.ts', '--bundle', '--outdir=dist'] },
  },
})
```

Select this descriptor in the configuration. Dependency versions must be exact versions rather than ranges, tags, paths, or Git URLs. Custom descriptors belong in the consuming repository; shared RAS code does not contain consumer inventories.

## Installation and locking

RAS uses pnpm's `readPackage` hook to attach the selected dependencies to `ras-stack` during installation. The hook also pins those versions throughout the graph and publicly hoists the selected package names. Application code, generated bindings, Node, TypeScript, and bundlers therefore use ordinary package resolution. There is one dependency graph, including one selected React instance, rather than a separate hidden installation.

Commit these files:

- `ras.config.ts`: the selections and explicit build approvals.
- `ras.lock`: the resolved selection and tooling contract.
- `.pnpmfile.cjs`: the generated, self-contained pnpm hook, usable before RAS is installed on a fresh machine.
- `pnpm-lock.yaml`: pnpm's standard lockfile with integrity hashes for the full dependency graph.

Ignore `.ras/`, `.ras-*/`, and `.ras-install.lock/`. `.ras` contains generated compiler/linter configuration and local preparation state. It does not contain another dependency installation.

Add `"/.pnpmfile.cjs"` to `ignorePatterns` in your Oxfmt configuration. pnpm checksums the generated hook's exact bytes, so formatters must leave it unchanged. Formatter configuration stays application-owned; RAS does not create or modify `.prettierignore`.

`ras install --frozen-lockfile` rejects changed selections and missing or stale generated lockfiles. It runs pnpm with a frozen lockfile. `ras install` updates the selected graph and generated files. Installations are serialized by `.ras-install.lock`; a failed installation restores the previous tracked files and attempts an offline restoration of the previous installation. A stopped process can leave the guard directory behind; remove it only after confirming the installer has stopped.

RAS refuses to overwrite a consumer-owned pnpm hook and rejects a `.pnpmfile.mjs` that would take precedence over its hook. This mode currently requires exclusive ownership of `.pnpmfile.cjs`; projects with custom hooks must retain their existing installation mode. Run managed commands from the package/workspace root that owns the pnpm lockfile and declares `ras-stack`.

## Compiler, linter, and commands

An application `tsconfig.json` can retain its own paths, includes, and exceptions:

```json
{
  "extends": "./.ras/tsconfig.json",
  "include": ["src"],
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

An application `.oxlintrc.json` can extend `./.ras/oxlint.json` and retain local rules, ignores, and overrides. RAS does not replace either application-owned file. The generated presets extend the configuration bundled in the installed `ras-stack` release. No separate configuration package is installed.

Commands use the selected package's executable and run in the consuming directory:

| Command                             | Tool                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| `ras typecheck`                     | Selected TypeScript, with `--noEmit`                        |
| `ras lint`                          | Selected Oxlint, with type-aware checks and denied warnings |
| `ras format`                        | Selected Oxfmt, with `--write`; `--check` selects checking  |
| `ras dev` / `ras build`             | Selected Vite                                               |
| `ras test`                          | Selected Vitest, with `run`                                 |
| `ras e2e`                           | Selected Playwright, with `test`                            |
| `ras exec -- <program> [arguments]` | A command with the consumer binary directory on `PATH`      |
| `ras audit`                         | Native pnpm audit of the full lockfile                      |

Arguments are forwarded without shell evaluation. An unselected tool is an error rather than a fallback to an unrelated global installation. For application-specific build pipelines, keep the pipeline in the application's scripts and use the managed executables where appropriate.

`ras prepare` repairs managed import links, verifies the installed versions, and regenerates local configuration without installing packages or changing tracked files. Tool commands also prepare missing local configuration. For VS Code, the generated `.ras/vscode-settings.json` shows the workspace TypeScript setting; the selected TypeScript is available at the normal `node_modules/typescript/lib` path.

## Build scripts and supply-chain policy

RAS preserves the consumer's pnpm registry, release-age policy, integrity checks, and existing build approvals. Managed packages default to denied build scripts unless the consumer's existing policy approves them. Explicitly approve a selected native dependency when needed:

```ts
import { defineConfig, sqlite } from 'ras-stack/config'

export default defineConfig({
  integrations: [sqlite],
  allowBuilds: ['better-sqlite3'],
})
```

An explicit consumer denial or conflicting version override is an error. Approvals for unrelated application packages remain in the consumer's pnpm configuration. RAS does not suppress pnpm errors for unreviewed transitive build scripts.

## Migrate from RAS 4

Remove `ras-stack-config` from the manifest and replace its TypeScript and Oxlint inheritance paths with `./.ras/tsconfig.json` and `./.ras/oxlint.json`. Choose the corresponding typed presets in `ras.config.ts`. Configuration-only repositories also install `ras-stack` and select their tools through this file.

Remove managed packages from the application's `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`; RAS rejects duplicate ownership. Keep packages that RAS does not manage. Select the integrations and tools in `ras.config.ts`, then run `ras install`.

Changing to the catalogue can upgrade upstream APIs; make any required application changes and test them as part of migration. Workspace-wide pins also apply to other workspace packages.

Point the application compiler/linter files at `.ras` if adopting managed presets, and replace tool scripts with the corresponding RAS commands where useful. Existing scripts and upstream imports can continue using the publicly available package names.

The installer does not publish a new RAS release or change other repositories. Test a packed candidate and verify the consuming application's build, tests, and runtime flows before releasing or migrating it.

## CI and upgrades

A clean CI job runs:

```sh
pnpm install --frozen-lockfile
pnpm exec ras prepare
pnpm check
```

The shared `setup-js` action prepares RAS automatically when `ras.config.ts` exists. The generated hook and pnpm lockfile are committed, so the initial install already knows the selected packages.

When updating RAS, run `ras install` after upgrading its package version and commit the resulting lockfile/hook changes with that upgrade. CI rejects a selection contract from an older incompatible RAS catalogue. No separate routine direct dependency updates are required for the managed libraries.

Dependabot continues updating RAS and application-owned dependencies. Managed libraries remain transitive entries in the standard pnpm lockfile, preserving dependency-graph and vulnerability visibility. Security fixes still require an appropriate RAS upgrade; pinning a tested version set does not make it immune to vulnerabilities. `ras audit` checks the installed graph through pnpm.
