#!/usr/bin/env bash
set -euo pipefail

[[ $DIGEST =~ ^sha256:[0-9a-f]{64}$ ]]
[[ $SHA =~ ^[0-9a-f]{40}$ ]]
reference="${IMAGE}:sha-${SHA}@${DIGEST}"
echo "reference=${reference}" >> "$GITHUB_OUTPUT"
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then echo "Published \`${reference}\`" >> "$GITHUB_STEP_SUMMARY"; fi
