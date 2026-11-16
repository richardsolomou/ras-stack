---
name: tooling
version: 2
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
- **Packages must be a week old before they install.** `minimumReleaseAge` keeps a freshly published, compromised release out of local installs and CI alike, matching Dependabot's seven-day cooldown in the `ci` recipe. PostHog packages and `ras-stack` are exempt: they are first-party, and their fixes are wanted the day they ship. `allowBuilds` lists every package allowed to run install scripts; recipes that add a native package, such as `better-sqlite3`, add it there.
- **Recipe code assumes `noUncheckedIndexedAccess`.** The preset turns it on, so recipe files and tests guard or assert (`!`) every indexed read. An application that keeps it off still compiles them, but `typescript/no-unnecessary-type-assertion` then flags those assertions; turn that rule off for tests in `.oxlintrc.json` rather than editing recipe tests, so updates keep merging.
- **Vitest runs `*.test.tsx` too.** Recipes ship component and hook tests as `.tsx`. An application that keeps its own `vitest.config.ts` must include them, or those tests silently never run.
- **One formatting style: single quotes, no semicolons, 140 columns.** Every recipe file is written in the style `.oxfmtrc.json` sets, so recipe updates merge into applications without formatting changes. Adopting `tooling` reformats most of an existing application; commit that reformat on its own, so later diffs show only real changes.
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

None. In an existing application, merge rather than replace: keep its `name`, scripts, and `AGENTS.md` content, and add what is missing. Run `pnpm format` and commit the result alone before any other change.

- **The reformat goes first.** Commit `.oxfmtrc.json` and the `pnpm format` result before the rest of the recipe. A pre-commit hook that formats the whole repository, such as lefthook running `pnpm fix` with `stage_fixed: true`, otherwise reformats files into whichever commit comes next.
- **A committed route tree keeps its formatter ignore.** Oxfmt skips what `.gitignore` lists, which does not cover a tracked file. An application that commits `src/routeTree.gen.ts` keeps its own `ignorePatterns` entry for it in `.oxfmtrc.json` until `start-app` untracks the file.
- **`layers.json` can go when no layered directory exists.** It only restricts imports between `src/routes`, `src/client`, `src/server`, `src/adapters`, `src/db`, and `src/contracts`. An application with none of them can drop it from `.oxlintrc.json` and record a note; add it back with the first recipe that adds files there.
- **Without TypeScript**, `--skip tsconfig.json`; drop the `typecheck` script and its step in `check`, `--type-aware` from `lint`, and `typescript`, `oxlint-tsgolint`, and `@types/node`. With no tests, also `--skip vitest.config.ts` and drop the `test` script, its step in `check`, and `vitest`. Record each as a note.

## Configuration

Rename `"name": "app"` in `package.json` to the application's name.

## Verify

`pnpm check` passes.
