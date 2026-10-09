# CPOBRAS

Sistema de cómputos, presupuestos y gestión de obras para Argentina.

## Arquitectura
Local-first: dominio Rust independiente de la interfaz; SQLite para almacenamiento local. La sincronización colaborativa se incorporará mediante un servicio de cambios con auditoría, sin compartir el archivo SQLite por red.

## Estado
Primer esqueleto de dominio y presupuesto (no es una aplicación gráfica terminada).

## Desarrollo
Instalar Rust estable, luego ejecutar:

```bash
cargo fmt --all -- --check
cargo test --workspace
```

No se han ejecutado estas pruebas desde ChatGPT. Se validarán en CI.
