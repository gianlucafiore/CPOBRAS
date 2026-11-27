# Desarrollo de CPOBRAS

Si querés usar la aplicación, podés descargar el ejecutable y seguir la [guía de primeros pasos](../README.md). Esta página reúne los comandos para trabajar con el código fuente.

## Instalar dependencias

Usá Rust 1.99.1 con `rustfmt` (fijado en `rust-toolchain.toml`), Node.js 24
(fijado en `.nvmrc`) y npm. En Debian o Ubuntu instalá las dependencias de
Tauri con permisos de administrador.

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev \
  libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev libglib2.0-bin
```

Instalá las dependencias de JavaScript desde la raíz del repositorio.

```bash
cd apps/desktop
npm ci
cd ../..
```

Los lockfiles de Cargo y npm se versionan. Usá `npm ci` y `cargo --locked` para
reproducir la resolución validada. Windows requiere las herramientas de C++ de
Visual Studio y WebView2. macOS requiere las herramientas de Xcode.

## Arrancar el escritorio

Abrí una terminal en la raíz del repositorio y ejecutá estos comandos.

```bash
cd apps/desktop
npm run tauri dev
```

Este comando arranca Vite y la ventana nativa. Para detenerlo, usá `Ctrl+C` en
la terminal. Guardá la base SQLite en el directorio local de datos de CPOBRAS.

Para trabajar en la interfaz web podés arrancar Vite por separado.

```bash
cd apps/desktop
npm run dev
```

El frontend web necesita el backend Tauri para operar con la base de datos. Para usar las operaciones nativas, ejecutá `npm run tauri dev`.

## Compilar

Para compilar el frontend, ejecutá el build de Vite.

```bash
cd apps/desktop
npm run build
```

Para compilar el ejecutable nativo por sí solo, usá `--no-bundle`.

```bash
cd apps/desktop
npm run tauri build -- --no-bundle
```

Para generar un AppImage de Linux, ejecutá el empaquetado.

```bash
cd apps/desktop
npm run package:linux
```

El archivo queda en `apps/desktop/src-tauri/target/release/bundle/appimage/`.
Para distribuirlo se construye sobre Ubuntu 22.04, conservando compatibilidad
con Linux Mint 21/22. La compilación hecha en una distribución más nueva puede
requerir bibliotecas que otra computadora todavía no tenga.

Para compilar el ejecutable y los instaladores de la plataforma actual, usá el build de Tauri.

```bash
cd apps/desktop
npm run tauri build
```

El resultado nativo queda bajo `apps/desktop/src-tauri/target/release/`.
Los instaladores quedan en el subdirectorio `bundle/`. La generación de
instaladores y la firma de distribución requieren validación propia de cada
plataforma.

## Pruebas y comprobaciones

Desde la raíz del repositorio podés verificar el formato y ejecutar las pruebas de Rust.

```bash
cargo fmt --all -- --check
cargo test --workspace --locked
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

Desde `apps/desktop` podés comprobar el frontend. Las pruebas de navegador
usan Chromium. Si está en una ruta personalizada, configurá `PW_CHROMIUM_PATH`.

```bash
npm test
npm run build
npm run test:browser
npm audit
```

Para auditar las dependencias de Rust, ejecutá estos comandos desde la raíz.

```bash
cargo install cargo-audit --locked
cargo audit --file Cargo.lock
cargo audit --file apps/desktop/src-tauri/Cargo.lock
```

## Entorno en la nube: compilación nativa con Docker

Si el equipo no permite instalar las bibliotecas de Linux, `tools/Dockerfile.native`
prepara un contenedor de pruebas. En este entorno los directorios de Rust se
encuentran en `/workspace/.cargo` y `/workspace/.rustup`.

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

Desde la raíz del repositorio podés ejecutar juntas las comprobaciones de desarrollo.

```bash
bash tools/check.sh
```

El conjunto usa Chromium para las pruebas de navegador y necesita las bibliotecas
nativas de Tauri o el contenedor. Las pruebas del navegador usan un puente IPC
de prueba. La integración con el backend se comprueba en Tauri.

## Referencias

- [Aplicación de escritorio](../apps/desktop/README.md)
- [Decisiones de arquitectura](../architecture/DECISIONS.md)
- [Validación y límites conocidos](VALIDATION.md)
- [Auditoría de dependencias](DEPENDENCIES.md)
- [Plan de desarrollo](AUDIT_PLAN.md)
- [Cómo contribuir](../CONTRIBUTING.md)
