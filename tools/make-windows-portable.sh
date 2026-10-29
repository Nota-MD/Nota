#!/usr/bin/env bash
# Build a single-file, non-elevated Windows portable EXE from a --no-bundle
# release directory. Requires 7z, MinGW-w64 gcc/windres, and 7zr.exe.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
release=${1:?usage: tools/make-windows-portable.sh <release-dir> <output.exe> [version]}
out=${2:?usage: tools/make-windows-portable.sh <release-dir> <output.exe> [version]}
version=${3:-0.12.0-beta}
seven_zipr=${NOTA_7ZR_EXE:-/tmp/lzmasdk/bin/7zr.exe}

for tool in 7z x86_64-w64-mingw32-gcc x86_64-w64-mingw32-windres; do
  command -v "$tool" >/dev/null || {
    echo "missing required tool: $tool" >&2
    exit 2
  }
done
[ -f "$release/nota.exe" ] || { echo "missing $release/nota.exe" >&2; exit 2; }
[ -f "$release/WebView2Loader.dll" ] || { echo "missing $release/WebView2Loader.dll" >&2; exit 2; }
[ -f "$seven_zipr" ] || { echo "missing 7zr.exe: $seven_zipr" >&2; exit 2; }

stage=$(mktemp -d "${TMPDIR:-/tmp}/nota-portable.XXXXXX")
trap 'rm -rf "$stage"' EXIT

mkdir -p "$stage/payload"
cp "$release/nota.exe" "$release/WebView2Loader.dll" "$stage/payload/"
printf 'Nota Portable %s\n' "$version" >"$stage/payload/nota-portable.marker"
cp "$seven_zipr" "$stage/7zr.exe"

(
  cd "$stage/payload"
  7z a -t7z -mx=9 "$stage/payload.7z" . >/dev/null
)
build_id=$(sha256sum "$stage/payload.7z" | cut -c1-12)

mkdir -p "$(dirname "$out")"
x86_64-w64-mingw32-windres \
  -I "$stage" -I "$repo" \
  -i "$repo/tools/windows-portable-launcher.rc" \
  -o "$stage/launcher-res.o"

x86_64-w64-mingw32-gcc \
  -O2 -s -municode -mwindows \
  -DNOTA_VERSION="L\"$version\"" \
  -DNOTA_BUILD_ID="L\"$build_id\"" \
  -o "$out" \
  "$repo/tools/windows-portable-launcher.c" \
  "$stage/launcher-res.o" \
  -lshell32 -lole32

echo "built $out"
