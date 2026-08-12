#!/usr/bin/env bash
set -euo pipefail

[[ $PREVIEW_REPOSITORY =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]
[[ $PREVIEW_PACKAGE =~ ^[A-Za-z0-9_.-]+$ ]]
if [[ -n $PREVIEW_PR_NUMBER ]]; then [[ $PREVIEW_PR_NUMBER =~ ^[0-9]+$ ]]; fi
for pr in $PREVIEW_OPEN_PR_NUMBERS; do [[ $pr =~ ^[0-9]+$ ]]; done

owner="${PREVIEW_REPOSITORY%%/*}"
owner_type="$(gh api "/users/$owner" --jq .type)"
case "$owner_type" in
  Organization) owner_path="orgs/$owner" ;;
  User) owner_path="users/$owner" ;;
  *) echo "Unsupported GitHub owner type: $owner_type" >&2; exit 1 ;;
esac
package="$(jq -rn --arg value "$PREVIEW_PACKAGE" '$value | @uri')"
endpoint="/$owner_path/packages/container/$package/versions"
versions="$(gh api --paginate --slurp "${endpoint}?per_page=100")"

mapfile -t version_ids < <(
  jq -r --arg pr "$PREVIEW_PR_NUMBER" --arg open " $PREVIEW_OPEN_PR_NUMBERS " '
    def preview: test("^preview-pr-[0-9]+-sha-[0-9a-f]{40}$");
    add[]
    | .metadata.container.tags as $tags
    | select(($tags | length) > 0 and all($tags[]; preview))
    | select(
        if $pr != "" then any($tags[]; startswith("preview-pr-\($pr)-sha-"))
        else all($tags[]; capture("^preview-pr-(?<pr>[0-9]+)-sha-").pr as $tag_pr | ($open | contains(" \($tag_pr) ") | not))
        end
      )
    | .id
  ' <<< "$versions"
)

for version_id in "${version_ids[@]}"; do
  gh api --method DELETE "${endpoint}/${version_id}"
  echo "Deleted preview package version ${version_id}"
done
