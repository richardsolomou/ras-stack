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
