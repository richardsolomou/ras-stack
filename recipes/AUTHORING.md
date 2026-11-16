# Authoring recipes

A recipe is code an application copies and then owns. It records one decision about how Richard's applications do something, such as sending email or deploying to Dokploy, as complete, working files plus the instructions to wire them in. Applications record which recipes they took in `ras-recipes.json`, and the [`ras-recipes` skill](../skills/ras-recipes/SKILL.md) applies and updates them.

Recipes replace shared runtime code because an application that owns its code can be read, changed, and extended in place. Write a recipe the way the code should look in the application, not as a library for every application.

## Layout

```text
recipes/
  package.json        every package a recipe uses, at the version the stacks test
  check.mjs           assembles and checks the stacks
  <name>/
    RECIPE.md         frontmatter and instructions
    CHANGELOG.md      one entry per version
    files/            the files the recipe adds, at their paths in the application
stacks/
  <name>/
    stack.json        the recipes in this stack, in order, and the checks to run
    ...               the files the recipes wire into, fully wired for this stack
```

## RECIPE.md

```markdown
---
name: email-posthog
version: 1
summary: Send transactional email through PostHog email templates.
requires: []
conflicts: [email-smtp]
dependencies: [posthog-node]
devDependencies: []
wires: [src/server/auth.ts]
---
```

| Key               | Meaning                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | The directory name.                                                                                                                      |
| `version`         | A positive integer. Raise it by one for every change an application has to take.                                                         |
| `summary`         | One sentence for the catalogue.                                                                                                          |
| `requires`        | Recipes whose files this recipe's files import. Not `tooling`, and not a recipe it only wires into when present.                         |
| `conflicts`       | Recipes that make the other choice for the same job. They cannot be in one application.                                                  |
| `dependencies`    | Runtime packages. Versions live only in `recipes/package.json`.                                                                          |
| `devDependencies` | Development packages, with versions in `recipes/package.json` too.                                                                       |
| `wires`           | Files other recipes own that this recipe edits when that recipe is present, such as `vite.config.ts`.                                    |
| `starters`        | Files the application replaces, such as a placeholder page or starting schema. Copied once and never updated; `dir/` covers a directory. |

Frontmatter values are plain scalars or `[a, b]` lists; quote an item that starts with `@`. The body starts with `# <name>` and has these sections, in this order:

1. **Use it when**: the situations the recipe fits, and the alternative when it does not.
2. **Decisions**: each choice the files make and why, including the incidents behind them. An agent reads this before changing the code, so a reason that is not written here is lost.
3. **Files**: a table of each file under `files/` and its job.
4. **Wiring**: the edits to each file in `wires`, precise enough to apply to an application whose files have drifted. Point to the wired file in a stack, such as `stacks/full-stack/src/routes/__root.tsx`, rather than repeating it.
5. **Configuration**: environment variables, secrets, and setup outside the repository, such as creating PostHog email templates.
6. **Verify**: how to prove the recipe works in the application, beyond its shipped tests.

## Files

- Write concrete application code. Leave out options no application needs today; an application that needs one edits its copy.
- Use the layered layout `oxlint.layers` checks: `src/routes`, `src/client`, `src/server`, `src/adapters`, `src/db`, `src/core`, and `src/contracts`, plus `scripts/` and `.github/`.
- Import other files with relative paths, and only from recipes in `requires`.
- Ship tests beside the code as `*.test.ts`. They become the application's tests, so they test behavior the application relies on, and derive expectations from constants the application is told to change rather than repeating their values.
- Mark placeholder files the application is expected to replace as `starters`, so updates never merge recipe changes into the application's real page or schema.
- Two recipes in one stack cannot ship the same path. A file that several recipes change belongs to one of them and appears in the others' `wires`.
- Follow the repository's comment rules: comment only the reason, invariant, or gotcha a skilled reader would miss.

## Stacks

A stack is a realistic application assembled from recipes. `node recipes/check.mjs` copies each stack's recipes in order, lays the stack's own files over them, writes `package.json` dependencies from the recipes, links `recipes/node_modules`, and runs the checks the stack lists. When a stack includes both a recipe and the owner of a file it wires, the stack must provide that file wired. Every pair must appear wired in at least one stack, so every wiring is compiled and tested.

A stack file may replace a recipe file only when one of the stack's recipes lists that path in `wires`. Other stack files are application code that exercises the recipes, such as a route that sends an email.

Every recipe belongs to at least one stack.

## Versions and changelog

Raise `version` when an application would need to change: its files, dependencies, wiring, or configuration. Do not raise it for wording in `RECIPE.md` alone. Add the matching `CHANGELOG.md` entry in the same commit:

```markdown
## 2

Bound each send to ten seconds, because a stalled provider held sign-up requests open until the proxy timed out.

Upgrade: set `EMAIL_TIMEOUT_MS` if ten seconds is too short for the provider.
```

The `ras-recipes` skill merges file changes into applications. The changelog explains why, and `Upgrade:` lists only what a file merge cannot do, such as renamed environment variables, data migrations, or external setup.

Package version changes from Dependabot do not change a recipe's version. Applications keep their own dependency updates.

## Checks

```sh
pnpm --filter @ras-stack/recipes check            # every stack
pnpm --filter @ras-stack/recipes check full-stack # one stack
node recipes/check.mjs --assemble-only full-stack # assemble into $TMPDIR/ras-stack-recipes/full-stack and stop
```

The check also validates every recipe's frontmatter, its changelog entry for the current version, that every listed package has a version in `recipes/package.json`, and that every package there is used by a recipe.
