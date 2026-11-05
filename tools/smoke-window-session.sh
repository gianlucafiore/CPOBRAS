#!/usr/bin/env bash
set -euo pipefail
: "${CPOBRAS_SMOKE_OUTPUT:?Run tools/smoke-window.sh}"
apps/desktop/src-tauri/target/debug/cpobras-desktop > "$CPOBRAS_SMOKE_OUTPUT/startup.log" 2>&1 &
app_pid=$!
cleanup() { kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; }
trap cleanup EXIT
for attempt in $(seq 1 80); do
  kill -0 "$app_pid" 2>/dev/null || { cat "$CPOBRAS_SMOKE_OUTPUT/startup.log"; exit 1; }
  xwininfo -root -tree > "$CPOBRAS_SMOKE_OUTPUT/windows.txt"
  if grep -q 'CPOBRAS' "$CPOBRAS_SMOKE_OUTPUT/windows.txt"; then
    sleep 2
    scrot "$CPOBRAS_SMOKE_OUTPUT/window.png"
    cat "$CPOBRAS_SMOKE_OUTPUT/windows.txt"
    exit 0
  fi
  sleep 0.25
done
cat "$CPOBRAS_SMOKE_OUTPUT/startup.log"
exit 1
