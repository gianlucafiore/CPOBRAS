# CPOBRAS

Sistema local de cómputos, presupuestos y gestión de obras para Argentina.
Rust concentra las reglas de negocio; SQLite guarda los datos en el equipo y
Tauri 2 presenta la interfaz. Los importes se calculan con precisión decimal.

## Descargar y abrir en otra computadora Linux

Descargá el **AppImage** desde [Releases de GitHub](https://github.com/gianlucafiore/CPOBRAS/releases).
Es un único archivo para Linux x86-64: no necesitás instalar Rust, Node ni Git.

1. Copiá el `.AppImage` a la otra computadora.
2. Clic derecho → **Propiedades → Permisos → Permitir ejecutar como programa**.
3. Abrilo con doble clic.

La versión 0.1.2 está preparada para Linux Mint 21/22 y Ubuntu 22.04/24.04.
Los datos se guardan por usuario fuera del AppImage; no se transfieren con el
programa. Para consultar una obra de otro equipo, usá **Inicio → Vinculación P2P**.
Guía y solución para sistemas sin FUSE: [docs/APPIMAGE.md](docs/APPIMAGE.md).

## Actualizar y probar en Linux Mint

Desde la carpeta del repositorio:

```bash
git switch main
git pull --ff-only origin main
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

## Inicio y obra activa

**Inicio / Obras** concentra clientes, catálogos de insumos y ACU, listas de
precios, organizaciones y sus directorios, cartera global y copias de seguridad. Al abrir
una obra, el menú cambia a sus secciones: presupuesto, determinación de precio, gestión,
planificación y datos de obra. Todas conservan la misma obra; para abrir otra,
volvé a **← Inicio**.

La barra **Presupuesto activo** muestra la versión y si está en borrador o
emitida. Cambiarla pide confirmación y actualiza los informes de esa obra.
Si tenés un documento, ficha, tarea o determinación sin guardar, podés cancelar
la salida y conservar lo cargado. Los documentos históricos indican su
presupuesto de origen. El cronograma pertenece a la obra y sus vínculos con
partidas identifican la versión correspondiente.

## Reutilizar cómputos y precios de insumos

**Patrones de cómputo**, en la grilla del presupuesto, permite copiar rubros y
partidas desde otras obras o patrones guardados, con selección en árbol y opción
con precios o solo cantidades. También copia los metrados y fórmulas. Para crear
un patrón, seleccioná elementos del origen y usá **Guardar selección como patrón**.

Cada insumo tiene un precio único dentro de cada presupuesto. Editarlo recalcula
las partidas que lo usan, conservando sus rendimientos y los precios de otras
versiones. La actualización de la base es automática. Guía y criterios:
[docs/PATTERNS_AND_PRICES.md](docs/PATTERNS_AND_PRICES.md).

## Determinación de precio

Desde un presupuesto, abrí **Determinación de precio** para ordenar y activar
conceptos, aplicar porcentajes sobre costo directo, subtotal o utilidad, y
detallar gastos por grupos e ítems. Permite montos manuales, referencias,
plantillas y exportación. Usá **Guardar determinación** para persistir la vista
previa. Guía de cálculo y prueba: [docs/PRICE_DETERMINATION.md](docs/PRICE_DETERMINATION.md).

## Previsión financiera, certificaciones y acopio

En **Planificación**, definí los cortes de certificación y el plazo de cobro;
los cortes también se marcan directamente en el Gantt. En **Gestión de obra →
Finanzas**, consultá necesidades de materiales por período, pagos de cuadrillas,
vencimientos y capital adicional previsto. Declaración de acopio, anticipos,
alquileres mensuales y conciliación de facturas: [guía de uso](docs/FINANCIAL_PLANNING.md).

## Vinculación P2P de solo lectura

Desde **Inicio → Vinculación P2P**, elegí una obra, indicá el nombre del
observador y pulsá **Crear invitación**. Copiá el código y enviáselo; la otra
persona lo pega en **Invitación del propietario** y pulsa **Vincular obra**.
Podrá consultar presupuestos, costos, gestión, planificación y organización
sin editar tus datos. Cada invitación sirve para un equipo y puede revocarse.

Las actualizaciones son automáticas mientras ambos programas estén conectados.
Sin conexión se conserva la última copia recibida. Usa conexión directa y relay
para atravesar redes distintas sin configurar el router. La prueba con el relay
público está pendiente porque este entorno bloquea su acceso.
Guía, alcance y pruebas: [docs/P2P.md](docs/P2P.md).

## Respaldos automáticos en una carpeta sincronizada

En **Inicio → Copias de seguridad**, pulsá **Elegir carpeta** y seleccioná una carpeta
fija, activá **Crear copias automáticas** y guardá la configuración. Podés elegir
cada 15 minutos, una hora, cuatro horas o un día. **Crear copia ahora** funciona
también con la programación desactivada; **Abrir carpeta** muestra los archivos.

Las copias se generan mientras CPOBRAS esté abierto. Al iniciar, se realiza la
pendiente dentro de un minuto. Si elegís una carpeta sincronizada por Drive,
OneDrive, Dropbox u otro cliente local, ese programa subirá los archivos a tu
nube. CPOBRAS muestra el último respaldo local y los errores, sin requerir login.
No comprueba la subida al proveedor. Guía: [docs/BACKUPS.md](docs/BACKUPS.md).

## Clientes y proveedores

Se administran desde **Inicio → Clientes** e **Inicio → Proveedores**, en vistas
separadas. Internamente comparten una persona: cliente, proveedor o ambos.
**Importar desde…** incorpora el contacto existente a la otra función; al crear,
se sugieren coincidencias por CUIT, nombre, correo y teléfono.

Al crear o editar una obra, elegí el cliente y los proveedores vinculados.
Los botones **Crear cliente/proveedor** e **Importar desde…** abren una ventana
superpuesta, conservan el formulario de obra y seleccionan el contacto guardado.
Los cambios de contacto de una persona con ambas funciones se reflejan en las
dos vistas. Guía: [docs/PERSONS.md](docs/PERSONS.md).

## Organizaciones y predeterminada

**Inicio → Organizaciones** concentra los datos generales, logotipo, datos de
impresión y directorios. Permite varias organizaciones propias y distingue
externas de solo lectura. Elegí **Usar como predeterminada** para preseleccionarla
al crear obras nuevas: las existentes conservan su organización y su emisor.
Cada obra nueva permite elegir explícitamente una organización propia.
Guía: [docs/ORGANIZATIONS.md](docs/ORGANIZATIONS.md).

## Presupuesto para cliente, interno e incidencias

Configurá el emisor y su logotipo en **Inicio → Organizaciones**. Dentro de
la obra, **Imprimir presupuesto** permite generar la presentación para cliente,
la interna con costos y determinación de precio, o la planilla de incidencias
sobre el total final. Se exportan a PDF y Excel.

El PDF se guarda y se abre en el lector predeterminado del sistema; desde allí
podés imprimirlo. La presentación para cliente muestra precios finales sin
exponer el desglose de costos ni los márgenes internos. Guía y criterios de
reparto: [docs/PRINTING.md](docs/PRINTING.md).

## Instalar dependencias

Requisitos: Rust 1.99.1 con `rustfmt` (fijado en `rust-toolchain.toml`, instalable con rustup), Node.js 24 (versión fijada en `.nvmrc`) y npm. En Linux también
se necesitan las bibliotecas nativas de Tauri. En Debian/Ubuntu, con permisos
administrativos:

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev \
  libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev libglib2.0-bin
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

AppImage para llevar a otra computadora Linux:

```bash
cd apps/desktop
npm run package:linux
```

El archivo queda en `apps/desktop/src-tauri/target/release/bundle/appimage/`.
Para distribuirlo se construye sobre Ubuntu 22.04, conservando compatibilidad
con Linux Mint 21/22. La compilación hecha en una distribución más nueva puede
requerir bibliotecas que otra computadora todavía no tenga.

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

1. En **Inicio → Clientes** y **Inicio → Proveedores**, cargá los contactos.
   Podés incorporar una misma persona a ambas funciones. Al crear o editar una
   obra, seleccioná su cliente y proveedores, o crealos desde esa ventana.
2. Desde **Inicio → Organizaciones → Directorios**, registrá empresas, establecimientos, usuarios/roles,
   contactos, unidades y rubros. Abrí la obra y usá **Datos de obra**
   para sus contratos, centros de costos y ficha. Esta última permite cargar ubicación, responsable, fechas y porcentajes
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
5. Desde **Inicio → Costos y precios**, creá listas por proveedor/moneda/zona y cargá precios
   con fecha y fuente. Probá ACU compuestos, rendimientos, desperdicios,
   escenarios de variación y conversiones con cotización explícita.
6. Abrí una obra y, en **Planificación**, configurá días laborables y
   feriados, cargá tareas/hitos, dependencias y recursos. Podés arrastrar una barra
   del Gantt o cambiar su duración desde el extremo. Guardá una línea base,
   registrá avances y compará la curva S, las holguras y la ruta crítica.
7. En **Copias de seguridad**, configurá una carpeta fija, activá la frecuencia
   automática y guardá. Probá **Crear copia ahora**, **Abrir carpeta** y
   **Actualizar estado**. Restaurar crea antes una copia del estado actual.

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

Las obras externas vinculadas por P2P aparecen en Inicio y se abren en el entorno habitual de solo lectura. Cada invitación permite elegir los apartados visibles. Ver [guía P2P](docs/P2P.md). El icono y la cabecera usan el yacaré de CPOBRAS.

### Biblioteca de ACU y estados del presupuesto

Desde la pestaña **ACU** de una partida con insumos, **Guardar como patrón de ACU**
crea una composición independiente en la biblioteca. Indicá código y descripción;
se guardan los consumos por unidad y sus precios actuales, sin copiar la cantidad
total de la partida ni modificarla. Luego podés usarla en **＋ Desde ACU**.
La biblioteca usa precios en ARS; no convierte monedas automáticamente.
**Patrones de cómputo**, junto a ese botón, permite traer rubros, partidas y
cantidades desde otros presupuestos o patrones guardados.
**＋ Presupuesto** está junto al selector del presupuesto activo.

Un presupuesto propio puede pasar de **En elaboración** a **Emitido** y volver
con **Volver a En elaboración**, previa confirmación. Se conservan cantidades,
composiciones y precios; al reabrir se habilita la edición. Los PDF ya enviados
no se actualizan. Las obras externas siguen siendo de solo lectura.

### Mejoras de carga y planificación

Los códigos internos nuevos se asignan automáticamente al guardar (insumos,
ACU, patrones de ACU, contactos y fichas). Los códigos existentes se conservan.
Los símbolos de unidad, CUIT y referencias externas no son códigos internos.

El badge **Metrado** identifica cantidades calculadas y aplicadas mediante
mediciones o fórmulas del sistema. Crear mediciones sin aplicarlas no cambia el
origen de la cantidad. Al cambiar manualmente cantidad o unidad, desaparece el
badge; las copias conservan el origen cuando corresponde. Para metrados de
versiones anteriores, volvé a aplicarlos una vez: no se infiere el origen de
cantidades históricas.

**Planificación** aparece antes de **Gestión de obra**. Las pestañas **Gantt** y
**PERT** comparten tareas, duraciones y dependencias. Ver [guía de planificación](docs/PLANNING.md).
**Datos de obra** reúne la ficha física, mapa, participantes, presupuestos y
legajos: [guía del tablero](docs/PROJECT-DASHBOARD.md).

Para probar estos cambios compilando localmente, seguí los comandos de
compilación y arranque de este README. No es necesario generar un AppImage.

### Navegación PERT y etapas de trabajo

El fondo del PERT se puede arrastrar para panear. Los botones **+**, **−** y
**Centrar / ver todo** controlan la vista; mover un nodo conserva el foco y el
zoom. Desde el editor compacto, **Dividir en tramos** distribuye una tarea entre
etapas con duraciones, dependencias y avances propios, conservando el total de
la partida. Ver [planificación](docs/PLANNING.md).

El mapa de Datos de obra abre en Argentina si no hay un punto guardado.
**Elegir ubicación** permite colocar o mover el pin y guardar sin escribir
coordenadas. La ficha física se edita en un formulario amplio, sin la tabla
vacía de directorio. Ver [tablero de obra](docs/PROJECT-DASHBOARD.md).

### Calendario del Gantt y dirección del mapa

El Gantt permite panear por fechas reales, con encabezados de año, mes, semana ISO
y día y con fines de semana resaltados. **Calendario y seguimiento** permite
seleccionar varias fechas, describirlas y marcar si se trabaja o no. Al guardar,
Gantt y PERT se recalculan con las mismas reglas. El calendario y el resumen
ocupan dos columnas en pantallas amplias.

Al guardar el pin del mapa se completa la dirección aproximada cuando el servicio
OpenStreetMap/Nominatim responde. Si no está disponible, la ubicación se guarda
con un aviso para revisar su dirección. Esta función requiere Internet.
