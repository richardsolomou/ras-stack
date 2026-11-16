---
name: ras-recipes
description: Add, update, adopt, or check RAS recipes, copy-and-own application code (TanStack Start shell, PostHog, Better Auth, email, databases, realtime, uploads, Convex, SpacetimeDB, Dokploy and Cloudflare deploys, CI). Use when starting an application, adding one of those capabilities, updating an application's recipes, checking how far an application has drifted, or working in a repository with a ras-recipes.json.
---

# RAS recipes

A recipe is working code an application copies once and then owns, plus the instructions to wire it in. Recipes live in [ras-stack](https://github.com/richardsolomou/ras-stack) under `recipes/<name>/`: `README.md` (when to use it, the decisions and why, files, wiring, configuration, verification), `CHANGELOG.md`, and `files/`. Each application records what it took in `ras-recipes.json`:

```json
{
  "source": "https://github.com/richardsolomou/ras-stack",
  "recipes": {
    "email-posthog": {
      "version": 1,
      "commit": "<ras-stack commit the files came from>",
      "files": { "src/adapters/email.ts": "src/adapters/email.ts", "src/adapters/email.test.ts": null },
      "notes": ["Sends receipts with idempotency keys derived from the order id."]
    }
  }
}
```

`files` maps each recipe path to its path in the application, or `null` when the application left that file out. `notes` holds every deliberate difference from the recipe and why. The recorded commit is the merge base for updates, so later recipe changes merge into the application's edited copy without losing its changes. Starter files, such as a placeholder home page or starting schema, are copied once and never tracked, so updates never merge into the application's real version of them.

## The script

`scripts/recipes.mjs` (next to this file) does the mechanical parts. It always reads recipes from a git ref of ras-stack (default `origin/main`, fetched first), never from a working tree that might be on a branch. It finds ras-stack at `$RAS_STACK_DIR`, in the repository it lives in when the skill is a symlink into a clone, or in `~/.cache/ras-stack`, which it clones on first use. Run it with Node 24: `node <this skill>/scripts/recipes.mjs <command>`.

| Command                                           | Does                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `recipes.mjs list`                                | Every recipe, its version, and summary.                                       |
| `recipes.mjs show <recipe>`                       | The recipe's `README.md`.                                                     |
| `recipes.mjs show <recipe> --file <path>`         | One recipe file.                                                              |
| `recipes.mjs show <recipe> --since <commit>`      | Changelog entries, the recipe diff, and the wired stack files since a commit. |
| `recipes.mjs status`                              | The application's recipes, how many files it edited, and which are behind.    |
| `recipes.mjs add <recipe> [--map F=T] [--skip F]` | Copies missing files, records the recipe, and lists packages to install.      |
| `recipes.mjs update <recipe> [--allow-dirty]`     | Three-way merges the recipe's changes into the application's files.           |

Run commands from the application root or pass `--app <dir>`. Pass `--ref <ref>` only to try an unmerged recipe change.

The decision guide is `recipes/README.md` in ras-stack (`git -C <ras-stack> show origin/main:recipes/README.md`). Each `stacks/<name>/` directory is a complete application wired from recipes; when wiring is unclear, read the matching stack file at the same ref.

## Add a recipe

1. Read the decision guide and the recipe's `README.md` in full. Confirm it fits under **Use it when**, and add its `requires` first, in order. A new application starts with `tooling` and `start-app`.
2. Choose where the files go. Keep recipe paths unless the application already has a different layout, then `--map` each file. `--skip` a file only when the application deliberately does without it; `--skip` also keeps a starter file, or a starter directory given with a trailing `/`, from being copied over code the application already has. A starter directory the application already has, such as `drizzle/`, is left alone without it, and later updates add no files to it.
3. Run `add`. It copies files that do not exist, copies starter files, leaves existing files alone, and records the recipe. When it lists imports broken by `--map`, fix them in the application's copies.
4. Apply the `pnpm-workspace.yaml` wiring first when the recipe has it, because pnpm refuses to install a package with build scripts that `allowBuilds` does not list. Then install the packages it prints with the application's package manager; it leaves out packages only skipped files import. Keep a version the application already has when it is newer within the same major.
5. Reconcile each existing file it lists: bring the recipe's behaviour into the application's file and keep the application's own content.
6. Apply every other **Wiring** step, using the stack files as the reference.
7. Apply **Configuration**: add variables to `.env.example`, change the names and values the recipe asks the application to choose, and collect secrets and outside setup (PostHog templates, DNS, provider credentials) into a short list for the user.
8. Run the formatter, then the application's checks and the recipe's **Verify** steps.
9. Add a `notes` entry for every deliberate difference, one sentence each with the reason.

Commit the recipe on its own so the diff reads as one change.

## Update recipes

1. Start from a clean working tree, so every change the update makes is reviewable.
2. Run `status`. Update behind recipes one at a time, `requires` before the recipes that need them.
3. Read what changed and why: `show <recipe> --since <recorded commit>`. Read the recipe's `notes` too.
4. Run `update <recipe>`. Files the application never changed are replaced; changed files are merged.
5. Resolve each conflict. Markers show three sides: `application`, the old recipe, and the new recipe. Keep what the notes say the application deliberately does, take the recipe's fix, and never pick a side wholesale without reading both. Then typecheck: a clean merge can add a recipe function beside an application function of the same name, outside any conflict.
6. Handle each **Needs a decision** item: a skipped file the recipe changed, a removed file the application edited, or a new file whose path the application already uses. Record the outcome in `files`: map the recipe path to where the application keeps it, or leave it `null` and add a note when the application does without it.
7. Apply **Wiring** changes. A merge cannot reach files the recipe only wires; `show <recipe> --since <recorded commit>` includes the wired stack files' diff, so apply the same change to the application's copies.
8. Do every `Upgrade:` step in the changelog, and add or remove the packages the update lists.
9. Run the formatter and the checks. Update `notes` if a decision changed.

Edit `files` and `notes` by hand when the application moves or drops a file. Never edit `version` or `commit`; they are the merge base.

## Adopt existing code

When an application already does what a recipe does, from the old `ras-stack` package or by hand, record the recipe rather than copying it twice:

1. Adopt one recipe at a time, starting with the ones others `require`. Adopting `start-app` into an existing application is the largest step, because it owns the composition root other recipes register with; do it first and on its own.
2. `add <recipe>` with `--map` for each recipe file the application already has elsewhere, and `--skip` the ones it deliberately does without. Existing files are left alone and listed.
3. Make each listed file match the recipe except for the application's real differences, and record those in `notes`. The smaller the remaining difference, the cleaner future updates merge. Never change what the data depends on to match the recipe: keep the application's database file name, migrations folder and history, secret names in use, and storage paths, and record them as notes.
4. Compare the application's `package.json`, Vite plugins, and configuration with the matching stack, and remove what the recipes replace, such as `vite-tsconfig-paths` (set `resolve.tsconfigPaths: true` in `vite.config.ts` instead), `@vitejs/plugin-react-swc` (the recipes use `@vitejs/plugin-react`), and `ssr.noExternal` entries the deploy plugin already bundles.
5. When adopting `tooling`, set `ras-stack`, which ships its presets: `^6` when nothing imports a `ras-stack/<module>` helper, otherwise `^5`, which ships the same presets at the same paths and still has the helpers. An application on v4 or earlier goes to `^5` in this step too, because v4 has no presets. An application with the managed install (`ras.config.ts` and the `pnpmfile` hook) removes it in this same commit, as [Remove the managed install](https://github.com/richardsolomou/ras-stack/blob/main/docs/upgrades.md#remove-the-managed-install) describes, replacing `defineViteConfig` with a plain `vite.config.ts`: the hook rejects managed packages declared in `package.json`, so neither `tooling`'s packages nor any later recipe's can be installed while it is there. Check that Vitest's `include` matches `src/**/*.test.tsx` as well as `*.test.ts`; an existing configuration often matches only `.ts`, and recipes' component and hook tests then never run. Recipe tests assume `noUncheckedIndexedAccess`; an application that keeps it off turns off `typescript/no-unnecessary-type-assertion` for tests, whose `!` assertions are then redundant, and records that as a note. Tests of the old package's helpers that do not run under Vitest can go in this step, once `test` runs Vitest.
6. Replace imports of `ras-stack/<module>` runtime helpers with the recipe's local files, and delete tests of the old package's helpers (such as `ras-stack/conformance` assertions) once the recipe's own tests cover the same behaviour. When the last helper import is gone, raise `ras-stack` to `^6`.

## Check drift across applications

Run `status --app <dir>` for each application. Report behind recipes with the changelog summaries it prints and how many files each application edited; do not update unasked.

## Problems in a recipe

When a recipe is wrong for every application, not just this one, fix the application, record a note, and tell the user so the fix can go into ras-stack as an issue or pull request. Changes to recipes follow `recipes/AUTHORING.md` in ras-stack.
