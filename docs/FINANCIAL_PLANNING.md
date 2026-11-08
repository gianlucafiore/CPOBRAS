# Previsión financiera de obra

## Preparación

1. Elegí el presupuesto de referencia de la obra y guardá su cronograma.
   Las tareas deben estar vinculadas con partidas de ese presupuesto. Para conocer
   materiales y rendimientos necesitan una composición ACU. Los tramos parciales
   conservan su porcentaje de la cantidad y del costo originales.
2. En **Planificación → Certificaciones programadas → Configurar condiciones**, agregá
   fechas de corte, plazo de cobro en días calendario, reparo, recuperación de
   anticipo del comitente y caja disponible. Indicá la moneda de esa caja.
   También podés activar **Marcar cortes de certificación** y pulsar días del
   encabezado del Gantt para agregarlos o quitarlos. Arrastrá un corte para moverlo. Las líneas violetas marcan
   los cierres inclusivos; el período siguiente comienza al día siguiente.
3. En **Datos de obra → Directorios y fichas → Cuadrillas**, definí el costo de
   la jornada de la cuadrilla completa, moneda, frecuencia y porcentaje de
   recuperación de anticipos. La frecuencia inicial es semanal, los viernes;
   también están disponibles el 15 y último día del mes, o el último día mensual.
   Asigná la cuadrilla a las tareas que realizará.
4. En **Gestión de obra → Compras**, creá un depósito y elegí
   **Declarar acopio existente** para los materiales que ya tiene la obra.
   La referencia del acopio se numera automáticamente.
   No uses esta declaración para reemplazar el remito de una nueva compra.
   Indicá cantidades físicas disponibles y su valor de inventario. La declaración
   no crea una deuda ni un pago: si el material aún se debe, registrá la factura.
5. Consultá **Gestión de obra → Finanzas**. Se muestran certificados previstos,
   necesidades por período, acopio aplicado, compras por recibir, cantidades a
   comprar, vencimientos y saldo cronológico. El informe se exporta en PDF o Excel
   seleccionando **Previsión financiera y materiales por período**.

## Alquileres y gastos mensuales

En **Determinación de precio**, elegí un concepto **Con detalle**, modo de ítems,
   y agregá un ítem, por ejemplo “Baños químicos”. Marcá **Calcular por período**:

- Cantidad: unidades alquiladas, no meses.
- Precio: tarifa mensual de cada unidad.
- Participación: porcentaje del gasto imputado a esta obra.
- Inicio y fin: fechas inclusivas del contrato, hasta diez años.
- Vencimiento: día del mes; el 31 se ajusta al último día de un mes más corto.
  En el primer mes nunca se anticipa a la fecha de comienzo del contrato.
- Meses incompletos: prorrateo por días calendario reales de cada mes, o cobro
  de cada mes completo, según lo contratado.

Guardá la determinación. Sus ítems activos y aplicados se incluyen en el precio
final y generan previsiones de pago, sin registrar automáticamente facturas.
Al cargar una **Factura por pagar**, elegí su **Alquiler / gasto mensual previsto**
y período. Dejá el documento de origen sin vínculo: esta factura reduce el monto
que falta facturar de ese mes. Los pagos se concilian contra la factura. Las
facturas parciales no duplican la previsión y se advierte un exceso facturado.
Si una factura incluye varios meses o conceptos, registrá sus importes separados
para poder vincular cada uno con su previsión.

## Anticipos y liquidaciones

Los anticipos son movimientos reales de caja: registrá **Anticipo recibido** del
comitente o **Anticipo pagado** a la cuadrilla/contratista. La previsión descuenta
el porcentaje configurado hasta agotar el anticipo pendiente; no supone un
anticipo que todavía no fue registrado ni vuelve a pagar uno ya entregado.

Para liquidar una cuadrilla directamente, registrá una **Factura por pagar** con
esa contraparte, período, importe bruto, anticipo a recuperar y vencimiento. Se
conservan el bruto y la recuperación; la deuda resultante es neta. No puede
recuperarse más que el anticipo pendiente. Registrá el pago contra esa deuda.
Las jornadas ya liquidadas se excluyen de la previsión de salarios. Si se trabaja
con un subcontrato, usá sus recepciones y certificados, como antes; no registres
además una liquidación directa por el mismo trabajo.

## Criterios del cálculo

- La previsión comienza el día siguiente a la fecha de seguimiento del informe.
  La caja declarada debe representar el saldo disponible para ese corte. No es
  el total histórico de cobros menos pagos ni se agregan otra vez movimientos
  anteriores. Una caja de otra moneda no se convierte: se advierte y se usa cero.
- El consumo previsto se distribuye uniformemente entre los días laborables de
  cada tarea. Se distribuye el saldo de cantidad y costo según el avance real
  declarado de la tarea sobre sus jornadas futuras. Mantené ese avance actualizado;
  la producción ya ejecutada se certifica por el circuito de certificados reales.
  Se respeta el calendario de obra y el porcentaje de sus tramos.
  El acopio se usa cronológicamente una sola vez; las órdenes no recibidas
  reducen las nuevas compras, pero se distinguen del material disponible.
- Las compras se prevén para el día de necesidad. Las órdenes y deudas registradas
  usan sus vencimientos. Si se requiere comprar o pagar anticipadamente, registrá
  la orden con su fecha prevista y verificá el plazo de entrega.
- Las facturas reemplazan certificados ya facturados, y los pagos/cobros parciales
  reducen los saldos abiertos. Las órdenes pendientes agregan solamente su saldo
  no facturado/certificado y no cubierto por anticipos. Los costos de servicios
  imputados a partidas ya contratadas no se vuelven a prever por ese alcance.
- Las cuadrillas con jornada configurada reemplazan la mano de obra ACU de sus
  tareas; los otros componentes siguen calculándose por composición. Cuando falta
  una jornada en la moneda del presupuesto se conserva el costo ACU y se advierte.
- El certificado previsto distribuye el precio final del presupuesto según el
  costo directo programado. Se restan recuperación del anticipo y reparo; el
  ingreso se fecha al corte más el plazo configurado. Es una estimación comercial,
  no producción ejecutada ni un certificado automáticamente emitido.
- Para emitir/cobrar, **Certificaciones** conserva el circuito existente: partidas
  ejecutadas del período, presupuesto emitido, anticipos, reparo y posterior
  factura/cobro. La liberación del reparo no se anticipa sin su registro.
- La necesidad adicional de caja es el mayor déficit del saldo diario previsto,
  con los egresos antes de los cobros del mismo día. Un cobro posterior al corte
  no financia retrospectivamente una compra anterior. Se muestran también
  vencimientos posteriores al último corte en el calendario de fondos.
- Se separan las monedas. Reprogramá tareas vencidas con avance incompleto;
  sus saldos no se inventan sobre nuevas fechas. Los cortes deben cubrir el final
  del cronograma para prever todos los cobros.

Los cálculos monetarios utilizan Decimal. Los cambios se guardan localmente,
se incluyen en las copias de respaldo y conservan las revisiones del cronograma.
Los datos financieros se filtran antes de enviar una obra por P2P. Esta función
no conecta bancos, no envía dinero y no genera comprobantes fiscales.

El esquema de la base se actualiza automáticamente a 27. Una versión anterior
no debe abrir esta base: ignoraría las nuevas reglas financieras. Conservá
siempre una copia de respaldo antes de actualizar.

Acuerdos por presupuesto, índices provisorios, diferencias posteriores y
adicionales: [guía de calendario e índices](INDEX_ADJUSTMENTS.md).
