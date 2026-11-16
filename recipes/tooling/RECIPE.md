---
name: tooling
version: 1
summary: TypeScript, Oxlint, Oxfmt, and Vitest on the shared presets, behind one `pnpm check`.
requires: []
conflicts: []
dependencies: []
devDependencies: [ras-stack, typescript, vite, oxlint, oxlint-tsgolint, oxfmt, vitest, '@types/node']
wires: []
---

# tooling

## Use it when

Every application starts here. The other recipes assume its scripts, compiler settings, and lint rules.

## Decisions

- **Presets come from the `ras-stack` package; everything else is local.** The compiler and lint presets are the one part that is identical in every application and rarely changes, so applications extend them. `tsconfig.json` and `.oxlintrc.json` extend them by file path through `node_modules`, which works with any module resolution setting.
- **Oxlint and Oxfmt instead of ESLint and Prettier.** They are fast enough to run on every save and in every agent loop, and type-aware linting catches floating promises and unsafe `any` use that TypeScript allows.
- **`pnpm check` runs everything CI runs**, in the order that fails fastest: formatting, lint, types, tests. Recipes that add a build or end-to-end step extend this script.
- **Node 24 and pnpm 11, declared in `engines` and `packageManager`.** The shared `setup-js` action reads both, so CI and local development use the same toolchain.
- **Packages must be a week old before they install.** `minimumReleaseAge` keeps a freshly published, compromised release out of local installs and CI alike, matching Dependabot's seven-day cooldown in the `ci` recipe. PostHog packages are exempt because their SDK fixes are wanted the day they ship. `allowBuilds` lists every package allowed to run install scripts; recipes that add a native package, such as `better-sqlite3`, add it there.
- **`AGENTS.md` points agents at `ras-recipes.json`.** Agents working in the application then know which code came from a recipe and where to look before changing it.

## Files

| File                  | Job                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `package.json`        | Scripts, engines, and package manager. Other recipes add their own scripts.                                                 |
| `tsconfig.json`       | Extends the Vite preset: strict, `noUncheckedIndexedAccess`, bundler ESM, and `.ts` import extensions for `vite.config.ts`. |
| `.oxlintrc.json`      | Extends the application lint preset.                                                                                        |
| `.oxfmtrc.json`       | The shared formatting style.                                                                                                |
| `vitest.config.ts`    | Runs `*.test.ts` and `*.test.tsx` under `src/` and `scripts/`, passing before the first test exists.                        |
| `pnpm-workspace.yaml` | Install policy: a seven-day release age and the packages allowed to run build scripts.                                      |
| `.gitignore`          | Dependencies, build output, and local environment files.                                                                    |
| `AGENTS.md`           | Tells agents how the application relates to its recipes.                                                                    |

## Wiring

None. In an existing application, merge rather than replace: keep its `name`, scripts, and `AGENTS.md` content, and add what is missing.

## Configuration

Rename `"name": "app"` in `package.json` to the application's name.

## Verify

`pnpm check` passes.
