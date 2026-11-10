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

La versión 0.1.3 está preparada para Linux Mint 21/22 y Ubuntu 22.04/24.04.
Los datos se guardan por usuario fuera del AppImage; no se transfieren con el
programa. Para consultar una obra de otro equipo, usá **Inicio → Vinculación P2P**.
Guía y solución para sistemas sin FUSE: [docs/APPIMAGE.md](docs/APPIMAGE.md).

## Descargar y abrir en Windows

En [Releases de GitHub](https://github.com/gianlucafiore/CPOBRAS/releases), descargá el
archivo `CPOBRAS_0.1.3_windows_x86_64_portable.exe` y abrilo directamente. Requiere
Windows 10/11 y Microsoft Edge WebView2 Runtime. Los datos se guardan en el perfil
del usuario; copiar el ejecutable no traslada la base de datos.

## Cargar materiales y mano de obra desde Excel

En **Inicio → Insumos**:

1. Seleccioná **Descargar plantilla Excel** y completá la hoja **Insumos**.
2. Indicá **Descripción**, **Tipo** (Material/MAT, Mano de obra/MO, Equipo/EQ o Subcontrato/SC/SUB) y **Unidad**. El código y el precio por unidad en ARS son opcionales; un código vacío se genera automáticamente y un precio vacío crea el insumo sin precio.
3. Seleccioná **Importar Excel**, elegí el archivo `.xlsx` y la fecha de los precios.
4. Revisá la vista previa y confirmá **Importar insumos**. Si hay errores o duplicados, corregí el Excel y volvé a seleccionarlo.

Se admiten hasta 5000 insumos por archivo y 10 MB. La importación agrega el lote completo o no guarda ninguno; no sobrescribe insumos existentes ni modifica presupuestos. Los precios importados se incorporan al historial. Después podés asignar los insumos a las partidas desde su composición.

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
una obra se abre **Proyecto**, con sus datos, ubicación, presupuestos y legajos.
Desde la lista podés crear **+ Nuevo presupuesto** o abrir uno existente. Al entrar
en un presupuesto aparecen su desglose, determinación de precio, planificación y
gestión. **← Volver al proyecto** permite elegir otra versión, sin un selector
permanente. Los formularios con cambios pendientes protegen su contenido antes
de salir. El cronograma pertenece a la obra y sus vínculos identifican el
presupuesto de origen.

En PERT, la rueda del mouse acerca o aleja y arrastrar el fondo desplaza la vista.
**Añadir** coloca una partida en el centro visible. **Quitar** activa una goma para
retirar nodos o dependencias: **Listo** guarda y **Cancelar** restaura el diagrama.
Retirar un nodo también quita sus dependencias y devuelve la partida a la lista.
El mini mapa y el mapa ampliado también aceptan zoom con la rueda.

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

## Calendario e índices de ajuste

**Inicio → Datos generales** reúne el calendario general y las publicaciones
mensuales de CAC, IPC u otras series. Las obras heredan los feriados y permiten
excepciones propias. Cada presupuesto define su mes base y combinación de índices.
La lista de certificaciones distingue importes previstos y emitidos; los
certificados provisorios permiten reclamar diferencias en el siguiente período,
sin modificar los anteriores. También se pueden incluir adicionales puntuales.
[Guía con ejemplos y criterios](docs/INDEX_ADJUSTMENTS.md).

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
6. Configurá el calendario en **Inicio → Datos generales**. En una obra,
   **Planificación** permite excepciones locales, tareas/hitos, dependencias y
   recursos. Podés arrastrar barras y cortes del Gantt, registrar avances y
   consultar la curva S, las holguras y la ruta crítica. Las revisiones internas
   se conservan sin mostrar una tarjeta de historial en esta vista.
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
y día y con fines de semana resaltados. Los feriados se administran desde
**Inicio → Datos generales**; **Seguimiento y excepciones de esta obra** permite
cambiar su condición laborable únicamente para la obra abierta. Gantt y PERT
utilizan las mismas reglas. La descripción aparece al pasar el mouse.

Al guardar el pin del mapa se completa la dirección aproximada cuando el servicio
OpenStreetMap/Nominatim responde. Si no está disponible, la ubicación se guarda
con un aviso para revisar su dirección. Esta función requiere Internet.

- [Certificados preliminares y emitidos, cotizaciones y contratos](docs/CERTIFICATES_AND_QUOTES.md)

- [Libro de obra, Materiales y Acopio y Subcontrataciones](docs/SITE_BOOK_AND_PROCUREMENT.md)

### Fondos de obra y administración de bibliotecas

En Finanzas, el fondo de obra registra cobros, anticipos recibidos, pagos,
anticipos a contratistas y gastos pagados. Las órdenes y los certificados por sí
solos no mueven dinero. El saldo puede ser negativo; los aportes propios y sus
reintegros se muestran separados de los ingresos del comitente y los gastos.
Cada movimiento admite un comprobante y aparece en el detalle del fondo.

Los anticipos recibidos se vinculan a un presupuesto y su convenio de
certificaciones. La recuperación respeta el porcentaje pactado y el importe
realmente recibido pendiente de recuperar. Los anticipos antiguos sin vínculo
pueden asociarse desde el detalle del fondo, sin duplicar el ingreso.

Los menús ⋯ permiten retirar obras, presupuestos y ACU de las listas conservando
su historial. Clientes y proveedores usados pueden darse de baja y reactivarse;
solo los contactos sin uso pueden eliminarse. Las herramientas de precios están
en secciones desplegables de Insumos, ACU y Datos generales. Los precios de las
cotizaciones se guardan al salir del campo; los errores se indican sin descartar
lo escrito.

### Asistente IA por API (opcional)

El botón **✦ IA** abre una consola inferior. En **Configurar**, elegí OpenAI o
Claude, un modelo habilitado en tu cuenta y su clave de API. El proveedor, modelo y clave se guardan
en el almacén seguro de credenciales del sistema: Secret Service en Linux,
Administrador de credenciales en Windows y Keychain en macOS. Se restauran al
abrir la consola sin volver a pegar la clave. No se guardan en SQLite,
localStorage ni respaldos del proyecto. Podés cambiar el modelo dejando vacía
la clave para conservarla, o borrar la conexión guardada desde Configurar.
En Linux se necesita un servicio Secret Service disponible y desbloqueado
(por ejemplo, GNOME Keyring); si no está disponible se informa el error y no
se escribe una copia en texto plano. Una suscripción a ChatGPT o Claude no
sustituye la facturación de API. Los nombres de modelo se pueden cambiar según
su disponibilidad en cada cuenta.

La consulta y un historial breve se envían al proveedor seleccionado cuando se
pulsa Enviar y se acepta el aviso de envío y posibles cargos. El contexto de la
pantalla se incluye de forma predeterminada y se actualiza al enviar. También
se consulta el catálogo local para incluir coincidencias reales con precios,
unidades, moneda y fecha. Podés revisar la vista, desactivar **Incluir vista y
catálogo local** o editar su texto; el contexto editado
se respeta sin reemplazarlo automáticamente. En Presupuesto incluye un resumen
calculado sobre todas las partidas cargadas, con conteos separados de precios
cero, positivos, negativos y sin dato, aunque el detalle de filas se recorte. Se limita el tamaño del
contexto y la respuesta, sin reintentos automáticos ante errores; el modelo puede
pedir una sola búsqueda adicional de catálogo para afinar coincidencias. Esto no constituye un tope
monetario. La espera de respuesta se limita a 60 segundos y la interfaz tiene
un corte independiente a los 65 segundos si IPC no responde. Podés usar
**Cancelar consulta**; se conserva la pregunta y no se reintenta. Cancelar no
garantiza que el proveedor no haya procesado o cobrado una solicitud ya recibida.
Configurar una clave no verifica la conexión: el panel confirma la primera
respuesta recibida. Configurá límites de gasto en la cuenta del proveedor. Las políticas
de tratamiento y retención del proveedor siguen aplicándose; en OpenAI se envía
`store: false`. No se envían archivos, adjuntos ni el archivo de base de datos.

El asistente explica datos y puede preparar partidas, ACU e insumos nuevos.
Las partidas y los ACU se pueden cargar con la aprobación del pedido desde el
chat o revisar en el panel. Los insumos nuevos se revisan antes de incorporarlos
al catálogo. El modelo no dispone de SQL ni comandos arbitrarios de escritura.
No registra pagos, emite certificados ni ejecuta código. Los textos del modelo se muestran como texto plano. La
conversación se mantiene en memoria y se limpia al cambiar de sección, obra o
presupuesto. Las respuestas y estimaciones deben revisarse. La carga asistida de partidas y precios se describe en la sección siguiente.

### Carga asistida de partidas y precios

Desde la consola IA se puede abrir:

- **Cargar precios · texto / Excel**: pegá columnas de Excel, una lista
  `descripción;precio`, o cargá un `.xlsx` (primera hoja, hasta 1000 filas).
  Elegí las columnas y el formato numérico del texto. Las celdas numéricas de
  Excel conservan el valor decimal original; no se usa el total como unitario
  automáticamente. Las filas vacías o inválidas no se convierten en precio cero.
  Las coincidencias únicas por código o descripción se proponen localmente;
  unidades distintas y coincidencias ambiguas requieren revisión. La IA puede
  sugerir correspondencias para hasta 50 filas pendientes por consulta, sin
  cambiar sus precios. Esas sugerencias quedan desmarcadas.
- **Crear partidas con ACU**: describí los trabajos. La IA propone hasta 60
  partidas y sus rubros, sin inventar precios ni cantidades faltantes. Revisá,
  editá y seleccioná las que quieras incorporar. En un proyecto propio sin
  presupuesto abierto se puede crear uno nuevo junto con las partidas al
  confirmar. Los datos nuevos de cantidad que queden sin definir se guardan explícitamente
  en cero para completar después; los precios de los ACU se calculan con los insumos. Se avisa si una descripción y unidad ya existen.
- **Editar / eliminar partidas**: pedí cambios por IA o revisá la lista
  manualmente. Se pueden modificar descripción, unidad, cantidad y precio, y
  proponer eliminaciones. Las propuestas IA quedan desmarcadas. La vista previa
  identifica la partida original, sus datos actuales y la acción que se aplicará.
  También se pueden revisar propuestas de creación, edición o eliminación que
  aparezcan en una respuesta del chat.

El guardado necesita una selección y confirmación explícitas. Las operaciones se
aplican en una única transacción; un dato inválido o una partida modificada desde
la vista previa rechaza todo el lote. Los reintentos de una misma solicitud no
crean duplicados. Se conserva un registro local del lote aplicado. Los
presupuestos emitidos, retirados o de otras organizaciones quedan protegidos.
Las eliminaciones usan el mismo mecanismo histórico que la edición manual:
conservan los documentos emitidos y el alcance histórico de planificación.
Cambiar precio o unidad de una partida con ACU la pasa a precio manual,
conservando la composición anterior. La carga simple crea partidas con precio manual; para composición, rendimientos y metrado usá el panel de ACU siguiente.

Los archivos se leen localmente. La generación de propuestas y sugerencias de
correspondencia usan la API configurada y requieren la autorización de envío de
la consola; pueden generar cargos mayores que una respuesta breve. No se sube
el Excel completo: las correspondencias comparten descripciones, unidades,
códigos e identificadores de las filas candidatas. La vista previa y la
asignación manual de precios pueden usarse sin llamadas a IA.


### ACU, rendimientos, mediciones y referencias asistidos

En **✦ IA → ACU · rendimientos y metrado** se pueden completar partidas
existentes o preparar nuevas partidas con su propio ACU. También se puede abrir
este panel desde una lista de partidas propuesta por el chat. Las solicitudes
claras de crear o completar ACU, revoques, mamposterías o mediciones desde el chat
muestran una tarjeta para elegir entre revisión previa o carga aprobada desde el chat.

- La selección inicial toma las partidas sin composición o con ACU vacío. Se
  pueden seleccionar otras; reemplazar un ACU existente requiere un pedido
  explícito, que también se puede aprobar desde el chat. La generación se hace en consultas de hasta cinco partidas,
  informa su cantidad y posibles cargos y conserva los resultados recibidos si
  se detiene o falla una consulta. No se reintenta automáticamente.
- Cada propuesta muestra sus insumos, unidad, consumo por unidad de partida,
  precio tomado del sistema, parciales, costo unitario, cantidad y total. Los
  consumos pueden editarse; se admiten coma o punto decimal sin miles. Se revisan
  especialmente conversiones kg/bolsa y horas/jornal, espesores y desperdicios.
  Los consumos estimados por IA quedan identificados como propuestas revisables.
- Los precios se resuelven primero desde el presupuesto; si el insumo no tiene
  un precio fijado allí, se toma el catálogo en la misma moneda a la fecha elegida.
  El modelo no asigna precios. Un precio ausente bloquea la aplicación; un precio
  cero se señala sin confundirlo con ausencia. Desde el panel puede registrarse
  explícitamente un precio faltante en el historial del catálogo.
- Podés elegir hasta tres presupuestos propios o ACU de biblioteca como ejemplos,
  incluidos presupuestos emitidos. Se leen sus recetas y consumos, sin modificar
  los originales ni copiar precios históricos. También puede copiarse una receta
  localmente a una propuesta sin llamar a la API, si coincide la unidad de partida.
  Los ejemplos son contexto para la consulta, no entrenamiento permanente.
- Se pueden crear rubros, usar un rubro existente o reasignar la partida desde la
  revisión. Las propuestas nuevas pueden crear el presupuesto si el proyecto aún
  no tiene uno abierto.
- Las mediciones se proponen solo con dimensiones conocidas y se muestran como
  factor/caras × largo × ancho × alto, con descuentos para aberturas. CPOBRAS
  calcula la cantidad con decimales exactos. Aplicar esas medidas es una selección
  aparte: conserva la cantidad anterior por defecto; al confirmar reemplaza los
  renglones de Metrados y conserva el valor manual previo para recuperarlo si se
  elimina el metrado después. Si faltan dimensiones se solicitan o quedan pendientes.

Los ACU y el metrado elegidos se aplican en el mismo lote atómico que las partidas
y rubros. Si cambian recursos, precios, la partida, su receta o las mediciones
desde la revisión, se rechaza el lote completo. No se reprician silenciosamente
partidas ajenas a la selección ni se modifican ACU de biblioteca o referencias.
Las propuestas quedan desmarcadas hasta revisarlas. Al cerrar el panel se pueden
retomar en memoria mientras CPOBRAS siga abierto (hasta cinco preparaciones), por
ejemplo para agregar un insumo en Inicio y volver a actualizar el catálogo.

Los formularios de carga y preparación de ACU usan el tema claro de CPOBRAS.
La consola permanece oscura y sus desplegables usan controles claros con texto
oscuro para mantener contraste en GTK/WebKit.

Para terminar una preparación de ACU:

1. **Preparar lista** define las partidas que se quieren crear o completar;
   todavía no las incorpora al presupuesto.
2. **Generar ACU** propone los insumos y consumos para esas partidas. Las notas
   recibidas como texto, listas u objetos se normalizan sin descartar recetas
   válidas; las notas extensas se acotan con un aviso. Los faltantes siguen
   requiriendo revisión explícita.
3. Revisá y marcá las recetas completas y pulsá **Guardar N ACU**. El pie indica
   qué falta si no se puede guardar. Tras confirmar, se selecciona una partida
   aplicada en la pestaña ACU y se ofrece **Ver en presupuesto**.

Si se guarda una selección parcial, **Continuar preparación** conserva las
propuestas que no se aplicaron y permite terminar sin volver a generarlas.
También se conservan en memoria si se cierra y retoma el panel durante la misma
sesión. Al trasladar una lista propuesta desde el chat se conserva el texto
original de la consulta para no perder las medidas y criterios de trabajo.

El chat puede derivar una solicitud al panel con **Completar insumos y
rendimientos**. Para completar partidas existentes se conservan sus
identificadores y cantidades; no se convierten los materiales en partidas
nuevas. Confirmaciones como «perfecto, cargalos» recuperan los criterios de la
conversación para abrir esa preparación. La generación y el guardado siguen
siendo pasos explícitos del panel.

Si una receta contiene un insumo sin correspondencia en el catálogo o repetido,
se conserva en la vista previa con el error visible. Elegí el insumo correcto o
corregí el repetido antes de marcarla y guardarla; no se suman consumos ni se
crean insumos automáticamente. Las otras recetas permanecen disponibles.

Cuando falte un insumo, **Abrir biblioteca de insumos** conserva la preparación
de ACU y abre la biblioteca. Allí se puede usar **Nuevo insumo**, importar Excel
o **Preparar insumos con IA**. La carga asistida organiza hasta 60 insumos
identificados en una lista del usuario; los datos desconocidos quedan pendientes.
No se inventan códigos ni se aceptan precios generados por el modelo. La revisión
permite completar tipo, unidad y precio manual opcional, detectar duplicados y
agregar solamente las filas marcadas. El alta individual también admite precio
vacío y código automático.

**Volver al ACU** retoma las propuestas y actualiza la biblioteca sin repetir la
consulta ni asignar insumos automáticamente. El usuario elige los insumos reales,
revisa sus consumos y resuelve los faltantes antes de guardar. Los borradores se
conservan en memoria durante la sesión. La generación en lote usa la misma
conexión de IA guardada y requiere autorizar el envío de esa lista; no envía el
catálogo ni el historial del chat.


El chat permite elegir **Revisar antes de cargar** o **Sí, aprobar y cargar**.
La segunda opción autoriza solo ese pedido y ejecuta la carga desde el chat, sin
abrir la ventana de ACU ni pedir otra confirmación por fila. Muestra progreso,
permite detener antes del guardado y luego informa lo cargado y lo pendiente.
Cerrar el chat o cambiar de sección detiene la carga que aún no empezó a guardarse.
Las propuestas de partidas simples se pueden crear con ese mismo botón, sin
otra consulta al proveedor; las cantidades o precios no informados se guardan
en cero. Las propuestas de edición o eliminación conservan su revisión habitual.

La preaprobación de ACU conserva cantidades y metrados existentes, fija las
partidas de esa ejecución y realiza una sola escritura para las recetas válidas.
No permite omitir insumos inexistentes, falta de precios, consumos inválidos o
incompatibilidades explícitas de material/unidad. Las recetas que no se pueden
cargar quedan disponibles en **Ver pendientes**. El resto se puede editar desde
el ACU de cada partida. La autorización no se reutiliza al retomar un borrador,
cambiar el catálogo o cambiar de obra o presupuesto.

Se pide a cada componente generado declarar la unidad del consumo, el insumo
requerido y el fundamento del rendimiento. La ausencia de una nota explicativa
no obliga a revisar otra vez una carga ya aprobada; se conserva como advertencia
y se utiliza el contrato de consumo por unidad del catálogo. Cuando hay conversión, también declara cantidad
y unidad de origen. Se comprueban las unidades y las sustituciones explícitas
de ladrillo cerámico/bloque de cemento; una conversión de kg a bolsas solo se
acepta cuando coincide con el peso inequívoco del envase en el catálogo real.
Estas comprobaciones no certifican la exactitud técnica del rendimiento estimado.
El chat consulta **ai_catalog_context** antes de las consultas generales con
contexto habilitado. La consulta es de solo lectura, admite presupuestos propios
emitidos y usa precios fijados en el presupuesto o precios de catálogo vigentes
a la fecha y moneda consultadas, sin convertirlos. Se seleccionan coincidencias
por descripción, código e historial del usuario; se separan resultados relacionados
(por ejemplo, sanitarios) de equivalencias técnicas. Los conteos abarcan todo el
catálogo activo aunque los resultados enviados se limiten a 80 y 24 KB.

Una respuesta **«sí»** a la última propuesta pendiente ejecuta esa propuesta;
no genera otra tarjeta ni reutiliza aprobaciones anteriores. El resultado real
sustituye las instrucciones del modelo sobre formularios, y los botones de
revisión desaparecen al procesar la aprobación. Los bloqueos reales se explican
por partida dentro del chat, sin exigir abrir el panel solo para leer el motivo.
