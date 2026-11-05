# GLib security backport

The Tauri Linux stack currently resolves GLib 0.18.5. RustSec advisory
[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
identifies undefined behavior in the forward/backward string Variant iterator.
The compatible GTK dependency constraints do not admit GLib 0.20 directly.

`glib-0.18.5/` is the original crates.io artifact, verified against the SHA-256
recorded in the original Cargo.lock:

```
233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5
```

The changes are limited to:

- `src/variant_iter.rs`: make the C output pointer mutable and pass `&mut p`
  rather than `&p` to `g_variant_get_child`. This exactly matches the corrected
  function in the verified official GLib 0.20.0 crate, referenced by the advisory.
- `Cargo.toml`: add `+cpobras.1` version metadata to identify the local backport.

Original license and copyright files are retained. Original package verification
was completed before extraction and modification. No registry cache or registry
checksum was modified. The desktop manifest selects this source through Cargo's
supported `[patch.crates-io]` mechanism.

`optimized_glib_string_variant_iteration_matches_upstream_fix` tests forward,
reverse and mixed iteration. GLib is compiled with optimization level 3 even in
the development test profile so the regression exercises the optimization-related
failure mode described in the advisory.

Remove this patch when Tauri's Linux dependency chain can use an upstream
release with the same fix. Re-run the native IPC and GLib regression tests when
upgrading. Do not suppress the advisory by adding a global RustSec ignore rule.
