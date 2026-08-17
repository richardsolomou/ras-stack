#!/bin/bash
set -euo pipefail

for name in BASE_SHA HEAD_SHA; do
  value=${!name:-}
  if [[ ! $value =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "$name must be a full commit SHA" >&2
    exit 2
  fi
done

ensure_commit() {
  local sha=$1
  if ! git cat-file -e "${sha}^{commit}" 2>/dev/null; then
    git fetch --no-tags --depth=1 origin "$sha"
  fi
}

ensure_commit "$BASE_SHA"
ensure_commit "$HEAD_SHA"

if [[ $(git rev-parse --is-shallow-repository) == true ]]; then
  git fetch --no-tags --filter=blob:none --unshallow origin "$HEAD_SHA"
fi

if ! git merge-base --is-ancestor "$BASE_SHA" "$HEAD_SHA"; then
  echo "dependency branch does not contain the current base; refresh the dependency branch before merging" >&2
  exit 1
fi

echo "dependency branch contains base $BASE_SHA"
