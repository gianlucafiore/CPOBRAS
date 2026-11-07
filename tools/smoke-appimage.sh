#!/usr/bin/env bash
# Launch the distributed artifact using its own runtime, without requiring FUSE.
set -euo pipefail
artifact=$(realpath "${1:?Uso: bash tools/smoke-appimage.sh archivo.AppImage}")
output=$(mktemp -d "${TMPDIR:-/tmp}/cpobras-appimage-smoke.XXXXXX")
export XDG_DATA_HOME="$output/data" XDG_CONFIG_HOME="$output/config" XDG_CACHE_HOME="$output/cache"
export CPOBRAS_APPIMAGE_SMOKE_OUTPUT="$output" CPOBRAS_APPIMAGE_SMOKE_ARTIFACT="$artifact"
xvfb-run -a dbus-run-session -- bash "$(dirname "$0")/smoke-appimage-session.sh"
printf 'AppImage smoke artifacts: %s\n' "$output"
