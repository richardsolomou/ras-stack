# Configuration

[Documentation](README.md) · [Installation](managed-installation.md) · [Upgrades](upgrades.md)

`ras.config.ts` selects versioned capabilities from `ras-stack/config`. `defineConfig` validates the composition; no capability is selected by default. Descriptors can include other descriptors. Repeated compatible selections deduplicate, while conflicting versions, commands, or TypeScript presets fail.

## Runtime integration catalogue

| Selection         | Managed packages and configuration                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `tanstackQuery`   | TanStack Query, React/React DOM, and React development types; [Query runtime helpers](application-primitives.md#query) |
| `tanstackStart`   | Query/React plus Start, Router, SSR Query integration, and the Start Vite preset                                       |
| `betterAuth`      | Better Auth; [auth options and request security](application-primitives.md#authentication-and-request-security)        |
| `sqlite`          | `better-sqlite3`, Drizzle, and SQLite development types                                                                |
| `postgres`        | Postgres.js and Drizzle                                                                                                |
| `libsql`          | libSQL client and Drizzle                                                                                              |
| `email`           | Nodemailer and its development types                                                                                   |
| `uploads`         | `tus-js-client`                                                                                                        |
| `realtime`        | Centrifuge client; service binaries are a separate deployment concern                                                  |
| `posthog.browser` | Browser SDK                                                                                                            |
| `posthog.react`   | Browser SDK, React integration, and React/React DOM with development types                                             |
| `posthog.server`  | Node SDK and OpenTelemetry logging packages                                                                            |

The database, email, upload, realtime, and auth selections supply dependencies for the [runtime helpers](application-primitives.md). They do not create schemas, migrations, providers, environment variables, or application behavior. The SpacetimeDB SDK and plain libraries such as Zod remain application-owned.

Use original upstream imports alongside narrow RAS helpers. RAS shares application SDK instances through optional peers; it does not publish a parallel wrapper package for each library.

## Tool catalogue

Tools and types enter the application graph as development dependencies without physical manifest declarations. Some descriptors also include runtime prerequisites, such as React for the Vite React integration.

| Selection             | Defaults                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| `typescript`          | Infer Vite/browser or NodeNext compiler defaults from the selected integrations       |
| `typescript.bundler`  | Explicit ESM bundler target without assuming DOM globals                              |
| `typescript.browser`  | Explicit browser target with DOM, JSX, and no-emit defaults                           |
| `typescript.library`  | Explicit NodeNext target with declaration-friendly strictness                         |
| `oxlint`              | Application lint defaults, type-aware checks, and framework-generated-file exclusions |
| `oxlint.domain`       | Oxlint defaults plus import boundaries for domain code in `src/core`                  |
| `oxlint.layers`       | Oxlint defaults plus import boundaries for conventional application layers            |
| `oxfmt`               | Formatting through Oxfmt                                                              |
| `vite`                | Vite, React plugin/runtime, `@` alias for `src`, and dev/build commands               |
| `vitest`              | Vitest and its V8 coverage provider                                                   |
| `playwright`          | Playwright Test; browser installation remains a CI/local setup step                   |
| `tailwind`            | Tailwind and its Vite plugin, with an injected stylesheet import                      |
| `tailwind.animations` | Tailwind plus `tw-animate-css` and its stylesheet import                              |
| `nitro`               | Nitro and its Vite preset                                                             |
| `posthog.build`       | PostHog Rollup plugin with client/worker build wiring                                 |

Use plain `typescript` and `oxlint` for ordinary setup:

```ts
import { defineConfig, tanstackStart, typescript, oxlint, vite } from 'ras-stack/config'

export default defineConfig({
  integrations: [tanstackStart],
  tooling: [typescript, oxlint, vite],
})
```

`typescript` selects browser/JSX defaults with Vite and Node types when `tanstackStart` or `vite` is present, and the NodeNext library preset otherwise. Inference uses the complete selection, including nested descriptors, regardless of order. An explicit compiler target overrides inference; selecting two different explicit targets fails. Internal base and framework presets are composition details rather than extra opt-ins.

`oxlint` includes application defaults. With Start selected, `ras lint` adds generated route-tree/output exclusions as command arguments, so they also work with a local root config. Oxlint does not inherit `ignorePatterns` through JSON `extends`; direct Oxlint invocations and editor integrations need these exclusions in their root config. Architecture boundaries remain explicit; `oxlint.domain` and `oxlint.layers` each include the ordinary defaults, so selecting either does not require a second `oxlint` entry. Selecting a framework alone never opts into the compiler or linter.

Start, Nitro, Tailwind, and PostHog build presets are applied through the selected Vite integration; select `vite` to provide the managed dev/build commands. `tanstackStart` does not select Nitro automatically. Tailwind animations and PostHog runtime/build surfaces remain separate because they add distinct stylesheet, runtime, or upload behavior.

## Build configuration

With no application Vite config, `ras dev` and `ras build` use the default config shipped inside RAS. If the app needs overrides, compose them in `vite.config.ts`:

```ts
import { defineViteConfig } from 'ras-stack/vite'

export default defineViteConfig({
  assetsInclude: ['**/*.woff'],
  server: { port: 3000 },
  ras: {
    stylesheet: 'src/styles.css',
    nitro: { routeRules: { '/health': { headers: { 'Cache-Control': 'no-store' } } } },
  },
})
```

Only selected presets load their plugins. `defineViteConfig` accepts an object or an async Vite callback. Ordinary Vite settings and plugins compose with the defaults; `ras.start`, `ras.nitro`, and `ras.posthog` accept upstream plugin options. Keep application-specific headers, proxies, offline plugins, assets, and release metadata here. A handwritten config using Vite's own `defineConfig` does not opt into the RAS presets.

For Tailwind, keep theme declarations and application CSS in `src/styles.css`, and import that file from the application entrypoint. RAS prepends the Tailwind import; `tailwind.animations` also prepends the animation import. Remove matching imports from the stylesheet when adopting these presets. Use `ras.stylesheet` when the file has another path.

For PostHog, select `posthog.build` separately from the runtime surfaces. [Source-map configuration](posthog.md#source-maps) owns activation, credentials, release metadata, and deployment verification.

## Local compiler and linter settings

Keep local options in files extending the generated presets. For `tsconfig.json`:

```json
{
  "extends": "./.ras/tsconfig.json",
  "include": ["src", "vite.config.ts"],
  "compilerOptions": { "noUncheckedIndexedAccess": true }
}
```

For `.oxlintrc.json`:

```json
{
  "extends": ["./.ras/oxlint.json"],
  "ignorePatterns": ["dist/**", "node_modules/**", ".ras/**"]
}
```

Keep aliases, includes, application-specific generated directories, worker globals, and exceptions local. When a root config exists, the tool commands use it; selecting a preset does not rewrite a handwritten config to extend `.ras`.

`oxlint.domain` restricts Node builtins, framework/persistence imports, and application-layer imports in `src/core/**`. Plain domain libraries remain available. `oxlint.layers` restricts imports between `src/client`, `server`, `adapters`, `db`, `contracts`, and `routes`; clients can import `server/functions` and `server/fns`, while routes cannot import sibling route modules.

Both boundary presets exclude tests/specs, recognize relative paths and `@/`, and check lexical imports rather than transitive side effects. Neither is automatic. Other layouts or aliases need local overrides. A local `no-restricted-imports` override replaces that rule's patterns, so retain the restrictions that still apply.

## CLI reference

Prefix these commands with `pnpm exec` when running outside a package script.

| Command                             | Behavior                                                   |
| ----------------------------------- | ---------------------------------------------------------- |
| `ras sync`                          | Configure the shipped hook, refresh policy, and install    |
| `ras sync --check`                  | Check wiring, policy, and selected installed versions      |
| `ras update [version-or-tag]`       | Run the target release's sync and installation             |
| `ras typecheck`                     | Selected TypeScript with `--noEmit`                        |
| `ras lint`                          | Selected Oxlint with type-aware checks and denied warnings |
| `ras format`                        | Selected Oxfmt with `--write`; `--check` selects checking  |
| `ras dev` / `ras build`             | Selected Vite dev/build commands                           |
| `ras test`                          | Selected Vitest with `run`                                 |
| `ras e2e`                           | Selected Playwright with `test`                            |
| `ras exec -- <program> [arguments]` | Execute with application binaries on `PATH`                |
| `ras audit`                         | Run pnpm audit against the consumer lockfile               |

Tool commands verify selected installed versions before execution. They do not install dependencies. pnpm prepares ignored local presets through its hook before launching the command. Arguments are forwarded without shell evaluation; applications can also use upstream executables directly. Asset, Changesets, preview, and realtime service commands are documented under [repository tooling](repository-tooling.md).

## Custom configured tooling

A local descriptor can compose a bundled preset with a project-specific command:

```ts
import { defineConfig, defineIntegration, typescript } from 'ras-stack/config'

const libraryBuild = defineIntegration({
  name: 'library-build',
  includes: [typescript.library],
  commands: {
    build: { package: 'typescript', bin: 'tsc', args: ['--project', 'tsconfig.library.json'] },
  },
})

export default defineConfig({ tooling: [libraryBuild] })
```

The application supplies `tsconfig.library.json`. A descriptor's `packages` and `devPackages` fields require exact versions, not ranges, tags, paths, or Git URLs. Reuse existing descriptors with `includes`; use established managed command names. Tool command bins run through Node; use `ras exec --` for native executables. Keep application-specific descriptors local and reusable integration contracts in RAS.
