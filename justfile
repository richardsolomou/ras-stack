default:
    @just --list

install:
    corepack enable
    pnpm install

test:
    pnpm test

check:
    pnpm check

# Lints the shell scripts and workflow definitions the published actions ship.
check-actions:
    shellcheck actions/*/*.sh
    actionlint
