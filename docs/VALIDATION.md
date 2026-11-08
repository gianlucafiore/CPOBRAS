# Validación de desarrollo — 2026-11-07

Las comprobaciones se ejecutan en la máquina de esta sesión, sobre Linux,
con Node 24.22.1 y Rust 1.99.1. `tools/check.sh` reúne los checks reproducibles.

| Comprobación | Evidencia |
| --- | --- |
| Rust, núcleo y almacenamiento | 92 tests: 22 de dominio y 70 de persistencia/regresión |
| Escritorio Tauri | 13 tests nativos: IPC, GLib, rutas PDF y lector predeterminado en Linux |
| JavaScript | 27 tests, con aislamiento de procesos desactivado explícitamente en el runner |
| Chromium | 44 recorridos de interfaz sobre DOM real y un puente IPC de prueba |
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

## Distribución Linux 0.1.1

- Compilación de distribución sobre Ubuntu 22.04, con glibc 2.35, frontend incluido
  y runtime AppImage oficial verificado por SHA-256.
- Al abrir el lector PDF o el explorador del sistema desde el AppImage se quitan
  las rutas de bibliotecas empaquetadas, conservando la sesión y los datos del
  usuario. Evita cargar el GLib de Ubuntu 22.04 en programas de un sistema nuevo.
- Arranque del AppImage en un contenedor Ubuntu 22.04 sin código fuente, Node,
  Rust ni WebKit del sistema. Captura de la interfaz y base nueva con esquema 21,
  integridad y referencias verificadas.
- Publicación automatizada por etiqueta, archivo descargable y SHA256SUMS.

Guía: [APPIMAGE.md](APPIMAGE.md).

## Vinculación P2P de solo lectura

- Exportación por obra sin incluir una segunda obra, sus presupuestos o cliente.
- Dos aplicaciones con identidades distintas y QUIC real: vinculación, recepción,
  actualización, copia persistida, sin reescribir cuando no hay cambios y revocación.
- Relay local real con transporte IP directo deshabilitado: invitación,
  autenticación y transferencia íntegra únicamente a través del relay.
- La misma invitación no puede usarse desde otro equipo después de vincularse.
  Peticiones remotas de edición, versiones e IDs ajenos se rechazan.
- La copia recibida no crea ni reemplaza proyectos editables. Organizaciones
  externas conservan procedencia, revisión y bloqueo de edición.
- Chromium cubre invitaciones, revocación, consulta de pestañas sin controles de
  edición, desconexión y conservación del formulario ante un error.
- El relay público está bloqueado por el proxy de esta sesión (HTTP 403).
  Conectividad entre dos redes públicas distintas pendiente de comprobar.

Guía: [P2P.md](P2P.md).

## Respaldos en carpeta configurable

- Programación nativa independiente de la pantalla, frecuencia, pausa, copia
  manual y recuperación al reiniciar mediante reloj controlado en pruebas.
- Copias consistentes restaurables con nombres únicos, fecha UTC y permisos
  privados en Linux; publicación del archivo final después de verificarlo.
- Error y reintento al desconectar el destino, sin recrearlo ni usar otro;
  compatibilidad con copias internas antiguas y exclusión de temporales/enlaces.
- Configuración persistida atómicamente; entradas inválidas no la reemplazan y
  una configuración dañada no impide abrir la aplicación.
- Arranque del ejecutable Linux con programación activa genera una copia real;
  se verifican el archivo SQLite y el resultado persistido.
- Selector nativo de carpetas; selección y cancelación conservan las opciones
  pendientes hasta guardar la configuración. La ventana GTK real se abrió en
  Linux y la carpeta elegida completó el formulario de respaldos.
- IPC real guarda destino con espacios, genera y restaura respaldos sin cambiar
  la configuración. Chromium cubre guardado, copia manual, carpeta, cierre,
  errores de almacenamiento y conservación de borradores.

Guía: [BACKUPS.md](BACKUPS.md). La subida la realiza el cliente de nube externo.

## Personas, clientes y proveedores

- Una identidad con tres funciones y revisión de concurrencia; separación de
  vistas, incorporación sin duplicar y datos compartidos al editar.
- CUIT normalizado único; sugerencias por identificación, nombre aproximado,
  correo y teléfono, sin unir automáticamente por parecido.
- Migración desde esquema 20, incluidos clientes duplicados por CUIT y fichas
  ampliadas; conserva vínculos, identificadores históricos y documentos inmutables.
- Cliente principal y varios proveedores por obra, guardados atómicamente;
  rechazo de identidades con función incorrecta sin modificar la obra.
- IPC nativo, copia/restauración y cuatro recorridos Chromium: separación,
  coincidencias, alta/importación desde obra y edición sin perder el formulario.

Guía: [PERSONS.md](PERSONS.md).

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

Guía: [ORGANIZATIONS.md](ORGANIZATIONS.md). La recepción P2P está documentada en [P2P.md](P2P.md).

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

Guía: [PRINTING.md](PRINTING.md). Esquema SQLite actual: 21.

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
  La vinculación P2P ofrece consulta autenticada de solo lectura mediante
  invitaciones; el login y la edición colaborativa siguen fuera de este alcance.
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
- Las copias se guardan en la carpeta configurada, con programación mientras
  CPOBRAS esté abierto. La subida corresponde al cliente externo de sincronización.
  Restaurar desde la interfaz crea
  primero una copia de seguridad del estado actual. Las versiones futuras o
  estructuras inesperadas se rechazan.
- No se ejecutaron instaladores, firma ni pruebas de Windows/macOS, carga con
  bases reales ni pruebas de todas las combinaciones de negocio. Esas tareas
  siguen en la etapa 12. No se publicó el entorno ni una versión de distribución.

Los comandos de compilación y arranque y una guía para probar los avances
están en el [README principal](../README.md).

## Obras externas y permisos (0.1.2)

Verificados 22 casos del núcleo, 71 de almacenamiento, 29 de JavaScript y
47 flujos de navegador. Se cubren las vistas de solo lectura, estados emitidos,
selección y edición de permisos por observador, bloqueo de mutaciones y
filtrado de información secundaria (impresiones, informes e historial de planes).
Las 13 pruebas nativas también verifican la réplica cifrada, la revocación,
la edición de permisos y la conservación de la copia sin reescribirla cuando
no hay cambios. La compilación del frontend y las comprobaciones de formato Rust pasan.
El AppImage 0.1.2 se compiló en Ubuntu 22.04 y abrió su ventana en el contenedor
limpio de prueba, sin FUSE, Node, Rust ni WebKit instalado en el sistema anfitrión.
Se comprobó visualmente el yacaré en su cabecera.

## Patrones de ACU y reapertura de presupuestos

- 22 pruebas del núcleo y 73 de almacenamiento: migración a esquema 22,
  preservación de precios al reabrir, edición posterior y nueva emisión,
  protección de contenidos mientras está emitido y copia independiente del ACU.
- 29 pruebas JavaScript y compilación del frontend correctas.
- 48 flujos completos de navegador correctos; verificación adicional de los
  dos flujos nuevos: reapertura/emisión y guardado del patrón desde la partida.
- No se generó un AppImage para este cambio, según lo solicitado.

## Tablero de obra, códigos automáticos y PERT

- 23 pruebas del núcleo, 77 de almacenamiento y 31 de JavaScript correctas.
- 52 flujos de navegador completos correctos; verificaciones posteriores de
  PERT, tablero, P2P, inserción animada y cancelación del explorador también
  correctas (53 casos distintos en total).
- Compilación del frontend y formato de Rust correctos.
- Cobertura de persistencia de posiciones PERT con revisiones y líneas base,
  compatibilidad con planes anteriores, duraciones de tres estimaciones,
  conexiones circulares y sincronización con Gantt.
- El origen Metrado se prueba al aplicar mediciones/fórmulas, al cambiar una
  cantidad manualmente y al duplicar, importar o incorporar patrones.
- Los archivos se prueban como copias en la base de datos, con aislamiento por
  obra, límites de tamaño/extensión y auditoría sin contenido binario.
- El mapa embebido se verifica con una respuesta simulada de OpenStreetMap;
  la descarga de cartografía real depende de Internet en el equipo del usuario.
- No se generó un AppImage ni se creó una etiqueta de publicación.
Las 13 pruebas nativas también pasan con el esquema 23 y los comandos de
metadatos, mediciones y adjuntos registrados.

## Paneo PERT, mapa interactivo y tareas parciales

- 24 pruebas del núcleo, 78 de almacenamiento y 34 de JavaScript correctas.
- 56 flujos completos de navegador correctos: cámara PERT, foco tras guardar un
  nodo, pin sobre mapa, formularios compactos y división de una tarea en tramos.
- La prueba del plazo reproduce ramas paralelas de 8 días; agregar una
  precedencia lo cambia a 9, y una fecha mínima adicional a 10. No se alteró
  el cálculo correcto para sumar tareas que se ejecutan en paralelo.
- La base migra al esquema 24 para que versiones anteriores no interpreten
  una tarea parcial como otra asignación completa de la misma partida.
- Costos y asignaciones de tramos se validan en Rust; superar el 100 % se rechaza
  sin modificar la revisión guardada. El monto base de los tramos no se transmite
  cuando el observador no tiene permiso de presupuesto.
- La cartografía OpenStreetMap se sustituye por imágenes de prueba durante los
  tests de navegador; el mapa real requiere Internet en el equipo del usuario.
- No se compiló un AppImage ni se creó una etiqueta de publicación.
Las 13 pruebas nativas pasan con la configuración del mapa y el esquema 24.

## Gantt calendario, excepciones laborables y dirección del mapa

- Pruebas del núcleo: 25; almacenamiento: 78; JavaScript: 37.
- La duración del Gantt usa fechas calendario reales; los cálculos conservan
  días laborables. Se prueba el resize que atraviesa un sábado y el ajuste del
  comienzo al siguiente laborable.
- Los tests incluyen semanas ISO que cruzan de año, jornadas laborables sobre
  fines de semana y feriados previos, y fechas explícitamente no laborables.
- Se verifica selección múltiple entre meses, descripciones persistentes,
  conservación del mes al guardar y la distribución de calendario/resumen.
- Las direcciones se prueban con respuestas simuladas de Nominatim: caché por
  punto, carga de calle/localidad/provincia y conservación de coordenadas ante
  una falla del servicio. No se consultan direcciones durante el arrastre.
- La migración al esquema 25 evita que programas anteriores ignoren las jornadas
  laborables excepcionales. Revisiones y líneas base conservan sus descripciones.
- No se generó AppImage ni etiqueta de publicación.
La batería completa de navegador pasa con 59 casos y las 13 pruebas nativas
pasan con la configuración de Nominatim y el esquema 25. La compilación del
frontend y las comprobaciones de formato Rust son correctas.

## Previsión financiera, acopio y alquileres mensuales

- Núcleo: 26 pruebas; almacenamiento: 84; JavaScript: 38; navegador: 63;
  integración nativa: 13. Total: 224 casos, todos correctos.
- Alquileres mensuales: prorrateo de febrero bisiesto, meses completos, vencimientos
  ajustados al mes y al inicio del contrato, rechazo de períodos invertidos o
  excesivos. Las facturas parciales y sus pagos reemplazan saldos previstos.
- Caja: se comprueba que un cobro posterior al corte no financia gastos anteriores,
  y que los pagos ya realizados no vuelven a aparecer como deuda pendiente.
- Acopio: declaración sin salida de caja, cantidades consumidas una sola vez por
  la previsión y necesidades ajustadas al avance real de las tareas. Órdenes en
  otra moneda cubren suministro físico sin convertir sus importes.
- Cuadrillas: viernes, quincenas y fin de mes (incluidos años bisiestos), liquidación
  bruta/neta, recuperación limitada al anticipo pendiente y reemplazo de jornadas
  ya liquidadas. El backend rechaza recuperar anticipos inexistentes.
- Los tests de navegador comprueban contrato mensual, guardado de condiciones,
  marcado directo de cortes en el Gantt, materiales por período y vínculo de la
  factura con el mes previsto. La aritmética se valida en Rust, no en el simulador
  de IPC del navegador.
- Exportación Excel conserva cantidades y saldos decimales exactos. La transmisión
  P2P elimina caja, proyección y condiciones de cuadrillas sin permiso financiero.
- Esquema 26: protege las nuevas reglas frente a aplicaciones antiguas.
  La compilación del frontend, el formato Rust y las 13 pruebas nativas pasan.
- No se generaron AppImage, etiquetas ni releases.
- Alcance y supuestos operativos: [guía financiera](FINANCIAL_PLANNING.md).

## Calendario general, acuerdos e índices provisorios

- Núcleo: 28 pruebas; almacenamiento: 87; JavaScript: 39; navegador: 69;
  integración nativa: 13. Total: 236 casos correctos.
- Calendario general heredado, prioridad de excepciones por obra, conservación
  de calendarios anteriores e inmutabilidad de las líneas base históricas.
- Acuerdos ponderados por presupuesto: pesos sumando 100 %, series únicas,
  comparación contra el mes base y elección del último mes común publicado.
- Publicaciones conocidas a la fecha de emisión, coeficientes congelados,
  revisión de valores mediante nuevas publicaciones y diferencias positivas o
  negativas. Una diferencia liquidada no vuelve a reclamarse; las correcciones
  se comparan con el último coeficiente ya liquidado.
- Adicionales fijos/ajustables, autorización, reparo selectivo, límites de anticipo
  y separación entre saldo contractual base e importes adicionales/ajustados.
- La integración IPC verifica alta del calendario y publicaciones, guardado del
  acuerdo y cálculo provisorio. Las exportaciones conservan puntajes, fuentes,
  adicionales y certificados de origen. P2P elimina los datos restringidos.
- El navegador comprueba la gestión general, excepciones locales, condiciones
  ocultas, tabla de certificaciones, acuerdo CAC/IPC, adicionales y diferencias,
  movimiento/eliminación de cortes sin perder su fecha y conservación de condiciones
  sin guardar al intentar abrir un acuerdo. El Gantt no reconstruye el encabezado
  si el observador de tamaño informa el mismo ancho.
- Compilación Vite y formato Rust correctos. Esquema 27: tablas nuevas y protección
  frente a versiones anteriores que no interpretan estas reglas.
- No se generaron AppImage, etiquetas ni releases.
- Flujo y limitaciones operativas: [guía de índices y certificados](INDEX_ADJUSTMENTS.md).
