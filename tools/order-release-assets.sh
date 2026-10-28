#!/usr/bin/env bash
# Re-upload Release assets in the order shown on GitHub:
# Windows x64, Linux x64, Windows ARM64, Linux ARM64, then index manifests.
#
# GitHub keeps upload order, while the matrix build jobs upload concurrently.
# This runs only after every build artifact has reached the draft Release.
set -euo pipefail

tag=${1:?usage: order-release-assets.sh <tag> [assets-dir]}
dir=${2:-dist}
repo=${GITHUB_REPOSITORY:-Nota-MD/Nota}

find_group() {
  find "$dir" -type f \( "$@" \) -print0 | sort -z
}

mapfile -d '' win_x64 < <(find_group -name '*_x64-setup.exe' -o -name '*_x64-portable.zip')
mapfile -d '' linux_x64 < <(find_group -name '*_amd64.deb' -o -name '*x86_64.rpm' -o -name '*_amd64.AppImage')
mapfile -d '' win_arm64 < <(find_group -name '*_arm64-setup.exe' -o -name '*_arm64-portable.zip')
mapfile -d '' linux_arm64 < <(find_group -name '*_arm64.deb' -o -name '*aarch64.rpm' -o -name '*_aarch64.AppImage')

for pair in "Windows x64:${#win_x64[@]}:2:required" "Linux x64:${#linux_x64[@]}:3:required" \
            "Windows ARM64:${#win_arm64[@]}:2:optional" "Linux ARM64:${#linux_arm64[@]}:3:optional"; do
  IFS=: read -r label actual expected requirement <<<"$pair"
  if [[ "$actual" == "$expected" ]]; then
    continue
  fi
  if [[ "$requirement" == "optional" && "$actual" == "0" ]]; then
    echo "release ordering: $label not built locally; skipping"
    continue
  fi
  echo "release ordering: expected $expected $label assets, found $actual" >&2
  exit 1
done

for name in BUILD-INFO.json SHA256SUMS.txt latest.json; do
  [[ -f "$dir/$name" ]] || {
    echo "release ordering: missing $dir/$name" >&2
    exit 1
  }
done

declare -A expected=()
for file in "${win_x64[@]}" "${linux_x64[@]}" "${win_arm64[@]}" "${linux_arm64[@]}" \
            "$dir/BUILD-INFO.json" "$dir/SHA256SUMS.txt" "$dir/latest.json"; do
  expected[$(basename "$file")]=1
done

while IFS=$'\t' read -r id name; do
  [[ -n "$id" ]] || continue
  if [[ -z "${expected[$name]:-}" ]]; then
    echo "release ordering: unexpected existing asset $name" >&2
    exit 1
  fi
  gh api --method DELETE "repos/$repo/releases/assets/$id" >/dev/null
done < <(gh release view "$tag" --repo "$repo" --json assets \
  --jq '.assets[] | [.id, .name] | @tsv')

upload_group() {
  local file
  for file in "$@"; do
    echo "release ordering: upload $(basename "$file")"
    gh release upload "$tag" "$file" --repo "$repo"
  done
}

upload_group "${win_x64[@]}"
upload_group "${linux_x64[@]}"
if (( ${#win_arm64[@]} )); then upload_group "${win_arm64[@]}"; fi
if (( ${#linux_arm64[@]} )); then upload_group "${linux_arm64[@]}"; fi
upload_group "$dir/BUILD-INFO.json" "$dir/SHA256SUMS.txt"
# latest.json is deliberately the final asset in the list.
upload_group "$dir/latest.json"
