#!/usr/bin/env bash
# The default suite is discovered from tests/*.test.ts. An explicit file list
# enables the lightweight verification profile without maintaining a second
# test registry. Per-file build flags remain limited to build requirements.
set -euo pipefail
cd "$(dirname "$0")/.."

outdir=$(mktemp -d "${TMPDIR:-/tmp}/nota-frontend-tests.XXXXXX")
trap 'rm -rf "$outdir"' EXIT
total=0
files=0

if [ "$#" -gt 0 ]; then
  test_files=("$@")
else
  mapfile -d '' test_files < <(printf '%s\0' tests/*.test.ts)
fi

for file in "${test_files[@]}"; do
  [ -f "$file" ] || { echo "Missing test file: $file" >&2; exit 1; }
  name=$(basename "$file" .test.ts)
  flags=()
  if grep -q 'from "@/' "$file"; then
    flags+=(--alias:@=./src)
  fi
  case "$name" in
    share-card) flags+=(--alias:@=./src --loader:.svg=text) ;;
  esac
  npx esbuild "$file" --bundle --platform=node --format=esm \
    "${flags[@]}" --outfile="$outdir/$name.mjs" >/dev/null
  output=$(node "$outdir/$name.mjs" 2>&1)
  code=$?
  printf '%s\n' "$output"
  [ "$code" -eq 0 ] || { echo "FAIL $name exit=$code" >&2; exit 1; }
  count=$(printf '%s\n' "$output" | grep -v '^[[:space:]]*$' \
    | tail -1 | grep -oE '[0-9]+' | head -1 || true)
  total=$((total + ${count:-0}))
  files=$((files + 1))
done

echo "Frontend tests: $files suites, at least $total assertions recorded, all exit=0"
