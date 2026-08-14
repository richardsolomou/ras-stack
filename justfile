default:
    @just --list

install:
    corepack enable
    pnpm install

format:
    pnpm format

lint:
    pnpm lint

build:
    pnpm build

typecheck:
    pnpm typecheck

test *args:
    pnpm exec vitest run {{ args }}

check:
    pnpm check

# Lints the shell scripts and workflow definitions the published actions ship.
check-actions:
    shellcheck actions/*/*.sh
    actionlint
