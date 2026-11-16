# ras-stack

Compiler and lint presets, and the preview deployment tooling, for applications built from [ras-stack recipes](https://github.com/richardsolomou/ras-stack#readme).

[Recipes](https://github.com/richardsolomou/ras-stack/blob/main/recipes/README.md) · [Documentation](https://github.com/richardsolomou/ras-stack/blob/main/docs/README.md) · [Changelog](https://github.com/richardsolomou/ras-stack/blob/main/packages/ras-stack/CHANGELOG.md) · [Migrate from v5](https://github.com/richardsolomou/ras-stack/blob/main/docs/upgrades.md)

Applications built from recipes copy and own their code: the app shell, accounts, databases, email, realtime, uploads, analytics, and deploys. This package holds the two things they share instead:

- **Presets** for TypeScript and Oxlint, which the [`tooling` recipe](https://github.com/richardsolomou/ras-stack/tree/main/recipes/tooling) extends.
- **Preview tooling**: the `ras preview` command and the `ras-stack/preview/dokploy` export, which the shared Dokploy preview workflows run.

It publishes `config/` (the presets), `dist/` (the `ras` command and the preview export), this README, and the license. Requires Node 24.

## Presets

Install the package as a development dependency:

```sh
pnpm add -D ras-stack
```

Extend the presets by file path, which works with any module resolution setting:

```json
{
  "extends": "./node_modules/ras-stack/config/typescript/vite.json",
  "include": ["src", "vite.config.ts"]
}
```

```json
{
  "extends": ["./node_modules/ras-stack/config/oxlint/application.json"],
  "ignorePatterns": ["node_modules/**", "dist/**"]
}
```

| Preset                    | Use                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `typescript/vite.json`    | Vite applications: browser and JSX settings with Vite and Node types.                                  |
| `typescript/browser.json` | Browser code without Vite.                                                                             |
| `typescript/bundler.json` | Bundled code without the DOM, such as a Convex or SpacetimeDB module.                                  |
| `typescript/library.json` | Node libraries and tools compiled with `NodeNext`.                                                     |
| `typescript/base.json`    | The strict compiler options the other TypeScript presets share.                                        |
| `oxlint/application.json` | Application lint rules.                                                                                |
| `oxlint/domain.json`      | Keeps `src/core/**` free of Node builtins, framework and persistence packages, and application layers. |
| `oxlint/layers.json`      | Restricts imports between `src/client`, `server`, `adapters`, `db`, `contracts`, and `routes`.         |

The boundary presets hold only their import restrictions, so list them after `application.json` in `extends`. They skip tests, recognize relative paths and `@/`, and check lexical imports rather than transitive side effects. A local `no-restricted-imports` override replaces that rule's patterns, so restate the restrictions that still apply. Oxlint does not inherit `ignorePatterns` through `extends`, so keep them in the application's own config.

## Previews

The [Dokploy preview workflows](https://github.com/richardsolomou/ras-stack/blob/main/docs/repository-tooling.md#dokploy-previews) deploy each pull request to Dokploy and report its status on the pull request. They run the `ras` command from the application's install, so keep `ras-stack` as a development dependency.

| Command                                                    | Does                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ras preview dokploy <deploy\|delete\|prune>`              | Deploys a pull request's image, deletes its preview, or removes previews of closed pull requests. |
| `ras preview <awaiting\|building\|ready\|failed\|deleted>` | Updates the pull request's preview comment and check run.                                         |

Both read their configuration from environment variables the workflows set; the [repository tooling guide](https://github.com/richardsolomou/ras-stack/blob/main/docs/repository-tooling.md#dokploy-previews) lists them.

An application with its own preview resources, such as a tenant to provision, points the workflow's `deploy-script` at a script built on `ras-stack/preview/dokploy`:

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

The export also provides `DokployClient` for the raw Dokploy API, `loadPreviewAppSecrets` to copy allowlisted keys of the `PREVIEW_APP_SECRETS` secret into the environment, and `pullRequestNumber`.

## Everything else

Runtime code is not in this package. Copy it from the [recipes](https://github.com/richardsolomou/ras-stack#readme) with the [`ras-recipes` skill](https://github.com/richardsolomou/ras-stack/blob/main/skills/ras-recipes/SKILL.md), which also merges later recipe changes into your copy.

See [CONTRIBUTING.md](https://github.com/richardsolomou/ras-stack/blob/main/CONTRIBUTING.md) to work on the package, and [SECURITY.md](https://github.com/richardsolomou/ras-stack/blob/main/SECURITY.md) for private vulnerability reports.

[MIT license](https://github.com/richardsolomou/ras-stack/blob/main/packages/ras-stack/LICENSE)
