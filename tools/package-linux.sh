#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[ "$(uname -m)" = x86_64 ] || { echo 'Este paquete está configurado para Linux x86-64.' >&2; exit 1; }
cache="${XDG_CACHE_HOME:-$HOME/.cache}/cpobras-packaging"
mkdir -p "$cache"
runtime="$cache/runtime-x86_64"
# Official AppImage type-2 runtime selected and checked for release 0.1.1.
expected=617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46
valid_runtime(){ [ -f "$runtime" ] && [ "$(sha256sum "$runtime" | cut -d' ' -f1)" = "$expected" ]; }
if ! valid_runtime; then
  download=$(mktemp "$cache/.runtime.XXXXXX")
  trap 'rm -f "$download"' EXIT
  curl --fail --location --retry 2 https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-x86_64 -o "$download"
  printf '%s  %s\n' "$expected" "$download" | sha256sum -c -
  mv "$download" "$runtime"
  trap - EXIT
fi
export LDAI_RUNTIME_FILE="$runtime"
export APPIMAGE_EXTRACT_AND_RUN=1
cd "$repo/apps/desktop"
exec npm run tauri -- build --bundles appimage -- --locked
