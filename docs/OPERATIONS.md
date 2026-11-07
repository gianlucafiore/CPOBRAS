# Gestión de obra — etapas 6 a 10

Desde **Inicio**, abrí una obra y luego **Gestión de obra**. La obra permanece
fija en todas las pestañas. Usá la barra **Presupuesto activo** para elegir la
versión (con confirmación) y la fecha de corte para el informe.
Las cinco pestañas cubren compras y almacenes, producción, certificaciones,
finanzas y tablero. Cada tipo de documento explica su uso en pantalla.
Los proveedores y subcontratistas se cargan desde **Inicio → Organizaciones → Directorios**;
los centros de costos y contratos de la obra, en **Datos de obra**. El historial
de gestión reúne sus documentos y muestra el presupuesto de origen de cada uno.

## Compras, contratación y stock

1. Revisá las necesidades calculadas desde los materiales de los ACU del
   presupuesto. Se muestran cantidades necesarias, solicitadas, ordenadas,
   recibidas, consumidas, disponibles y faltantes.
2. Registrá una solicitud y un pedido de cotización vinculado. Cargá una oferta
   por proveedor. La comparativa muestra importe, moneda y cobertura; una oferta
   parcial se distingue de una completa. El detalle permite comparar sus precios.
3. Creá la orden de compra, de servicio o el subcontrato, con contraparte,
   renglones, condiciones, alcance, plazos y vencimiento previsto.
4. Creá depósitos con ubicación/estante. Registrá remitos vinculados a órdenes:
   se sugieren cantidades pendientes y se admiten recepciones parciales hasta el
   saldo. Los precios se toman del documento original.
5. Registrá consumos imputados a partidas y/o centros de costos. La valuación
   utiliza promedio ponderado por depósito, insumo y moneda. Las devoluciones
   revierten el consumo original, hasta su saldo, y las transferencias conservan
   el valor entre depósitos, incluso de distintas obras.

Una recepción de materiales crea inventario; el costo real aparece al consumirlo.
Una recepción de servicios genera costo real; el certificado y la factura
posteriores no vuelven a sumarlo. Para un gasto sin materiales, registrá orden y
recepción de servicio y luego su factura. Una factura aislada crea deuda, no un
costo físico adicional. Stock de ARS y USD se mantiene separado; las conversiones
requieren un precio explícito y no ocurren silenciosamente.

Los movimientos de stock se registran en orden cronológico para conservar su
valuación. Al agotar una existencia o devolver totalmente un consumo se conserva
el remanente decimal exacto, sin residuos de división. La reserva de escritura
SQLite y el control del saldo ocurren en la misma transacción.

## Ejecución y producción

El parte diario admite responsable/cuadrilla, observaciones, incidencias,
imprevistos y hasta ocho fotografías JPG/PNG de 2 MB. Cada renglón permite elegir:

- Producción: cantidad ejecutada de una partida. Se controla el acumulado contra
  la cantidad presupuestada; una ampliación requiere revisar el presupuesto.
- Asistencia/mano de obra: persona o cuadrilla, presente/ausente/justificada,
  horas y costo por hora. Se puede imputar a una partida sin repetir producción.
- Uso de equipo: equipo, horas y costo por hora, separado de las horas de personal.

El costo diario es horas por tarifa; los consumos de materiales se registran en
almacenes. No cargues el mismo costo también como servicio aceptado. La tabla
muestra producción, avance por partida/rubro y rendimiento real en horas por
unidad; compara con el ACU cuando su mano de obra está expresada en horas
(h/hs/hora/horas). Otros tipos de unidad no se convierten sin un factor explícito.
Las tareas de planificación ya vinculadas a partidas se identifican por ese mismo
vínculo; el avance manual del plan se conserva como una medición independiente.

## Certificaciones, anticipos y ajustes

Emití el presupuesto de referencia antes de certificar. Registrá el período y las
cantidades nuevas; no cargues acumulados como si fueran cantidades del período.
El sistema conserva cantidades anteriores, del período y pendientes por partida,
así como anterior, bruto, acumulado, pendiente, reparo y neto del documento.
Los certificados de obra aplican la determinación de precio del presupuesto emitido;
los de subcontratista usan los precios y límites de su contrato.

Registrá primero el anticipo recibido o pagado en Finanzas. Su descuento en los
certificados no puede superar el saldo pendiente de recuperar. El reparo se
retiene con el porcentaje indicado y se libera con un documento financiero
vinculado al certificado; la liberación crea el saldo a pagar/cobrar correspondiente.

Los períodos no se solapan ni retroceden dentro del mismo presupuesto y
contraparte; en subcontratos el control distingue cada contrato. El presupuesto y
cada documento emitido permanecen inmutables.

Para redeterminación, cargá índices CAC, IPC o INDEC con valor positivo, período,
fecha de publicación y URL de la publicación. **La fuente la verifica la persona
que carga el índice: no hay descarga ni validación automática del contenido de la
URL.** Las series deben corresponder al alcance contractual: para índices INDEC
específicos se identifica la publicación y el alcance en las notas.

La fórmula soportada es:

`factor = suma(ponderador × índice_período / índice_base)`

Los ponderadores suman exactamente 1. Se requieren valores registrados para ambos
períodos, publicados antes de la fecha del ajuste. Se guarda factor, base,
importe ajustado y diferencia; un certificado no recibe dos ajustes superpuestos.
Una diferencia negativa se conserva y exporta como tal; no genera automáticamente
una factura o nota de crédito. Las fórmulas especiales de contratos se deben
representar con los ponderadores compatibles antes de aplicarlas.

## Finanzas y resultados

Las órdenes y contratos representan compromisos. Las facturas crean cuentas por
pagar/cobrar y sus vencimientos; los pagos y cobros pueden ser parciales, siempre
vinculados a un origen y sin superar el saldo. Al facturar un certificado o
recepción se evita duplicar la obligación. Las facturas emitidas luego de un pago
directo solo pueden cubrir el remanente no pagado.

El flujo muestra previsiones por vencimiento y movimientos efectivos por mes.
Incluye compromisos no facturados/certificados. Es una previsión recalculada a la
fecha de corte, no una línea base histórica de tesorería. Los importes nunca se
suman entre monedas.

Los resultados por rubro, partida y centro de costos comparan venta certificada
con costos reales imputados. Un costo o ingreso sin clasificación queda visible
como no asignado. Los ajustes generales quedan sin rubro cuando no se distribuyen
por partidas. Esto permite distinguir un resultado devengado del saldo de caja.
La proyección de costo a terminar utiliza la última revisión registrada hasta el
corte; en su ausencia usa costo presupuestado pendiente según producción.

## Tablero e informes

La **Cartera de obras** se consulta desde **Inicio** y conserva el resumen global
con el último presupuesto emitido de cada obra, o el último borrador si no hay
emitidos. Incluye exportación a Excel y PDF.

El tablero dentro de la obra muestra su presupuesto activo, con avance
físico/económico, comparación con avance
programado, fin programado, costo real, pagos, cobros, rentabilidad y resultado esperado. El desvío de costo
ejecutado compara costo real con el costo presupuestado de la producción
registrada; el desvío final compara costo real más costo restante con presupuesto. Emite
alertas de vencimientos, sobrecostos y plazo vencido con producción pendiente.
Cada obra usa el presupuesto emitido más reciente disponible, o un borrador si
no existe emitido; en el informe de una obra se puede elegir explícitamente otra
referencia.

Configurá obra, fecha de corte y contenido: resumen, producción/rendimientos,
flujo, necesidades, existencias, resultados por centro/partida, resultados por
rubro, documentos o cartera. Exportá Excel o PDF. El detalle de un documento
permite exportar su certificado y anexo de cálculo, fuente e índices cuando
corresponde. Los archivos se guardan en `exports` dentro del directorio de datos;
la interfaz muestra la ruta.

## Conservación y alcance

Las migraciones 15 y 16 agregan tablas y referencias sin reiniciar la base. Las copias y
restauraciones incluyen documentos, fotos y stock. Borrar una partida en borrador elimina su composición y metrados, preservando el
catálogo. Las tareas se desvinculan conservando datos e historial. Los documentos
que la usaban conservan su contenido y una referencia a la partida eliminada;
se pueden completar recepciones/devoluciones pendientes sin recrear esa partida.
Los documentos registrados y sus movimientos no se sobrescriben; no hay eliminación de historia ni reversión
general automática de una operación errónea en esta versión. Las devoluciones
cubren consumos de materiales. Los borradores en pantalla piden confirmar el
descarte al cambiar de tipo/obra o salir hacia otra sección.

Se trata de flujos locales funcionales, verificados con datos de prueba. No
incluyen liquidación salarial, contabilidad fiscal, AFIP/ARCA, sincronización
multiusuario ni validación legal automática de contratos. Las etapas 11 y 12
conservan su alcance pendiente. Las evidencias están en [VALIDATION.md](VALIDATION.md).
