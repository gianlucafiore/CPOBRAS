# Memoria, impresión y gastos indirectos

Memoria descriptiva es la primera pestaña del grupo Presupuesto. Su texto es público y pertenece a esa versión del presupuesto, no a la obra completa. Se guarda automáticamente y se reutiliza al imprimir o exportar con memoria. La memoria de una versión emitida es de solo lectura; duplicarla permite preparar una nueva revisión.

Imprimir presupuesto conserva título, fecha, referencia, condiciones, presentación, contenido, orientación y formato. Guarda al quitar el foco, al cambiar selectores, antes de generar y al salir. Una única cola serializa la memoria y las preferencias con revisión optimista. Los errores conservan un borrador local por base y presupuesto, muestran reintento y bloquean la salida normal hasta resolver el guardado. Si otra ventana cambia los datos, se presentan ambas versiones para elegir. Los respaldos de la base, las duplicaciones y el intercambio JSON completo conservan estos datos (esquema 40, formato 10; se aceptan versiones anteriores).

Organizaciones → abrir una organización propia → Gastos indirectos permite definir gastos fuera de obra: importe de cada pago, frecuencia puntual/mensual/anual y meses o años de referencia, en una moneda. La base es la suma de importe × meses/años de referencia. Esta referencia es un horizonte de cálculo: un seguro o abono mensual puede seguir cargado indefinidamente. Por ejemplo, un seguro de 120.000 al mes forma una base mensual de 120.000 con referencia 1, o una base anual de 1.440.000 con referencia 12. Estos datos son privados de la organización y no forman parte de su identidad pública.

En Determinación de precio, «Gastos indirectos de la organización» calcula la base para el plazo estimado del presupuesto (Gastos Directos → plazo de obra, 6 meses por defecto). Cada gasto mensual usa importe × meses; cada anual, importe × meses / 12; los puntuales se suman una vez. Se aplica después el porcentaje de participación de este presupuesto. Los períodos de referencia del listado de la organización no limitan la duración del presupuesto. La moneda debe coincidir. El detalle queda como un concepto normal editable, reordenable y desactivable. Cada partida del detalle conserva su participación; cambiar la organización no modifica copias previas. La importación ofrece reemplazar un concepto existente del mismo nombre para evitar duplicarlo. No se incluyen estos gastos administrativos en la provisión de insumos de obra.

El antiguo concepto vacío Gastos generales se omite. Cualquier configuración anterior con porcentajes, importes o detalle se conserva para revisar su clasificación sin cambiar el precio existente.

Los PDF dibujan ² y ³ como dígitos elevados con la fuente activa. Esto conserva unidades como m² y m³ en presupuestos, ACU e informes, sin depender de la disponibilidad de esos glifos en las fuentes estándar del lector PDF.

Para este cambio no se ejecutaron tests ni compilaciones, por indicación del usuario.

El registro de auditoría utiliza una columna de clave que exista en cada tabla. En gastos indirectos corresponde `organization_id`; los disparadores se regeneran al abrir la base para corregir instalaciones anteriores, sin borrar datos ni cambiar el esquema.

Los gastos indirectos recurrentes nuevos se vinculan al plazo del presupuesto. En cada detalle se puede marcar «Usar meses distintos». Los detalles anteriores conservan sus importes; el botón «Vincular gastos recurrentes anteriores al plazo de obra» convierte sus meses/años de referencia en un gasto ligado al plazo actual. Los presupuestos emitidos mantienen sus datos.

## Edición y presentación de la memoria

La pestaña Memoria descriptiva y el centro de exportación comparten un editor
con títulos, negrita, cursiva y listas numeradas o con viñetas. La barra aplica
Markdown al texto seleccionado; Ctrl/Cmd+B y Ctrl/Cmd+I alternan el énfasis.
La vista previa muestra el mismo formato básico usado en el PDF. El contenido
se guarda como texto en el campo existente, conservando el autoguardado, los
borradores y los controles de revisión. El HTML se muestra como texto y no se ejecuta.

En «Memoria descriptiva, planilla y precio», la memoria abre la propuesta con
los datos públicos del emisor, la obra y el cliente. La cotización comienza
en una página nueva, después de toda la memoria. Un texto extenso continúa
en las hojas necesarias sin mezclarse con la tabla ni cortarse. Las opciones
«Planilla y precio» y «Memoria y precio» siguen disponibles. La opción predeterminada es «Memoria descriptiva, planilla y precio», también
para presupuestos nuevos que todavía no tienen texto. Una elección de
impresión ya guardada se conserva.
