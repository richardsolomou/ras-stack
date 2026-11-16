# Contributing to ras-stack

Install Node 24.x, pnpm 11.15.0, and Just 1.58.0, then run:

```sh
just install
just check
```

`just check` runs formatting, linting, type checking, the package and skill tests, the workspace builds, the packed-package check, and a parse of every pending changeset. Package tests enforce the coverage thresholds in `packages/ras-stack/vitest.config.ts`; raise a threshold when a change clears it rather than leaving new code untested.

`just check-recipes [stack…]` assembles every stack, or the named ones, from its recipes and runs the stack's checks; `node recipes/check.mjs --install <stack>` does the same with a real `pnpm install` instead of the shared `node_modules`. `just check-actions` lints the shell scripts and workflow definitions the published actions ship. It needs ShellCheck and actionlint, which `mise install` provides at the versions pinned in `mise.toml`.

## Recipes

Recipes are the product. Shared runtime behaviour belongs in a recipe that applications copy and own, not in the package, so add or change behaviour by following [AUTHORING.md](recipes/AUTHORING.md), and prove it in a stack. The [`ras-recipes` skill](skills/ras-recipes/SKILL.md) applies recipes to applications; its tests run with `pnpm --filter @ras-stack/recipes test`.

## The package

`packages/ras-stack` ships only what applications cannot usefully copy: the compiler and lint presets under `config/`, which the `tooling` recipe extends by path, and the preview tooling the shared Dokploy workflows run (`ras preview` and `ras-stack/preview/dokploy`). Keep it that way. Every exported behaviour needs a contract test, and `src/api-surface.test.ts` records the published names, so widening the surface arrives as a reviewed diff. `package:check` packs the package, unpacks it into an empty project, and checks that every preset resolves, the preview export loads, and `ras preview` runs.

Vitest runs `packages/ras-stack/src/**/*.test.ts`, `packages/ras-stack/scripts/**/*.test.ts`, and `actions/**/*.test.ts`, so a test covering an action script sits beside the script, and tests of the release workflows sit beside the release scripts.

Keep application names, repository revisions, and application-specific checks in the applications.

## Documentation ownership

The [documentation index](docs/README.md) lists the guides. A recipe's `README.md` owns its decisions, wiring, configuration, and verification; link to it rather than repeating it. The repository tooling guide owns the Actions and reusable workflow contracts.

## Releases

Add a Changeset for each release-worthy package, action, or reusable-workflow change. Recipes are versioned by their own `version` and `CHANGELOG.md`, not by Changesets. Package releases use `v<version>` tags, and the release workflow publishes each missing version from a packed archive with provenance bound to the released commit. The runtime binaries image has its own `runtime-v*` tags; `pnpm runtime:pin` checks that every pinned reference to it names the same published digest.

A new npm package needs an initial manual publication before its trusted GitHub Actions publisher can be configured. Review and publish the packed archive, then configure `release.yml` as its trusted publisher. Never publish a workspace directory directly.
