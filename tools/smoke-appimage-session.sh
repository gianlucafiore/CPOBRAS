#!/usr/bin/env bash
set -euo pipefail
: "${CPOBRAS_APPIMAGE_SMOKE_OUTPUT:?}"
: "${CPOBRAS_APPIMAGE_SMOKE_ARTIFACT:?}"
cd "$CPOBRAS_APPIMAGE_SMOKE_OUTPUT"
"$CPOBRAS_APPIMAGE_SMOKE_ARTIFACT" --appimage-extract-and-run > startup.log 2>&1 &
app_pid=$!
cleanup(){ kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; }
trap cleanup EXIT
for attempt in $(seq 1 120); do
  kill -0 "$app_pid" 2>/dev/null || { cat startup.log; exit 1; }
  xwininfo -root -tree > windows.txt
  if grep -q '"CPOBRAS' windows.txt; then
    sleep 3
    kill -0 "$app_pid" 2>/dev/null || { cat startup.log; exit 1; }
    scrot window.png
    cat windows.txt
    exit 0
  fi
  sleep 0.5
done
cat startup.log
exit 1
