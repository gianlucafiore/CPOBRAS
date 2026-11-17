# Memoria, impresión y gastos indirectos

Memoria descriptiva es la primera pestaña del grupo Presupuesto. Su texto es público y pertenece a esa versión del presupuesto, no a la obra completa. Se guarda automáticamente y se reutiliza al imprimir o exportar con memoria. La memoria de una versión emitida es de solo lectura; duplicarla permite preparar una nueva revisión.

Imprimir presupuesto conserva título, fecha, referencia, condiciones, presentación, contenido, orientación y formato. Guarda al quitar el foco, al cambiar selectores, antes de generar y al salir. Una única cola serializa la memoria y las preferencias con revisión optimista. Los errores conservan un borrador local por base y presupuesto, muestran reintento y bloquean la salida normal hasta resolver el guardado. Si otra ventana cambia los datos, se presentan ambas versiones para elegir. Los respaldos de la base, las duplicaciones y el intercambio JSON completo conservan estos datos (esquema 38, formato 8; se aceptan versiones anteriores).

Organizaciones → abrir una organización propia → Gastos indirectos permite definir gastos fuera de obra: importe por período, periodicidad puntual/mensual/anual y cantidad de períodos, en una moneda. La base es la suma de importe × períodos. Estos datos son privados de la organización y no forman parte de su identidad pública.

En Determinación de precio, «Gastos indirectos de la organización» permite copiar esa base con un porcentaje de participación. La moneda debe coincidir. El detalle queda como un concepto normal editable, reordenable y desactivable. Cada partida del detalle conserva su participación; cambiar la organización no modifica copias previas. La importación ofrece reemplazar un concepto existente del mismo nombre para evitar duplicarlo. No se incluyen estos gastos administrativos en la provisión de insumos de obra.

El antiguo concepto vacío Gastos generales se omite. Cualquier configuración anterior con porcentajes, importes o detalle se conserva para revisar su clasificación sin cambiar el precio existente.

Los PDF dibujan ² y ³ como dígitos elevados con la fuente activa. Esto conserva unidades como m² y m³ en presupuestos, ACU e informes, sin depender de la disponibilidad de esos glifos en las fuentes estándar del lector PDF.

Para este cambio no se ejecutaron tests ni compilaciones, por indicación del usuario.
