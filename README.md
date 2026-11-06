# CPOBRAS

Sistema local de cómputos, presupuestos y gestión de obras para Argentina.
Rust concentra las reglas de negocio; SQLite guarda los datos en el equipo y
Tauri 2 presenta la interfaz. Los importes se calculan con precisión decimal.

## Actualizar y probar en Linux Mint

Desde la carpeta del repositorio:

```bash
git switch develop
git pull --ff-only origin develop
cd apps/desktop
npm ci
npm run tauri dev
```

La base existente se migra automáticamente; no hace falta borrarla. Para compilar
el ejecutable en lugar de arrancar en desarrollo, desde `apps/desktop`:

```bash
npm run tauri build -- --no-bundle
```

En el panel de la partida, **Agregar insumo** abre un formulario para un solo
componente. Usá doble clic o **Editar** sobre uno existente para modificarlo.
El buscador se abre al pulsarlo o escribir y acepta coincidencias aproximadas. La última opción **Agregar** abre una segunda ventana para crear el
insumo y seleccionarlo al guardar, conservando la composición. Ninguna ventana
se cierra al pulsar afuera; descartar cambios requiere confirmación. Los campos
de unidad permiten buscar unidades habituales o de la biblioteca y agregar una
nueva en otra ventana, que queda seleccionada al guardarla. Las listas se cierran
al seleccionar o hacer clic afuera; los formularios permanecen abiertos.

Borrar una partida en borrador elimina sus metrados y composición, conserva el
catálogo y otras versiones, y mantiene referencias históricas de sus documentos.

En **Gestión de obra** están las etapas 6 a 10: compras/stock, producción,
certificaciones, finanzas y tablero. Elegí obra y fecha de corte. La guía de
prueba, el circuito de documentos y las reglas de cálculo están en
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Instalar dependencias

Requisitos: Rust 1.99.1 con `rustfmt` (fijado en `rust-toolchain.toml`, instalable con rustup), Node.js 24 (versión fijada en `.nvmrc`) y npm. En Linux también
se necesitan las bibliotecas nativas de Tauri. En Debian/Ubuntu, con permisos
administrativos:

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev \
  libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev
```

Desde la raíz del repositorio:

```bash
cd apps/desktop
npm ci
cd ../..
```

Los lockfiles de Cargo y npm se versionan. Usá `npm ci` y `cargo --locked` para
reproducir la resolución validada. Windows requiere las herramientas de C++ de
Visual Studio y WebView2; macOS requiere las herramientas de Xcode. Las pruebas
nativas de esta sesión se ejecutan en Linux, no acreditan Windows ni macOS.

## Arrancar el escritorio

Desde la raíz:

```bash
cd apps/desktop
npm run tauri dev
```

Este comando arranca Vite y la ventana nativa. Para detenerlo, usá `Ctrl+C` en
la terminal. La base se guarda en el directorio de datos de CPOBRAS del usuario.
No compartas el archivo SQLite por una carpeta de red.

Solo para desarrollar los recursos web:

```bash
cd apps/desktop
npm run dev
```

El frontend web necesita el backend Tauri para operar con la base de datos;
servir los archivos con Vite por sí solo no habilita las operaciones nativas.

## Compilar

Frontend:

```bash
cd apps/desktop
npm run build
```

Ejecutable nativo sin instalador:

```bash
cd apps/desktop
npm run tauri build -- --no-bundle
```

Ejecutable e instaladores de la plataforma actual:

```bash
cd apps/desktop
npm run tauri build
```

El resultado nativo queda bajo `apps/desktop/src-tauri/target/release/`.
Los instaladores quedan en el subdirectorio `bundle/`. La generación de
instaladores y la firma de distribución requieren validación propia de cada
plataforma.

## Pruebas y comprobaciones

Desde la raíz:

```bash
cargo fmt --all -- --check
cargo test --workspace --locked
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

Desde `apps/desktop` (las pruebas de navegador usan Chromium; configurá `PW_CHROMIUM_PATH` si está en otra ruta):

```bash
npm test
npm run build
npm run test:browser
npm audit
```

Auditoría de Rust, desde la raíz:

```bash
cargo install cargo-audit --locked
cargo audit --file Cargo.lock
cargo audit --file apps/desktop/src-tauri/Cargo.lock
```

## Entorno en la nube: compilación nativa con Docker

Si el equipo no permite instalar las bibliotecas de Linux, `tools/Dockerfile.native`
prepara un contenedor de pruebas. En este entorno los directorios de Rust se
encuentran en `/workspace/.cargo` y `/workspace/.rustup`:

```bash
export CARGO_HOME=/workspace/.cargo
export RUSTUP_HOME=/workspace/.rustup
export PATH="$CARGO_HOME/bin:$PATH"
export CARGO_BUILD_JOBS=4
bash tools/native.sh image
bash tools/native.sh cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
bash tools/native.sh cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --features custom-protocol --locked
bash tools/native.sh bash tools/smoke-window.sh
```

La construcción de la imagen usa `CODEX_PROXY_CERT`, suministrado por el entorno,
y conserva la verificación TLS. Hace falta acceso al daemon local de Docker.
El contenedor permite validar código nativo sin instalar APT en el host; no
presenta una ventana en el escritorio del usuario.

## Prueba rápida de los avances

1. En **Clientes**, creá un comitente; luego creá una obra con su moneda base.
2. En **Organización**, registrá empresas, establecimientos, usuarios/roles,
   proveedores, contactos, contratos, centros de costos, unidades y rubros.
   La ficha de obra permite cargar ubicación, responsable, fechas y porcentajes
   económicos predeterminados para los presupuestos nuevos.
3. En **Insumos** y **ACU**, cargá recursos y análisis. Abrí una obra, creá un
   presupuesto y agregá rubros, subrubros, partidas y metrados.
   En la grilla, arrastrá el asa **⋮⋮** para reordenar partidas o moverlas a un
   rubro. **Doble clic**, **Enter** o **clic derecho → Editar partida** permiten
   editar. Para construir un precio, seleccioná la partida, abrí su pestaña
   **Insumos** y pulsá **Asignar**; no hace falta crear antes un ACU.
   Los popups conservan los datos al pulsar fuera. Para cerrar con cambios sin
   guardar, confirmá el descarte mediante **Cerrar**, la cruz o **Escape**.
4. En **Herramientas / exportar**, probá edición masiva, ordenamiento,
   duplicación de partidas, fórmulas, plantillas, Excel, CSV, JSON y PDF.
   Las importaciones crean un presupuesto nuevo. Los archivos generados quedan
   en `exports/`, dentro del directorio de datos de la aplicación; la pantalla
   muestra su ruta exacta.
5. En **Costos y precios**, creá listas por proveedor/moneda/zona y cargá precios
   con fecha y fuente. Probá ACU compuestos, rendimientos, desperdicios,
   escenarios de variación y conversiones con cotización explícita.
6. En **Planificación**, seleccioná una obra, configurá días laborables y
   feriados, cargá tareas/hitos, dependencias y recursos. Podés arrastrar una barra
   del Gantt o cambiar su duración desde el extremo. Guardá una línea base,
   registrá avances y compará la curva S, las holguras y la ruta crítica.
7. En **Copias de seguridad**, creá una copia, verificá la integridad y probá
   restaurarla. La restauración crea antes una copia del estado actual.

Para ejecutar juntas las comprobaciones de desarrollo, desde la raíz:

```bash
bash tools/check.sh
```

Se requiere Chromium para las pruebas de navegador y las bibliotecas Tauri o
el contenedor nativo ya preparado. Los recorridos de Chromium usan un puente IPC
de prueba; la integración real del backend se comprueba por separado con Tauri.

## Alcance y documentación

El trabajo de esta sesión se mantiene en la rama local `develop`; no se han
publicado los cambios ni modificado la rama remota `main`.
El alcance acordado son las etapas 1 a 5, con 43 subítems. El seguimiento está en
[el plan de desarrollo](docs/AUDIT_PLAN.md). Consultá ese documento para distinguir
funcionalidades verificadas de trabajo todavía pendiente.

- [Decisiones de arquitectura](architecture/DECISIONS.md).
- [Aplicación de escritorio](apps/desktop/README.md).
- [Validación y límites conocidos](docs/VALIDATION.md).
- [Auditoría de dependencias](docs/DEPENDENCIES.md).
