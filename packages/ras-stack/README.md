# ras-stack

RAS is how Richard Solomou's applications are built: from [recipes](https://github.com/richardsolomou/ras-stack/blob/main/recipes/README.md), working code an application copies once and then owns, with the decisions behind it written down. The [`ras-recipes` skill](https://github.com/richardsolomou/ras-stack/blob/main/skills/ras-recipes/SKILL.md) adds recipes to an application, merges later recipe changes into its copy, and reports drift. The [stacks](https://github.com/richardsolomou/ras-stack/tree/main/stacks) are complete applications assembled from recipes and checked in CI.

This npm package holds the few things applications share instead of copying:

- TypeScript and Oxlint presets, which the `tooling` recipe extends.
- The `ras preview` command and the `ras-stack/preview/dokploy` export, which the shared Dokploy preview workflows run.

[npm](https://www.npmjs.com/package/ras-stack) · [Documentation](https://github.com/richardsolomou/ras-stack/blob/main/docs/README.md) · [Recipes](https://github.com/richardsolomou/ras-stack/blob/main/recipes/README.md) · [Migrate from v5](https://github.com/richardsolomou/ras-stack/blob/main/docs/upgrades.md)

## Presets

Install `ras-stack` as a development dependency and extend the presets by file path, which works with any module resolution setting:

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
| `oxlint/application.json` | Application lint rules.                                                                                |
| `oxlint/domain.json`      | Keeps `src/core/**` free of Node builtins, framework and persistence packages, and application layers. |
| `oxlint/layers.json`      | Restricts imports between `src/client`, `server`, `adapters`, `db`, `contracts`, and `routes`.         |

The boundary presets hold only their import restrictions, so list them after `application.json` in `extends`. They skip tests, recognize relative paths and `@/`, and check lexical imports rather than transitive side effects. A local `no-restricted-imports` override replaces that rule's patterns, so restate the restrictions that still apply. Oxlint does not inherit `ignorePatterns` through `extends`, so keep them in the application's own config.

## Previews

The [Dokploy preview workflows](https://github.com/richardsolomou/ras-stack/blob/main/docs/repository-tooling.md#dokploy-previews) run `pnpm exec ras preview` from the application's install. An application with its own preview resources writes a deploy script on `ras-stack/preview/dokploy`.

## Contributing

The workspace uses Node 24, pnpm 11.15.0, and Just 1.58.0:

```sh
just install
just check
```

See [CONTRIBUTING.md](https://github.com/richardsolomou/ras-stack/blob/main/CONTRIBUTING.md) for development and releases, and [SECURITY.md](https://github.com/richardsolomou/ras-stack/blob/main/SECURITY.md) for private vulnerability reports.

[MIT license](https://github.com/richardsolomou/ras-stack/blob/main/packages/ras-stack/LICENSE).
