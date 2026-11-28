#!/usr/bin/env bash
set -euo pipefail

image=${1:?usage: repair-linux-appimage.sh <image> <target>}
target=${2:?usage: repair-linux-appimage.sh <image> <target>}
repo=$(cd "$(dirname "$0")/.." && pwd)
image=$(readlink -f "$image")

case "$target" in
  aarch64*) arch=aarch64 ;;
  x86_64*) arch=x86_64 ;;
  *)
    echo "unsupported AppImage target: $target" >&2
    exit 2
    ;;
esac

work=$(mktemp -d "${TMPDIR:-/tmp}/nota-appimage-repair.XXXXXX")
trap 'rm -rf "$work"' EXIT

(
  cd "$work"
  "$image" --appimage-extract >/dev/null
)

node "$repo/tools/patch-linuxdeploy-gtk-hook.mjs" \
  "$work/squashfs-root/apprun-hooks/linuxdeploy-plugin-gtk.sh"

plugin=$(find "${XDG_CACHE_HOME:-$HOME/.cache}/tauri" -maxdepth 1 \
  -type f -name 'linuxdeploy-plugin-appimage*.AppImage' -print -quit)
[[ -n "$plugin" ]] || {
  echo "linuxdeploy AppImage plugin is missing from the Tauri cache" >&2
  exit 2
}

(
  cd "$work"
  ARCH="$arch" "$plugin" --appimage-extract-and-run \
    --appdir="$work/squashfs-root" >/dev/null
)

mapfile -d '' generated < <(
  find "$work" -maxdepth 1 -type f -name '*.AppImage' -print0 | sort -z
)
[[ "${#generated[@]}" -eq 1 ]] || {
  echo "expected one repaired AppImage, found ${#generated[@]}" >&2
  exit 2
}

install -m 0755 "${generated[0]}" "${image}.repaired"
mv -f "${image}.repaired" "$image"
echo "repaired AppImage: $image"
