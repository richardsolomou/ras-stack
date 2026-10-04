#!/usr/bin/env bash
set -euo pipefail

if [[ ! "$SPACETIME_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then
  echo 'Expected an exact SpacetimeDB release version' >&2
  exit 1
fi
if [[ ! "$SPACETIME_SHA256" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo 'Expected a SHA-256 archive checksum' >&2
  exit 1
fi
if [[ "$RUNNER_OS" != Linux ]]; then
  echo 'SpacetimeDB setup supports Linux runners' >&2
  exit 1
fi
case "$RUNNER_ARCH" in
  X64) target=x86_64-unknown-linux-gnu ;;
  ARM64) target=aarch64-unknown-linux-gnu ;;
  *) echo "Unsupported runner architecture: $RUNNER_ARCH" >&2; exit 1 ;;
esac

installation="$(mktemp -d "$RUNNER_TEMP/spacetime.XXXXXX")"
complete=false
cleanup() {
  if [[ "$complete" != true ]]; then
    rm -rf "${installation:?}"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
archive="$installation/release.tar.gz"
curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --max-time 120 \
  "https://github.com/clockworklabs/SpacetimeDB/releases/download/v${SPACETIME_VERSION}/spacetime-${target}.tar.gz" \
  --output "$archive"
echo "$SPACETIME_SHA256  $archive" | sha256sum -c -
tar -xzf "$archive" -C "$installation" spacetimedb-cli spacetimedb-standalone
rm "$archive"
chmod +x "$installation/spacetimedb-cli" "$installation/spacetimedb-standalone"
"$installation/spacetimedb-cli" --version
ln -s spacetimedb-cli "$installation/spacetime"
{
  echo "cli-path=$installation/spacetimedb-cli"
  echo "standalone-path=$installation/spacetimedb-standalone"
} >> "$GITHUB_OUTPUT"
echo "$installation" >> "$GITHUB_PATH"
complete=true
