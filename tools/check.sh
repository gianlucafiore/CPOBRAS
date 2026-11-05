#!/usr/bin/env bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo"
cargo fmt --all -- --check
cargo test --workspace --locked
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
npm --prefix apps/desktop test
npm --prefix apps/desktop run build
npm --prefix apps/desktop run test:browser
if pkg-config --exists webkit2gtk-4.1 gtk+-3.0; then
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
else
  bash tools/native.sh cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
fi
