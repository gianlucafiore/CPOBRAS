# CPOBRAS Desktop (Tauri 2)

Primera interfaz nativa para Linux, Windows y macOS. Permite registrar y listar clientes y obras con SQLite en el directorio de datos de la aplicación.

## Requisitos
- Rust estable y Cargo.
- Node.js LTS y npm.
- Dependencias del sistema necesarias para compilar Tauri 2 (WebKitGTK en Linux).

## Desarrollo
```bash
cd apps/desktop
npm install
npm run tauri dev
```

## Empaquetar
```bash
npm run tauri build
```

El backend usa `cpobras-core` y `cpobras-storage`. La base se guarda bajo el directorio de datos propio de CPOBRAS; no se comparte por una carpeta de red.

**Alcance:** esta es una interfaz inicial de clientes y obras, no el cotizador completo. Presupuestos y ACU ya existen en el núcleo Rust, pero todavía no tienen formularios en esta pantalla.
