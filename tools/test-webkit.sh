#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
port="${WEBKIT_E2E_PORT:-5274}"
driver_port="${WEBKIT_DRIVER_PORT:-4445}"
log_dir="$(mktemp -d)"
vite_pid=""
driver_pid=""

cleanup() {
  if [[ -n "$driver_pid" ]]; then kill "$driver_pid" 2>/dev/null || true; fi
  if [[ -n "$vite_pid" ]]; then kill "$vite_pid" 2>/dev/null || true; fi
  rm -rf "$log_dir"
}
trap cleanup EXIT

command -v WebKitWebDriver >/dev/null || {
  echo "WebKitWebDriver is required. On Fedora install webkitgtk6.0-devel." >&2
  exit 2
}

(
  cd "$repo"
  exec node node_modules/vite/bin/vite.js \
    --host 127.0.0.1 \
    --port "$port" \
    >"$log_dir/vite.log" 2>&1
) &
vite_pid=$!

WebKitWebDriver --host=127.0.0.1 --port="$driver_port" >"$log_dir/driver.log" 2>&1 &
driver_pid=$!

for _ in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:$port/e2e/index.html" >/dev/null 2>&1; then break; fi
  sleep 0.1
done

WEBKIT_DRIVER_URL="http://127.0.0.1:$driver_port" \
WEBKIT_E2E_URL="http://127.0.0.1:$port/e2e/index.html?webkitProbe=1" \
node "$repo/e2e/webkit.mjs"
