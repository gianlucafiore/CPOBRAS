#!/usr/bin/env bash
set -euo pipefail
output=$(mktemp -d /workspace/cpobras-native-smoke.XXXXXX)
export XDG_DATA_HOME="$output/data"
export XDG_CONFIG_HOME="$output/config"
export XDG_CACHE_HOME="$output/cache"
export CPOBRAS_SMOKE_OUTPUT="$output"
xvfb-run -a dbus-run-session -- bash tools/smoke-window-session.sh
printf 'Native smoke artifacts: %s\n' "$output"
