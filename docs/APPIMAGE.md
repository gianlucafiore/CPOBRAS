# AppImage para Linux

## Descargar y ejecutar

En [Releases](https://github.com/gianlucafiore/CPOBRAS/releases), descargá
`CPOBRAS_0.1.1_amd64.AppImage`. Podés copiarlo por pendrive o descargar el mismo
archivo en ambos equipos. Está destinado a Linux x86-64, en particular Mint
21/22 y Ubuntu 22.04/24.04. No es un paquete para ARM, Windows o macOS.

Hacé clic derecho sobre el archivo, abrí **Propiedades → Permisos**, activá
**Permitir ejecutar como programa** y abrilo con doble clic. No se necesita
instalar el código fuente ni herramientas de programación.

Si aparece un error de FUSE, puede abrirse sin instalar FUSE:

```bash
chmod +x CPOBRAS_0.1.1_amd64.AppImage
./CPOBRAS_0.1.1_amd64.AppImage --appimage-extract-and-run
```

El proveedor de archivos de algunas distribuciones muestra la opción **Ejecutar**
en el menú contextual en lugar de abrirlo directamente con doble clic.

## Datos y actualización

Los datos se guardan en el directorio de la aplicación del usuario, normalmente
`~/.local/share/ar.cpobras.desktop`. El AppImage no incluye bases personales,
respaldos, claves o vinculaciones P2P. Una instalación nueva empieza con sus
propios datos; para observar una obra se usa una invitación P2P.

Cambiar el archivo AppImage por una versión nueva conserva los datos. Cerrá la
aplicación antes de cambiarlo y generá antes una copia desde **Copias de seguridad**.
No hay actualización automática ni firma digital de distribución en esta versión.

El archivo `SHA256SUMS` de la misma Release permite comprobar la descarga:

```bash
sha256sum -c SHA256SUMS
```

## Construcción reproducible

La versión y los lockfiles se mantienen en `package.json`, `Cargo.toml` y
`tauri.conf.json`. El comando es:

```bash
cd apps/desktop
npm ci
npm run package:linux
```

El script compila el frontend, ejecuta la compilación nativa con `--locked` y
produce el AppImage en `src-tauri/target/release/bundle/appimage/`. El runtime
oficial de AppImage se descarga y comprueba con el SHA-256 fijado en
`tools/package-linux.sh`; si cambia el archivo upstream, la construcción se
detiene para revisarlo en lugar de aceptar un binario distinto.

La distribución se construye sobre Ubuntu 22.04 (glibc 2.35), usando
`tools/Dockerfile.appimage` o el workflow `Linux AppImage release`. Construir en
un sistema con glibc más nueva reduce la compatibilidad con otras computadoras.
WebKit/GTK y el framework multimedia se empaquetan mediante el bundler de Tauri.
El sistema anfitrión sigue aportando el kernel, la sesión gráfica y los controladores.

## Publicación

Al publicar una etiqueta `v0.1.1`, el workflow de GitHub:

1. Comprueba que la etiqueta coincida con la versión de la aplicación.
2. Compila en Ubuntu 22.04 y ejecuta los tests del frontend.
3. Abre el AppImage real en un contenedor Ubuntu 22.04 sin Node, Rust ni WebKit
   del sistema, usando Xvfb y su propio runtime sin FUSE.
4. Genera `SHA256SUMS` y guarda también un artefacto de Actions.
5. Crea una Release en borrador, carga los archivos y la publica al terminar.

Si falla la construcción o el arranque, no se publica la Release. El workflow
puede volver a ejecutarse para una etiqueta existente; una versión ya publicada
no se reemplaza. Las notas de cada versión están en `docs/releases/`.

Prueba local del paquete ya construido, con Xvfb, DBus y scrot instalados:

```bash
bash tools/smoke-appimage.sh ruta/al/archivo.AppImage
```
