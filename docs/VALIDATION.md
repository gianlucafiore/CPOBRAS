# Validación de desarrollo — 2026-11-07

Las comprobaciones se ejecutan en la máquina de esta sesión, sobre Linux,
con Node 24.22.1 y Rust 1.99.1. `tools/check.sh` reúne los checks reproducibles.

| Comprobación | Evidencia |
| --- | --- |
| Rust, núcleo y almacenamiento | 87 tests: 22 de dominio y 65 de persistencia/regresión |
| Escritorio Tauri | 4 tests nativos: IPC, GLib, rutas PDF y lector predeterminado en Linux |
| JavaScript | 27 tests, con aislamiento de procesos desactivado explícitamente en el runner |
| Chromium | 34 recorridos de interfaz sobre DOM real y un puente IPC de prueba |
| Formato Rust | Workspace y aplicación Tauri |
| Frontend de producción | Vite build, incluyendo los módulos de Excel y PDF |
| Ejecutable Linux | Compilación con `custom-protocol` y arranque WebKitGTK en Xvfb |
| Dependencias | Ver [DEPENDENCIES.md](DEPENDENCIES.md) |

Los doctests y el binario de tests sin casos propios informan cero tests; no se
cuentan como cobertura adicional. Los tests de Chromium no sustituyen la
integración nativa: el recorrido IPC usa Tauri con su configuración real y
comprueba clientes, obras, ACU, presupuesto emitido, directorios, listas de
precios, ACU anidados, importación, cronograma, línea base, copia/restauración,
exportación, depósitos, documentos operativos, reportes de gestión y rechazo de ventanas/orígenes sin permisos.

## Organizaciones y propietario de la obra

- Varias propias, predeterminada solo para obras nuevas, selección explícita al
  crear y conservación del propietario y emisor de las obras existentes.
- Cambio de asociación con presupuestos rechazado con rollback de los datos de
  obra. La impresión consulta el perfil de su propietario, no la predeterminada.
- Externas de solo lectura: rechazo de edición, predeterminada y creación local
  de obras bajo esa identidad; control de procedencia y revisión de snapshots.
- Migración desde esquema 19 conserva perfil, bytes del logo y asociación al
  reabrir después de cambiar la predeterminada.
- IPC nativo y Chromium cubren organizaciones, formularios unificados,
  directorios, selección predeterminada y consulta de una ficha externa.

Guía: [ORGANIZATIONS.md](ORGANIZATIONS.md). La sincronización P2P no está implementada.

## Presentaciones e impresión

- Perfil público independiente de Organización, revisión al guardar, validación
  de logotipo, consulta consistente y conservación en copia/restauración.
- Reparto exacto de centavos y porcentajes hasta 100%; tratamiento explícito de
  cargos con costo directo cero; ausencia de mutación de costos al imprimir.
- PDF para cliente sin desglose de costos ni beneficio, PDF interno con
  determinación, rubros anidados, logo y múltiples páginas sin perder filas.
- Excel con importes y porcentajes como cadenas decimales exactas.
- IPC real de perfil y datos de impresión; apertura restringida a PDFs propios.
  GIO entrega un PDF con espacios en el nombre a una aplicación predeterminada
  de prueba, usando un perfil XDG temporal separado del escritorio del usuario.
- Chromium cubre carga de PNG, guardado, vista pública, cambio de presentación
  conservando condiciones, Excel y recuperación cuando falta asociación PDF.

Guía: [PRINTING.md](PRINTING.md). Esquema SQLite actual: 20.

## Navegación y contexto de obra

- Inicio concentra los catálogos generales; dentro de una obra solo aparecen
  sus pestañas, con obra y presupuesto activos visibles en todas ellas.
- Dos obras alternadas mediante Inicio: planificación y gestión consultan la
  obra correcta; las fichas de Datos de obra excluyen registros de la anterior.
- Cambio confirmado de presupuesto actualiza cabecera e informe; cancelar
  conserva la selección y los borradores. Se protegen también tareas y fichas.
- Gestión no selecciona automáticamente otra versión ni carga la cartera
  global; el historial identifica el presupuesto de cada documento.
- La cartera global sigue disponible en Inicio, con exportación, separada del
  tablero e informes de la obra abierta.

## Determinación de precio

- Exactitud del ejemplo de referencia: costo directo 12.356.539,73, gastos
  generales 10% CD, beneficio 15% CD e IVA 21% del subtotal: total
  18.689.266,341625 (18.689.266,34 en pantalla).
- Equivalencia con los porcentajes anteriores, orden de cálculo, utilidad
  anterior, conceptos desactivados y subtotales sin doble suma.
- Grupos anidados, participación, cambio entre detalle/manual/referencia,
  rechazo de ciclos, padres inexistentes, desbordes y deducciones excesivas.
- Revisión al guardar, duplicación, JSON versión 2, plantillas, bloqueo de
  emitidos y reparación de una determinación invalidada por cambios de costo.
- Certificación proporcional con cargos fijos y coherencia del precio final.
- IPC real de consultar/calcular/guardar/plantillas/totales y conservación
  después de copia/restauración. Chromium verifica edición individual, cierre
  protegido, modos, orden, plantillas, exportación y navegación sin perder datos.
- Excel y PDF del presupuesto incluyen los conceptos personalizados; las
  exportaciones de determinación conservan los decimales exactos.

Guía: [PRICE_DETERMINATION.md](PRICE_DETERMINATION.md).

## Patrones y precios por presupuesto

- Selección de rubros, subrubros, partidas sueltas y rubros vacíos; ausencia de
  duplicación al marcar un rubro y sus partidas; conservación de jerarquía,
  fórmulas, metrados y nuevas identidades.
- Incorporación en un presupuesto existente y en un rubro elegido, con resolución
  de códigos repetidos, tasas del destino intactas y rollback ante errores.
- Patrones guardados independientes del origen; cantidades sin precios entre
  monedas distintas; rechazo de precios entre monedas distintas y de destinos emitidos.
- Precio único por recurso y presupuesto; rendimientos conservados, versiones
  aisladas, biblioteca sin mutación y rollback de todos los cambios ante desbordes.
- Migración de precios de borradores antiguos, repetición idempotente al abrir
  de nuevo y preservación de partidas cuya unidad del ACU de biblioteca cambió.
- IPC real: guardar/consultar/aplicar patrones, precio del presupuesto y recálculo
  de varias partidas; navegador: árbol parcial, biblioteca, cierre protegido y edición.

Guía: [PATTERNS_AND_PRICES.md](PATTERNS_AND_PRICES.md).

## Regresiones de gestión (etapas 6–10)

- Solicitud → pedido de cotización → oferta completa → orden → recepción parcial.
- Rechazo de exceso de recepción, consumo sin stock, devolución excesiva,
  moneda mezclada y movimiento retroactivo. Transferencias entre obras conservan valor.
- Consumos concurrentes en dos conexiones SQLite no gastan la misma existencia.
- Promedio ponderado periódico conserva el valor exacto al agotar y devolver stock.
- Partes con producción, asistencia y equipo no duplican cantidades ni horas de personal.
- Certificados requieren presupuesto emitido, usan sus precios de venta,
  controlan períodos, saldos, anticipos, reparos y liberaciones.
- Ajustes requieren índices y ponderadores válidos; se guarda el cálculo inmutable.
- Facturas, pagos/cobros parciales, flujo, proyección y resultados se concilian.
- Copia/restauración conserva documentos y existencias de la migración 15.
- Buscador aproximado y alta en ventana superpuesta conservan el formulario original.
- Excel conserva los decimales de los anexos y PDF genera documentos portables.

Guía, reglas económicas y límites: [OPERATIONS.md](OPERATIONS.md).

## Regresiones comprobadas

- Importes por encima del rango entero exacto de JavaScript; redondeo decimal,
  sumas de rubros, descuentos de metrados y presentación de datos inválidos.
- Operaciones financieras extremas retornan errores de desborde.
- Ediciones masivas e importaciones inválidas revierten sus cambios y eventos.
- Las versiones duplicadas conservan identidad de partida, tasas financieras,
  rubros y fórmulas; los cambios manuales de cantidad invalidan una fórmula vieja.
- Arrastre entre rubros, doble clic, menú contextual propio y asignación directa de insumos con composiciones privadas; ver [UX_REVIEW.md](UX_REVIEW.md).
- Los presupuestos emitidos, las líneas base y el historial no se alteran.
- El borrado de partidas en borrador elimina metrados, asignaciones, fórmulas
  y composición propia sin borrar el catálogo ni afectar otras versiones. Se
  desvinculan tareas conservando sus datos y una nueva revisión; los documentos
  operativos conservan una referencia histórica protegida. Los emitidos se bloquean.
- Migración de una base versión 15 poblada con documentos y referencias, borrado
  posterior sin errores FK y rollback íntegro ante un fallo de la eliminación.
- Los combos se cierran al seleccionar o pulsar fuera; el formulario sigue abierto.
- Migración de un esquema original versión 6 y restauración de una copia antigua
  a través de un clon en memoria, antes de reemplazar la base activa.
- Excel/CSV conservan los dígitos decimales; PDF contiene título y resumen
  económico. La expansión ZIP de Excel se limita antes de leer el contenido.
- Fórmulas, referencias circulares de ACU, fuentes y dirección de cotizaciones,
  feriados, dependencias, ruta crítica, holguras y conservación de la curva de costos.

## Decisiones y límites del alcance

- Los roles son responsabilidades locales; no hay login ni separación de
  permisos entre personas que comparten la cuenta del sistema operativo.
  Autenticación y sincronización corresponden a la etapa 11.
- Cada obra tiene un calendario con días laborables configurables y feriados.
  Las dependencias FS/SS/FF/SF usan desfases laborables. Las fechas límite
  incumplidas generan alertas. Asignar recursos no hace nivelación automática
  de capacidad ni reemplaza los partes diarios de Gestión de obra.
- Una partida presupuestaria se vincula a una sola tarea valorizada por plan,
  para impedir duplicación involuntaria de su costo. Las tareas sin partida
  admiten un presupuesto explícito. El costo se distribuye por día laborable;
  la última cuota conserva el remanente y el total exacto.
- Excel y CSV importan partidas y agrupaciones. JSON conserva además jerarquía,
  tasas, fórmulas y metrados. Los vínculos a ACU ausentes se convierten en costos
  manuales preservando el precio; no se inventan recursos faltantes.
- El PDF de ACU está rotulado como composición actual. El presupuesto conserva
  su precio unitario guardado; no se presenta una composición actual como si
  fuera una composición histórica certificada.
- Las copias se guardan localmente. Para protección contra pérdida del equipo
  se deben copiar también a un medio externo. Restaurar desde la interfaz crea
  primero una copia de seguridad del estado actual. Las versiones futuras o
  estructuras inesperadas se rechazan.
- No se ejecutaron instaladores, firma ni pruebas de Windows/macOS, carga con
  bases reales ni pruebas de todas las combinaciones de negocio. Esas tareas
  siguen en la etapa 12. No se publicó el entorno ni una versión de distribución.

Los comandos de compilación y arranque y una guía para probar los avances
están en el [README principal](../README.md).
