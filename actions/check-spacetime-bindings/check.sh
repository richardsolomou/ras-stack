#!/usr/bin/env bash
set -euo pipefail

: "${BINDINGS_MODULE_PATH:?module-path is required}"
: "${BINDINGS_OUT_DIR:?out-dir is required}"

spacetime generate --lang "${BINDINGS_LANG:-typescript}" --module-path "$BINDINGS_MODULE_PATH" --out-dir "$BINDINGS_OUT_DIR" --yes
if [[ -n ${BINDINGS_FORMAT_COMMAND:-} ]]; then
  bash -c "$BINDINGS_FORMAT_COMMAND"
fi

# Untracked files count too: a new table or reducer adds a binding that was never committed.
if [[ -n $(git status --porcelain --untracked-files=all -- "$BINDINGS_OUT_DIR") ]]; then
  git status --short --untracked-files=all -- "$BINDINGS_OUT_DIR" >&2
  echo "generated bindings in $BINDINGS_OUT_DIR are stale; regenerate them and commit the result" >&2
  exit 1
fi

echo "bindings in $BINDINGS_OUT_DIR match the module"
