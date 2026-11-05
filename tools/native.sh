#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
workspace=$(dirname -- "$repo")
docker_args=(--host=unix:///var/run/docker.sock)
if [[ ${1:-} == image ]]; then
  : "${CODEX_PROXY_CERT:?Set CODEX_PROXY_CERT to the proxy CA certificate}"
  exec docker "${docker_args[@]}" build --secret "id=proxy_ca,src=$CODEX_PROXY_CERT" \
    -f "$repo/tools/Dockerfile.native" -t cpobras-native:dev "$repo"
fi
if [[ $# == 0 ]]; then set -- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked; fi
exec docker "${docker_args[@]}" run --rm --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$workspace,dst=/workspace" \
  --mount type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/run/cpobras-ca.pem,readonly \
  -e CARGO_HOME=/workspace/.cargo -e RUSTUP_HOME=/workspace/.rustup \
  -e CARGO_HTTP_CAINFO=/run/cpobras-ca.pem -e SSL_CERT_FILE=/run/cpobras-ca.pem \
  -e CARGO_BUILD_JOBS=4 -w "/workspace/$(basename -- "$repo")" \
  -e XDG_DATA_HOME=/tmp/cpobras-data -e XDG_CONFIG_HOME=/tmp/cpobras-config \
  -e XDG_CACHE_HOME=/tmp/cpobras-cache \
  -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 \
  cpobras-native:dev bash -c 'export PATH=/workspace/.cargo/bin:$PATH; exec "$@"' -- "$@"
