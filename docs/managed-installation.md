# Managed installation

RAS owns the versions and configuration of selected integrations. Applications select typed descriptors in `ras.config.ts`, while pnpm installs ordinary dependencies from `package.json` and `pnpm-lock.yaml`. Unselected integrations are not installed. Plain libraries such as Zod and the SpacetimeDB SDK remain application-owned.

RAS 5 includes compiler and linter presets in the main package. The separate `ras-stack-config` package is retired.

## Select integrations and tools

Create `ras.config.ts`:

```ts
import { defineConfig, tanstackQuery, typescript, oxlint, vite, vitest } from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackQuery],
  tooling: [typescript.browser, oxlint.application, vite, vitest],
})
```

Use Node 24 and pin pnpm 11 or newer in `package.json`'s `packageManager` field. Bootstrap with the RAS version you want:

```sh
pnpm dlx ras-stack@5 sync
```

If RAS is already installed, run `pnpm exec ras sync`. RAS writes exact selected versions into the application's ordinary `dependencies` and `devDependencies`, generates configuration in `.ras/`, and runs `pnpm install`. Runtime integrations and development tools are classified individually, including type definitions. Dependencies required by an integration install normally.

Keep original imports such as `@tanstack/react-query`. Query includes React and React DOM, with their types as development dependencies. Application-specific configuration, credentials, routes, React composition points, and cache policies remain local.

The runtime integrations are `tanstackQuery`, `tanstackStart`, `betterAuth`, `sqlite`, `postgres`, `libsql`, `email`, `uploads`, `realtime`, and `posthog.browser`, `posthog.react`, and `posthog.server`.

Tool selections include `typescript.base`, `typescript.bundler`, `typescript.browser`, `typescript.library`, `typescript.tanstack`, `oxlint.base`, `oxlint.application`, `oxlint.tanstack`, `oxlint.domain`, `oxlint.layers`, `oxfmt`, `vite`, `vitest`, `playwright`, `tailwind`, `tailwind.animations`, `nitro`, and `posthog.build`. Select one TypeScript preset; Oxlint presets compose.

## Configured builds

Selecting `vite` configures React compilation and the `@` alias for `src/`. Selecting `tanstackStart`, `nitro`, `tailwind`, or `posthog.build` adds their build configuration automatically. `ras dev` and `ras build` use the bundled default Vite configuration when the application has no Vite config file.

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
  devPackages: { esbuild: '0.28.2' },
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

## Ordinary manifests and committed configuration

Commit `ras.config.ts`, `package.json`, `pnpm-lock.yaml`, generated `.ras/` files, and any pnpm or Dependabot policy changes. Do not ignore `.ras/`. A fresh clone uses ordinary `pnpm install --frozen-lockfile`; no consumer install hook, lifecycle script, generated pnpmfile, bootstrap package, custom links, or hoisting configuration is needed.

`ras.managedDependencies` in `package.json` records package names owned by RAS. This lets a later sync remove deselected packages without deleting unrelated application dependencies. Versions come from the executing RAS release. Sync preserves the existing RAS dependency specifier, so packed and Git-source candidates can be tested normally. An upgrade pins the target release's exact RAS version.

RAS runtime integrations use optional peers to share the application's installed SDK instances. Build helpers resolve their tools from the consuming application, so RAS itself does not retain development tooling in production installs. Native `pnpm install --prod --frozen-lockfile` excludes development-only selections; an upstream runtime framework may still have its own build-related dependencies.

After changing selections, run `pnpm exec ras sync` and review the diff. `pnpm exec ras sync --check` verifies manifests, generated configuration, and generated Dependabot rules without writing or installing. Add it to CI before the application's checks. A plain pnpm install does not interpret `ras.config.ts`; the check catches selections that have not been synchronized.

An installation failure leaves ordinary, reviewable files in place. Correct the pnpm error and rerun the same RAS command. Run sync and update from the owning workspace root. Other workspace packages keep their own manifests and versions.

To transfer a package to application ownership, remove its selection and its name from `ras.managedDependencies` before syncing. RAS preserves other application dependencies and configuration. Avoid running concurrent sync/update commands in the same checkout.

## Compiler, linter, and commands

An application `tsconfig.json` can extend `./.ras/tsconfig.json` and retain its own compiler options, paths, and includes. An application `.oxlintrc.json` can extend `./.ras/oxlint.json` and retain local rules, ignores, and overrides. These generated files reference presets bundled in RAS. Sync removes generated presets that are no longer selected.

Commands run the selected tool's executable in the application directory:

| Command                             | Tool                                                 |
| ----------------------------------- | ---------------------------------------------------- |
| `ras sync`                          | Synchronize managed files and run pnpm install       |
| `ras sync --check`                  | Verify managed files without mutation                |
| `ras update [version-or-tag]`       | Synchronize and install using the target release     |
| `ras typecheck`                     | TypeScript with `--noEmit`                           |
| `ras lint`                          | Oxlint with type-aware checks and denied warnings    |
| `ras format`                        | Oxfmt with `--write`; `--check` selects checking     |
| `ras dev` / `ras build`             | Vite                                                 |
| `ras test`                          | Vitest with `run`                                    |
| `ras e2e`                           | Playwright with `test`                               |
| `ras exec -- <program> [arguments]` | Program with the consumer binary directory on `PATH` |
| `ras audit`                         | pnpm audit of the full lockfile                      |

Arguments are forwarded without shell evaluation. Tool commands check selected installed versions; they do not install dependencies or rewrite committed configuration. Application scripts may use the upstream executables directly.

## Build and release policies

RAS retains caller registries, release-age policy, integrity checks, and build approvals. pnpm enforces these during installation. Explicit additional build approvals can be selected with `allowBuilds`, for example `allowBuilds: ['better-sqlite3']` alongside `sqlite`. Sync rejects an explicit consumer denial or a conflicting direct version override before changing files. It does not approve unreviewed transitive scripts.

Consumer lockfiles pin the complete graph for frozen installs. RAS pins selected direct packages; consumer-owned updates can still move shared transitives. Compatibility-sensitive transitive overrides belong in the release or application that needs them. RAS does not replace consumer lockfiles with a shared transitive snapshot.

## Dependabot

When an existing `.github/dependabot.yml` or `.yaml` has an npm update rule for `/`, sync maintains ignored package names for RAS and its selections. Generated entries have a `Managed by RAS.` comment so sync can remove obsolete entries while retaining handwritten rules, schedules, groups, and other ecosystems. RAS does not enable Dependabot in repositories that have not configured it.

Name-based ignores apply to the whole matching Dependabot update rule, including matching packages in other workspace manifests. Split update policies where those packages need independent bot updates. Application-owned packages outside these ignores remain eligible for updates.

Managed packages and RAS require coordinated upgrades through `ras update`; Dependabot cannot upgrade them separately. Vulnerability alerts remain visible, but ignored security fixes require a RAS release or a deliberate application change. Pinning versions does not remove vulnerabilities.

## CI and upgrades

A clean CI job needs only native installation and read-only verification:

```sh
pnpm install --frozen-lockfile
pnpm exec ras sync --check
pnpm check
```

Update RAS, selected dependencies, configuration, and the lockfile with one command:

```sh
pnpm exec ras update
```

The default target is `latest`. Specify `next` or an exact version when reviewing a candidate. The command delegates to `pnpm dlx ras-stack@<target>`, which runs the target release's synchronization and native installation. Registry authentication remains with pnpm. Commit the resulting diff and run the application's checks before merging.

## Migrate from RAS 4

Remove `ras-stack-config`, select its equivalent presets in `ras.config.ts`, and point compiler/linter configuration at `.ras`. Keep application-specific dependencies and configuration. Run the target RAS release's `sync` command to adopt selected dependencies and generate ordinary project files. Review upstream API changes and test builds, tests, and runtime flows as part of migration.

Unpublished candidates can be installed as normal packed archives or Git dependencies, then synchronized through their installed CLI. Git installations build RAS through its standard package `prepare` script and need a source-scoped pnpm build approval. There is no registry-only bootstrap requirement. RAS shared code and documentation contain no consumer repository inventory.
