#!/usr/bin/env bash
set -euo pipefail

if [[ -n "$DOKPLOY_REGISTRY_USERNAME" || -n "$DOKPLOY_REGISTRY_PASSWORD" || -n "$DOKPLOY_REGISTRY_URL" ]]; then
  if [[ -z "$DOKPLOY_REGISTRY_USERNAME" || -z "$DOKPLOY_REGISTRY_PASSWORD" || -z "$DOKPLOY_REGISTRY_URL" ]]; then
    echo "registry-url, registry-username, and registry-password must be provided together" >&2
    exit 1
  fi
fi

provider_body="$(
  jq --null-input \
    --arg applicationId "$DOKPLOY_APPLICATION_ID" \
    --arg dockerImage "$DOKPLOY_IMAGE" \
    --arg registryUrl "$DOKPLOY_REGISTRY_URL" \
    --arg username "$DOKPLOY_REGISTRY_USERNAME" \
    --arg password "$DOKPLOY_REGISTRY_PASSWORD" \
    '{
      applicationId: $applicationId,
      dockerImage: $dockerImage,
      registryUrl: ($registryUrl | select(length > 0) // null),
      username: ($username | select(length > 0) // null),
      password: ($password | select(length > 0) // null)
    }'
)"

curl --fail-with-body \
  --request POST \
  --header "x-api-key: ${DOKPLOY_API_KEY}" \
  --header "Content-Type: application/json" \
  --data "$provider_body" \
  "${DOKPLOY_URL%/}/api/application.saveDockerProvider"

curl --fail-with-body \
  --request POST \
  --header "x-api-key: ${DOKPLOY_API_KEY}" \
  --header "Content-Type: application/json" \
  --data "$(jq --null-input --arg applicationId "$DOKPLOY_APPLICATION_ID" '{ applicationId: $applicationId }')" \
  "${DOKPLOY_URL%/}/api/application.deploy"

if [[ -n ${GITHUB_OUTPUT:-} ]]; then
  echo "image-reference=${DOKPLOY_IMAGE}" >> "$GITHUB_OUTPUT"
fi
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  echo "Deploying \`${DOKPLOY_IMAGE}\`" >> "$GITHUB_STEP_SUMMARY"
fi
