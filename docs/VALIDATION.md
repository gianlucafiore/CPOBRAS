# Validación de desarrollo — 2026-11-05

Las comprobaciones se ejecutan en la máquina de esta sesión, sobre Linux,
con Node 24.22.1 y Rust 1.99.1. `tools/check.sh` reúne los checks reproducibles.

| Comprobación | Evidencia |
| --- | --- |
| Rust, núcleo y almacenamiento | 47 tests: 17 de dominio y 30 de persistencia/regresión |
| Escritorio Tauri | 2 tests nativos: recorrido IPC y regresión GLib optimizada |
| JavaScript | 17 tests, con aislamiento de procesos desactivado explícitamente en el runner |
| Chromium | 10 recorridos de interfaz sobre DOM real y un puente IPC de prueba |
| Formato Rust | Workspace y aplicación Tauri |
| Frontend de producción | Vite build, incluyendo los módulos de Excel y PDF |
| Ejecutable Linux | Compilación con `custom-protocol` y arranque WebKitGTK en Xvfb |
| Dependencias | Ver [DEPENDENCIES.md](DEPENDENCIES.md) |

Los doctests y el binario de tests sin casos propios informan cero tests; no se
cuentan como cobertura adicional. Los tests de Chromium no sustituyen la
integración nativa: el recorrido IPC usa Tauri con su configuración real y
comprueba clientes, obras, ACU, presupuesto emitido, directorios, listas de
precios, ACU anidados, importación, cronograma, línea base, copia/restauración,
exportación y rechazo de ventanas/orígenes sin permisos.

## Regresiones comprobadas

- Importes por encima del rango entero exacto de JavaScript; redondeo decimal,
  sumas de rubros, descuentos de metrados y presentación de datos inválidos.
- Operaciones financieras extremas retornan errores de desborde.
- Ediciones masivas e importaciones inválidas revierten sus cambios y eventos.
- Las versiones duplicadas conservan identidad de partida, tasas financieras,
  rubros y fórmulas; los cambios manuales de cantidad invalidan una fórmula vieja.
- Arrastre entre rubros, doble clic, menú contextual propio y asignación directa de insumos con composiciones privadas; ver [UX_REVIEW.md](UX_REVIEW.md).
- Los presupuestos emitidos, las líneas base y el historial no se alteran.
- Las partidas usadas por el plan actual tienen referencias SQL que impiden
  borrarlas accidentalmente; las asignaciones conservan referencias a recursos.
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
  de capacidad ni reemplaza los partes diarios de etapas posteriores.
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
