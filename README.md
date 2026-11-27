# CPOBRAS

CPOBRAS es una aplicación de escritorio para calcular cuánto cuesta una obra, preparar su presupuesto y seguirla durante la ejecución. Los datos se guardan en tu computadora. Está pensada para obras en Argentina y permite trabajar con importes en pesos y dólares.

[Descargar CPOBRAS](https://github.com/gianlucafiore/CPOBRAS/releases/latest) · [Descargar la base modelo (.sqlite)](examples/cpobras-modelo.sqlite?raw=true) · [Sitio del proyecto](https://gianlucafiore.github.io/CPOBRAS/)

## Descargar y abrir la aplicación

Entrá en [Releases](https://github.com/gianlucafiore/CPOBRAS/releases) y elegí el archivo correspondiente a tu equipo.

| Sistema | Archivo y apertura |
| --- | --- |
| Windows 10 u 11 | Descargá el ejecutable portable `.exe` de 64 bits y abrilo. Requiere Microsoft Edge WebView2 Runtime. |
| Linux de 64 bits | Descargá el `.AppImage`, habilitá **Permitir ejecutar como programa** en las propiedades del archivo y abrilo con doble clic. [Guía para Linux](docs/APPIMAGE.md) |
| macOS | Descargá el ZIP para Apple Silicon o Intel, según tu equipo. Descomprimilo y abrí **CPOBRAS.app**. |

## Empezar con la base modelo

La base trae **40 insumos y 11 análisis de costos unitarios (ACU)**. Un ACU es la receta de una partida. Por ejemplo, indica cuánta arena, cemento y mano de obra se necesitan por metro cuadrado de revoque. También hay ejemplos de excavación, mampostería, hormigón y cubiertas de chapa.

Los consumos son orientativos. Los precios quedan pendientes de cotizar para que cargues valores de tu zona. El catálogo está listo para que crees tu propia obra.

1. Descargá y guardá [`cpobras-modelo.sqlite`](examples/cpobras-modelo.sqlite?raw=true).
2. Abrí CPOBRAS y entrá en **Inicio → Opciones → Base de datos**.
3. Elegí **Importar base de datos…** y seleccioná el archivo descargado. CPOBRAS guarda una copia en su carpeta de datos y la abre al iniciar. Si tu versión ofrece **Abrir base de datos…**, guardá el archivo en **Documentos** y abrilo desde esa carpeta.
4. Volvé a **Inicio** y recorré **Insumos** y **ACU**. Para recuperar tu base habitual, elegila en **Bases recientes** o usá **Abrir base de datos…** y seleccioná su archivo.

## Armar tu primer presupuesto

1. **Creá una obra.** En **Inicio / Obras**, pulsá **+ Nueva obra** y cargá el nombre y los datos del proyecto. Podés elegir el cliente desde el formulario.
2. **Abrí un presupuesto.** Entrá en la obra y seleccioná un presupuesto existente o creá uno con **+ Nuevo presupuesto**.
3. **Organizá los trabajos.** Agregá un **Rubro**, por ejemplo «Albañilería». Con **+ Desde ACU**, incorporá un análisis de la biblioteca, como **ACU-0012** para revoque. Con **+ Partida**, escribí un trabajo propio.
4. **Cargá cantidades y costos.** Editá la cantidad de la partida o calculala en **Metrados**. En la pestaña **ACU** podés ajustar los consumos y precios de los componentes. Para guardar un precio con fecha en la biblioteca, seleccioná el insumo y pulsá **Registrar precio**.
5. **Prepará el precio y la entrega.** En **Determinación de precio**, configurá gastos indirectos, utilidad e impuestos según tu caso. Completá la **Memoria descriptiva** si querés detallar el alcance. Usá **Imprimir presupuesto** para elegir la presentación y generar el documento.

## Qué más podés hacer

| Área | Qué podés hacer |
| --- | --- |
| **Insumos y ACU** | Administrar materiales, mano de obra, equipos y subcontratos. Mantener el historial de precios, importar insumos desde Excel y guardar composiciones como patrones reutilizables. [Patrones y precios](docs/PATTERNS_AND_PRICES.md) |
| **Presupuestos** | Crear versiones, organizar rubros y subrubros, copiar partidas y metrados, cargar gastos directos y exportar a PDF o Excel. La pestaña **Insumos** reúne las cantidades del presupuesto completo. [Documentos de presupuesto](docs/PRINTING.md) |
| **Planificación** | Programar tareas e hitos, definir dependencias en PERT, seguir el cronograma en Gantt, ajustar el calendario y marcar cortes de certificación. [Guía de planificación](docs/PLANNING.md) |
| **Gestión de obra** | Pedir cotizaciones, comparar proveedores, registrar compras y acopio, gestionar subcontratos y llevar el libro de obra. [Gestión y compras](docs/OPERATIONS.md) |
| **Certificaciones y finanzas** | Registrar avances del comitente y contratistas, emitir certificados, consultar cobros y pagos previstos y usar series como CAC o IPC en los ajustes. [Previsión financiera](docs/FINANCIAL_PLANNING.md) · [Índices y ajustes](docs/INDEX_ADJUSTMENTS.md) |
| **Obras y contactos** | Administrar clientes, proveedores y organizaciones. Guardar ubicaciones y legajos de obra, consultar la cartera y compartir una obra mediante una invitación de solo lectura. [Vinculación P2P](docs/P2P.md) |
| **Recordatorios** | Agregar avisos en Inicio y configurar con cuántos días de anticipación aparecen los cortes de certificación próximos. |

### Cargar tus insumos desde Excel

En **Inicio → Insumos**, usá **Descargar listado** para obtener un archivo de referencia. Completá las columnas **Descripción**, **Tipo** y **Unidad**. El código y el precio unitario en ARS son opcionales.

Pulsá **Importar Excel**, elegí el archivo `.xlsx` y la fecha de los precios. Revisá la vista previa antes de confirmar. Se admiten hasta 5.000 insumos y 10 MB por archivo. Si la vista previa señala duplicados o errores, corregí la planilla y volvé a seleccionarla.

## Opciones y respaldo de tus datos

- **Bases de datos.** En **Inicio → Opciones** podés crear una base vacía, abrir un archivo existente o importar una copia. Ahí también se muestra la base activa.
- **Apariencia e idioma.** Desde **Opciones** elegís el tema de colores y el idioma de la interfaz. Están disponibles español, portugués de Brasil, inglés y francés.
- **Copias de seguridad.** En **Inicio → Copias de seguridad**, elegí una carpeta y generá una copia manual o activá los respaldos automáticos. Podés usar una carpeta que tu sistema ya sincronice con la nube. [Guía de copias](docs/BACKUPS.md)
- **Ayuda con IA.** Desde **Opciones → Configurar IA** elegís un proveedor. El botón **IA** abre un chat de consulta sobre la pantalla y ofrece búsquedas web con un proveedor configurado. El chat es de solo lectura.

## Ayuda y contribuciones

Si encontrás un problema o tenés una sugerencia, contanos qué versión usás, en qué sistema y cómo reproducirlo. [Sugerencias y problemas](https://github.com/gianlucafiore/CPOBRAS/issues)

Si querés trabajar en el código, consultá los [comandos de desarrollo](docs/DESARROLLO.md) y la [guía para contribuir](CONTRIBUTING.md).
