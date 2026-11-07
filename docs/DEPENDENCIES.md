# Dependencias y seguridad — 2026-11-05

Los lockfiles `Cargo.lock`, `apps/desktop/src-tauri/Cargo.lock` y
`apps/desktop/package-lock.json` forman parte del cambio. La instalación usa
`npm ci` y los comandos Rust usan `--locked`. Las dependencias directas npm
usan versiones exactas. Rust 1.99.1 y Node 24.22.1 están fijados en
`rust-toolchain.toml` y `.nvmrc`.

| Dependencia | Versión resuelta |
| --- | --- |
| Rust: `rust_decimal` | 1.43.0 |
| Rust: `serde` | 1.0.229 |
| Rust: `serde_json` | 1.0.154 |
| Rust: `rusqlite` | 0.32.1 |
| Rust: `uuid` | 1.29.0 |
| Rust: `chrono` | 0.4.42 |
| Rust: `thiserror` | 2.0.21 |
| Escritorio: `tauri` | 2.12.5 |
| Escritorio: `tauri-build` | 2.7.4 |
| Escritorio: `tempfile` (configuración atómica) | 3.27.0 |
| Escritorio: `tauri-plugin-dialog` | 2.8.4 |
| Escritorio: `rfd` (selector nativo) | 0.17.2 |
| Escritorio: `iroh` (P2P cifrado) | 1.4.1 |
| Escritorio: `glib` | 0.18.5+cpobras.1 |
| npm: `@tauri-apps/api` | 2.12.4 |
| npm: `fflate` | 0.8.3 |
| npm: `jspdf` | 4.2.1 |
| npm: `read-excel-file` | 9.3.14 |
| npm: `write-excel-file` | 4.1.1 |
| npm: `@playwright/test` | 1.64.1 |
| npm: `@tauri-apps/cli` | 2.12.4 |
| npm: `vite` | 6.4.5 |

## Resultado de la auditoría

- npm: cero vulnerabilidades conocidas en el árbol final.
- RustSec, núcleo: cero vulnerabilidades y sin advertencias.
- RustSec, escritorio: comprobación del 7 de noviembre sobre el lockfile con
  P2P, usando las 1403 entradas de la base local (`cargo audit --no-fetch`):
  cero vulnerabilidades y dos avisos de mantenimiento, `proc-macro-error` 1.0.4
  ([RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html)) y
  `paste` 1.0.15 ([RUSTSEC-2024-0436](https://rustsec.org/advisories/RUSTSEC-2024-0436.html)).
  No se agregó una regla de ignore ni se actualizó la base remota para este check.
- El problema de GLib
  [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
  se corrigió mediante el backport local documentado en
  [vendor/README.md](../vendor/README.md). El lockfile selecciona explícitamente
  ese origen local; la prueba de iteración usa GLib con optimización nivel 3.
  Un paquete local no queda cubierto por el catálogo de versiones de crates.io:
  la evidencia del arreglo es el parche cotejado con el mantenedor y su regresión,
  además del resultado de la herramienta de auditoría.

Los informes reflejan la base de avisos consultada durante esta sesión. Los
comandos para repetirlos están en el README. No se deshabilitó TLS, validación
de firmas ni comprobación de checksums. El artefacto GLib original y el artefacto
oficial corregido se verificaron con sus checksums antes del backport.

## Límites y mantenimiento

La advertencia de mantenimiento de `proc-macro-error` requiere seguimiento en
futuras actualizaciones de Tauri/GTK. Las advertencias de estilo/lifetimes del
GLib compatible antiguo con el compilador nuevo no se ocultaron mediante flags
globales. El backport se debe retirar cuando la pila nativa admita una versión
upstream corregida; no debe sustituirse por una actualización mayor de GLib sin
volver a verificar la compatibilidad GTK y los tests nativos.
