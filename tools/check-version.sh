#!/usr/bin/env bash
# 版本号必须只有一个事实：package.json / Cargo.toml / tauri.conf.json。
# 可选第一个参数是发布 tag；`v0.8.0-beta.1` 必须对应三份文件里的 `0.8.0-beta.1`。
set -euo pipefail
cd "$(dirname "$0")/.."

pkg=$(node -p 'require("./package.json").version')
cargo=$(sed -n 's/^version *= *"\([^"]*\)"/\1/p' src-tauri/Cargo.toml | head -1)
tauri=$(node -p 'require("./src-tauri/tauri.conf.json").version')

echo "package.json:           $pkg"
echo "src-tauri/Cargo.toml:   $cargo"
echo "src-tauri/tauri.conf:   $tauri"

[ "$pkg" = "$cargo" ] || { echo "FAIL: Cargo.toml version differs from package.json" >&2; exit 1; }
[ "$pkg" = "$tauri" ] || { echo "FAIL: tauri.conf.json version differs from package.json" >&2; exit 1; }

if [ "${1:-}" != "" ]; then
  tag=${1#v}
  [ "$tag" = "$pkg" ] || {
    echo "FAIL: tag $1 does not match source version $pkg" >&2
    exit 1
  }
fi

echo "OK: versions match: $pkg"
