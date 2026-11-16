default:
    @just --list

install:
    corepack enable
    pnpm install

test:
    pnpm test

check:
    pnpm check

# Assembles every recipe stack and runs its checks, or only the named stacks.
check-recipes *stacks:
    pnpm --filter @ras-stack/recipes check {{stacks}}

# Lints the shell scripts and workflow definitions the published actions ship.
check-actions:
    shellcheck actions/*/*.sh
    actionlint

# Lints each assembled stack's workflows as its own repository, so local reusable workflows resolve; every recipe is in a stack.
check-recipe-workflows:
    #!/usr/bin/env bash
    set -euo pipefail
    node recipes/check.mjs --assemble-only > /dev/null
    assembled="$(node -p "require('node:path').join(require('node:os').tmpdir(), 'ras-stack-recipes')")"
    for stack in "$assembled"/*/; do
      [ -d "$stack.github/workflows" ] || continue
      repository="$(mktemp -d)"
      cp -R "$stack.github" "$repository/"
      git -C "$repository" init -q
      (cd "$repository" && actionlint)
      rm -rf "$repository"
    done
