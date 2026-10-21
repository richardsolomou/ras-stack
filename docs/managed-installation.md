# Managed installation

RAS can own the upstream dependency versions used by an application, alongside its compiler and linter. Applications choose integrations through typed descriptors from `ras-stack/config`. Unselected integrations are not added to the dependency graph. Applications still use the upstream APIs and original imports.

Managed installation is the supported installation model from RAS 5 onward. Direct peer installation and the separate `ras-stack-config` package are retired. Presets ship inside `ras-stack` and version with its integration catalogue.

## Select integrations and tools

Install `ras-stack`, then create `ras.config.ts`:

```ts
import { defineConfig, tanstackQuery, typescript, oxlint, vite, vitest } from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackQuery],
  tooling: [typescript.browser, oxlint.application, vite, vitest],
})
```

Run:

```sh
pnpm exec ras install
```

Query includes its shared React/React DOM versions and types. Other integrations are installed only when selected or required by a selection. Dependencies required by a selected integration are installed normally, including their platform-specific optional dependencies.

Use original imports:

```ts
import { QueryClient, useQuery } from '@tanstack/react-query'
```

The built-in integrations are `tanstackQuery`, `tanstackStart`, `betterAuth`, `sqlite`, `postgres`, `libsql`, `email`, `uploads`, `realtime`, and `posthog.browser`, `posthog.react`, and `posthog.server`. The catalogue records exact tested versions in the RAS release. Conflicting version selections fail before installation.

The tool selections are `typescript.base`, `typescript.bundler`, `typescript.browser`, `typescript.library`, `typescript.tanstack`, `oxlint.base`, `oxlint.application`, `oxlint.tanstack`, `oxlint.domain`, `oxlint.layers`, `oxfmt`, `vite`, `vitest`, `playwright`, `tailwind`, `tailwind.animations`, `nitro`, and `posthog.build`. Choose one TypeScript preset. Oxlint presets compose, for example `[oxlint.application, oxlint.tanstack, oxlint.domain]`.

RAS owns configured capabilities. Plain libraries such as Zod, icon libraries, class utilities, compression libraries, and the SpacetimeDB SDK remain dependencies of the application. React is included by the configured frontend integrations. A custom descriptor that only moves those version strings into another file does not provide an integration.

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

## Query runtime

`tanstackQuery` supplies `createQueryClient` and `QueryProvider` from `ras-stack/query`. The factory creates an independent cache on every call and keeps hydrated queries fresh for one minute by default. Native `QueryClientConfig` overrides compose with that default, including application mutation caches and query policies.

```tsx
import { QueryProvider } from 'ras-stack/query'

export function App() {
  return <QueryProvider>{/* Application routes or components. */}</QueryProvider>
}
```

The provider owns a stable client for its mounted lifetime and accepts an existing `client` or dehydrated `state`. Applications still choose their React composition point, request data, credentials, and product-specific settings. Selecting a runtime integration supplies its configured API; installation does not rewrite application entrypoints. TanStack Start applications can use `createQueryClient` with their existing router SSR integration instead of mounting another provider.

## Installation and locking

RAS uses pnpm's documented `readPackage` hook to declare selected dependencies on the named consuming package and on `ras-stack`. pnpm installs and links those ordinary dependencies; RAS does not hoist packages, repair links, or introduce version overrides. Other workspace packages retain their own versions. The app and RAS share the selected React instance through native resolution.

`pnpm-lock.yaml` is the only lockfile. Its importer records selected packages and their full dependency graph. The generated hook's checksum ties a frozen install to its exact installation inputs. `ras prepare` validates the hook against `ras.config.ts`, verifies installed versions, and regenerates tooling files. There is no separate selection lockfile or preparation cache.

Commit these files:

- `ras.config.ts`: the selections and explicit build approvals.
- `.pnpmfile.cjs`: the generated, self-contained pnpm hook, usable before RAS is installed on a fresh machine.
- `pnpm-lock.yaml`: pnpm's standard lockfile with integrity hashes for the full dependency graph.

Ignore `.ras/` and `.ras-install.lock/`. `.ras` contains generated compiler/linter and Vite configuration. It does not contain another dependency installation.

Add `"/.pnpmfile.cjs"` to `ignorePatterns` in your Oxfmt configuration. pnpm checksums the generated hook's exact bytes, so formatters must leave it unchanged. Formatter configuration stays application-owned; RAS does not create or modify `.prettierignore`.

`ras install --frozen-lockfile` rejects a changed selection hook or missing lockfile, then runs pnpm with a frozen lockfile. `ras install` regenerates the hook and lets pnpm update its lockfile. Installations are serialized by `.ras-install.lock`; a stopped process can leave the guard behind, so remove it only after confirming the installer has stopped.

Failed installs leave the requested hook in place and report pnpm's failure. Correct the selection or installation problem and rerun `ras install`. RAS does not attempt a second offline install or claim transactional rollback. Use `ras install --update` to force pnpm to rebuild an incomplete installation.

RAS refuses to overwrite a consumer-owned pnpm hook and rejects a `.pnpmfile.mjs` that would take precedence over its hook. This mode currently requires exclusive ownership of `.pnpmfile.cjs`; projects must migrate their custom hooks before adopting RAS 5. Run managed commands from the package/workspace root that owns the pnpm lockfile and declares `ras-stack`.

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

`ras prepare` verifies the installed versions and regenerates local configuration without installing packages or changing tracked files. Tool commands also prepare missing local configuration. For VS Code, the generated `.ras/vscode-settings.json` shows the workspace TypeScript setting; the selected TypeScript is available at the normal `node_modules/typescript/lib` path.

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

Changing to the catalogue can upgrade upstream APIs; make any required application changes and test them as part of migration. Selections affect the root application and RAS; other workspace packages keep their own dependencies.

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

Dependabot continues updating RAS and application-owned dependencies. Managed libraries remain ordinary entries in the standard pnpm lockfile, preserving dependency-graph and vulnerability visibility. Security fixes still require an appropriate RAS upgrade; pinning a tested version set does not make it immune to vulnerabilities. `ras audit` checks the installed graph through pnpm.
