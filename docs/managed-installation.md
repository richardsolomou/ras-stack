# Managed installation

RAS can own the upstream dependency versions used by an application, alongside its compiler and linter. Applications choose integrations through typed descriptors from `ras-stack/config`. Unselected integrations are not added to the dependency graph. Applications still use the upstream APIs and original imports.

Managed installation is the supported installation model from RAS 5 onward. Direct peer installation and the separate `ras-stack-config` package are retired. Presets ship inside `ras-stack` and version with its integration catalogue.

## Select integrations and tools

Create `ras.config.ts`:

```ts
import { defineConfig, tanstackQuery, typescript, oxlint, vite, vitest } from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackQuery],
  tooling: [typescript.browser, oxlint.application, vite, vitest],
})
```

Declare RAS once in `pnpm-workspace.yaml` (requires pnpm 12.12 or newer):

```yaml
configDependencies:
  ras-stack: ^5.0.0
pnpmfile: node_modules/.pnpm-config/ras-stack/pnpmfile.cjs
```

Run the ordinary package manager command:

```sh
pnpm install
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

pnpm installs the RAS config dependency before resolving regular dependencies. RAS reads the typed selections using that release's configuration API, adds its own matching runtime version and the selected dependencies to the named root package, and adds the same selected dependencies to RAS. Native pnpm resolution supplies ordinary upstream imports and a shared React instance. Other workspace packages retain their own versions. RAS adds no hoisting rules, global overrides, custom import links, installer subprocess, or second lockfile.

The hook ships inside RAS. There is no generated consumer `.pnpmfile.cjs`, formatter exclusion, or `.prettierignore`. `pnpm-lock.yaml` records the config dependency's version and integrity in its boot document, followed by the complete application dependency graph. A clean frozen install restores both.

Commit `ras.config.ts`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`. Ignore `.ras/`, which contains generated compiler, linter, Vite, and editor configuration. The configuration hook creates it during ordinary installs before application scripts run. RAS does not add install lifecycle scripts to applications.

After changing selections, run `pnpm install`. A frozen install rejects dependency graph changes that have not been resolved and committed. pnpm owns installation, resolution, concurrency, failure reporting, and retries. Correct an installation failure and rerun the same pnpm command.

Run from the workspace root that owns the configuration dependency and lockfile. The root package needs a unique name. RAS rejects duplicate ownership of itself or selected packages in application manifests and refuses to overwrite a consumer-owned `.ras` directory. A custom pnpm hook must be composed explicitly with the shipped hook; this configuration dedicates the `pnpmfile` setting to RAS.

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

pnpm generates local configuration during installation. RAS tool commands verify their installed versions and regenerate missing local configuration without installing packages or changing tracked files. For VS Code, the generated `.ras/vscode-settings.json` shows the workspace TypeScript setting; the selected TypeScript is available at the normal `node_modules/typescript/lib` path.

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

Remove `ras-stack` and managed packages from the application's `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`; RAS rejects duplicate ownership. Keep packages that RAS does not manage. Select the integrations and tools in `ras.config.ts`, declare RAS under `configDependencies`, point `pnpmfile` at its shipped hook, and run `pnpm install`. Remove the previously generated `.pnpmfile.cjs` and its formatter exclusion.

Changing to the catalogue can upgrade upstream APIs; make any required application changes and test them as part of migration. Selections affect the root application and RAS; other workspace packages keep their own dependencies.

Point the application compiler/linter files at `.ras` if adopting managed presets, and replace tool scripts with the corresponding RAS commands where useful. Existing scripts and upstream imports can continue using the publicly available package names.

The configuration hook does not publish a new RAS release or change other repositories. Test a packed candidate and verify the consuming application's build, tests, and runtime flows before releasing or migrating it.

## CI and upgrades

A clean CI job uses ordinary pnpm commands:

```sh
pnpm install --frozen-lockfile
pnpm check
```

Update RAS and its managed graph together:

```sh
pnpm update ras-stack
pnpm install
```

Use `pnpm update ras-stack --latest` for a new major version. pnpm updates the config dependency separately; the following install applies its selected application graph. Commit the resulting `pnpm-workspace.yaml` and `pnpm-lock.yaml` changes. There is one RAS version declaration, with no custom install/update command and no regeneration workflow.

Config dependencies must come from an npm registry; Git URLs and local tarball specifiers are unsupported. Test unpublished candidates through a local registry fixture. Consumer PRs require a published RAS candidate before their committed configuration can produce a valid frozen lockfile.

Dependabot currently reads application manifests and pnpm catalogs, but does not update `configDependencies`. Handle RAS upgrade PRs separately using the native command above. Limit consumer Dependabot updates to manifest-owned packages:

```yaml
allow:
  - dependency-type: direct
```

This excludes standalone updates to RAS-managed packages, including lockfile-only security updates. Dependencies added by a pnpm hook have no manifest requirements and are indirect to Dependabot. Application-owned dependency updates can still change their transitive graph in the shared lockfile. If an application explicitly owns the same library elsewhere in its workspace, that declaration remains eligible for updates.

The dependency graph and vulnerability alerts remain visible. Security fixes for managed packages require an appropriate RAS release and consumer upgrade; pinning tested versions does not make them immune to vulnerabilities. `ras audit` checks the installed graph through pnpm. Keep the shared catalogue and dependency-update policy in the RAS repository, and consumer policy in each application.
