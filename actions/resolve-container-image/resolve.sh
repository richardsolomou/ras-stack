#!/usr/bin/env bash
set -euo pipefail

digest="$(docker buildx imagetools inspect "$IMAGE" --format '{{json .Manifest.Digest}}' | jq -r .)"
[[ $digest =~ ^sha256:[0-9a-f]{64}$ ]]
reference="${IMAGE}@${digest}"
echo "reference=${reference}" >> "$GITHUB_OUTPUT"
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then echo "Resolved \`${reference}\`" >> "$GITHUB_STEP_SUMMARY"; fi
