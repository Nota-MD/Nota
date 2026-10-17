#!/usr/bin/env bash
# 前端测试名册从 tests/*.test.ts 自动生成。此前手工 for 列表漏跑过测试；
# 这里不再维护第二张名单。特殊入口只列构建开关，不列文件名。
set -euo pipefail
cd "$(dirname "$0")/.."

outdir=$(mktemp -d "${TMPDIR:-/tmp}/nota-frontend-tests.XXXXXX")
trap 'rm -rf "$outdir"' EXIT
total=0
files=0

for file in tests/*.test.ts; do
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

echo "前端测试：$files 份，至少记录到 $total 条断言，全部 exit=0"
