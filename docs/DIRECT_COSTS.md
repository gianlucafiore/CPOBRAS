# Gastos Directos y autoguardado

Las pestañas del presupuesto distinguen la partida seleccionada (ACU y Metrados) del presupuesto completo (Memoria descriptiva, Insumos, Gastos Directos y Resumen).

Gastos Directos contiene insumos del catálogo que no pertenecen a una partida: equipos, sereno, protecciones, servicios u otros recursos. Cada fila conserva descripción, unidad, precio y cantidad. El encabezado guarda el plazo estimado de obra, de 6 meses por defecto y editable, incluso fraccionario. Cada gasto puede ser puntual o mensual. Los mensuales nuevos usan ese plazo; el check «Usar meses distintos» habilita una duración propia. Los mensuales guardados antes de esta función conservan sus meses como excepción hasta desmarcar el check. El importe es cantidad × precio × meses; para un gasto puntual se usa un solo período. El número de meses calcula el costo total; las fechas efectivas de pago se administran en Finanzas.

La composición se comparte con un único concepto de Determinación de precio, activado por defecto. Se puede cambiar su nombre, ordenarlo o desactivarlo. Quitar ese concepto del cálculo conserva los insumos y sus períodos. No se crea una partida ficticia. Los insumos siguen incluidos en la provisión total aunque el concepto esté desactivado, del mismo modo que los componentes de ACU que no se cobran al comitente.

Los cambios de Determinación de precio y de los campos de Gastos Directos se guardan automáticamente. El indicador muestra pendientes, guardando, guardado o error. El botón de guardado permite reintentar. Los formularios de alta de insumos y detalles se confirman con Guardar; mientras tienen cambios pendientes, el cierre normal de la aplicación pide terminarlos o cerrarlos.

El guardado se serializa con revisión optimista para conservar las ediciones realizadas durante una escritura. Un borrador local por base y presupuesto permite recuperar cambios tras una interrupción; un conflicto con otra revisión requiere revisión explícita. El cierre de la ventana espera el guardado y se bloquea ante un error.

El esquema de base pasa a 39 para impedir que motores anteriores reescriban estos datos. El intercambio completo de presupuestos usa formato 9 y acepta los formatos anteriores. Copias, exportaciones JSON y Excel conservan la composición y los meses. En Excel, Detalle precio alimenta Precio e Insumos mediante fórmulas editables.

El plazo se comparte con los gastos indirectos recurrentes incorporados desde la organización. Los gastos mensuales se multiplican por los meses de obra; los anuales se prorratean por meses/12, y los puntuales se suman una vez. Las copias de presupuestos mantienen plazo y excepciones. Las plantillas de detalle se adaptan al plazo del presupuesto de destino. En el Excel completo, Precio!B2 es editable y alimenta los factores de los gastos vinculados.
