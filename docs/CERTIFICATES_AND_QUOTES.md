> La interfaz actual y su distribución se describen en [Libro de obra y adjudicaciones](SITE_BOOK_AND_PROCUREMENT.md).

# Certificados, cotizaciones y contratos

## Planificación y avance oficial

Planificación abre en PERT; Gantt usa las mismas tareas y precedencias. Allí se
marcan las fechas de corte, sin mostrar cobros, índices ni previsiones financieras.
El avance real de la tarea es de consulta: lo determina la cantidad de certificados
emitidos al comitente. En tareas divididas, la cantidad se distribuye entre tramos
por orden de inicio programado. El relleno rayado del Gantt indica ese avance.
Los partes diarios siguen registrando producción y rendimientos por separado.

## Certificar al comitente

1. Con el presupuesto emitido, abrí **Gestión de obra → Certificaciones**.
2. Elegí el período y **Abrir / modificar avances**, o **Modificar avances** junto
   al corte previsto. Hay un solo borrador abierto por presupuesto; volver a abrirlo
   recupera ese borrador.
3. Ingresá el **porcentaje acumulado** de cada partida. El sistema calcula el avance
   del período descontando lo ya emitido. No permite retroceder ni superar 100 %.
4. Podés incorporar avances aprobados de contratistas, adicionales puntuales con
   motivo y autorización, y diferencias de ajuste de certificados anteriores.
5. **Guardar borrador** conserva lo trabajado sin registrar avance oficial.
   **Generar PRELIMINAR PDF** guarda y abre un documento para pedir aprobación.
6. Cuando esté aprobado, incluso verbalmente, **Emitir certificado aprobado** lo
   numera, fecha y cierra. Se abre el PDF formal en el lector predeterminado.
   Los emitidos se consultan o exportan; no se vuelven a editar.

El PDF incluye todas las partidas, aunque no tengan avance, rubros, cantidades,
porcentajes anterior/del período/acumulado/restante, precios base e importes.
Incluye cada índice con sus puntajes base y actual y peso, el coeficiente ponderado,
el ajuste monetario, adicionales, diferencias, anticipo, reparo y neto.
Los datos de impresión y el cálculo quedan congelados al emitir. Un error de
emisión requiere analizar su rectificación; no hay edición retroactiva.

En **Acuerdo, anticipo y reparo del presupuesto** se define el porcentaje de
recuperación y demora de cobro independientemente de que haya índices. Este acuerdo
se prepara con el presupuesto en borrador. La recuperación del anticipo se aplica
antes del índice y se limita al saldo efectivamente recibido; sin anticipo es cero
y no aparece en el PDF. Los certificados anteriores conservan su cálculo anterior.
La ausencia de una publicación mantiene el último mes común disponible; una nueva
publicación propone su diferencia para un certificado posterior.

## Pedidos de cotización

En **Compras y almacenes**, elegí **Pedir materiales** o **Pedir trabajos a
contratistas**. Seleccioná insumos o partidas y sus cantidades. Usá un nombre claro
como “Corralón casa”, “Sanitarios” o “Albañilería”. Definí alcance, entrega, moneda,
pago, validez e impuestos; la solicitud no contiene costos internos.

Guardá y exportá PDF para enviar o XLSX para completar. El nombre de archivo es
editable. La planilla tiene identificadores estables: el proveedor puede reordenar
filas pero debe conservarlos. Completa precio unitario y observaciones; los precios
usan punto decimal y no llevan separador de miles. Vacío significa sin cotizar;
cero es un precio explícito. Las cantidades se conservan de la solicitud original.

Para registrar una respuesta, elegí proveedor y archivo XLSX, pulsá **Revisar
respuesta** y luego **Confirmar cotización del proveedor**. Se conserva una oferta
con sus precios y origen. Nunca modifica automáticamente el presupuesto. La
comparación y las órdenes de compra siguen disponibles en el historial operativo.
La lectura automática de cotizaciones PDF mediante IA queda fuera de esta versión.

## Contratistas y cuadrillas

En **Contratistas y cuadrillas**, registrá un subcontrato con responsable, partidas,
cantidades parciales y precios pactados. Definí alcance (mano de obra o provisión y
ejecución), modalidad y frecuencia por separado. Se admiten cantidades, porcentajes,
importe fijo por período, jornadas u horas; las tarifas por tiempo requieren un
período y un tope total. Para apoyos que no producen cantidades físicas, desmarcá
la opción de aportar ejecución física. Las asignaciones físicas no pueden sumar
más que la cantidad presupuestada.

Semanal corresponde a viernes; quincenal a 15 y fin de mes, mensual a fin de mes.
Se puede indicar demora de pago, anticipo recuperable y fondo de reparo. Registrá
el anticipo pagado en Finanzas, vinculado al contrato.

En Certificaciones, elegí el contrato, cargá sus avances o jornadas/horas y aprobá
su certificado mediante la emisión. El costo se reconoce una sola vez y el avance
físico queda disponible para el borrador del comitente, a sus precios de venta.
El vínculo conserva qué cantidades se incorporaron y evita volver a importarlas.
No emite automáticamente al comitente. No registres otra recepción del mismo
trabajo: los contratos nuevos usan su certificado como aceptación y liquidación.
Los contratos anteriores conservan su circuito de recepción y liquidación.

## Finanzas

El tablero muestra próximo corte, fecha prevista de cobro, cobro posible,
egresos hasta ese cobro, otros ingresos, caja declarada y necesidad máxima de
capital adicional durante ese intervalo. Distingue avance oficialmente certificado
de avances de contratistas aprobados y pendientes de incorporar. Una previsión
no es un certificado emitido ni un cobro real.

La previsión incluye compras después de descontar acopio y órdenes pendientes,
contratos y facturas conciliados, cuadrillas y gastos mensuales detallados en
Determinación de precio. **Configurar caja disponible** define el saldo inicial
de la previsión a la fecha de seguimiento y su moneda, sin crear movimientos.

Los avisos identifican partidas sin programar, trabajos atrasados incompletos,
cargos sin calendario de egresos y obligaciones en otra moneda. Completá estos
datos antes de tomar la previsión como necesidad total de fondos.

## Datos y compatibilidad

Migración 28: borradores con revisión, hojas emitidas inmutables, vínculos de
avances y solicitudes de cotización. La emisión y el cierre del borrador se
confirman en una transacción. Las vistas preliminares revierten la transacción y
no consumen numeración ni cantidades. El formato de intercambio 4 agrega
condiciones de certificación; se siguen aceptando formatos 1, 2 y 3.
Las copias P2P no incluyen borradores. Los PDF de certificados solo se incluyen
cuando todos sus apartados de datos están autorizados por el propietario.

## Pedidos, acopio en proveedor y canjes

Los pedidos sin pagos ni recepciones permiten **Editar pedido**. Cada edición se
conserva como una revisión; al registrar movimientos el pedido queda fijado.
**Registrar entrega**, **Registrar pago** y **Declarar acopio existente** usan
ventanas compactas. Entregas y pagos aceptan un PDF o imagen de hasta 10 MB,
guardado junto al movimiento y accesible desde el pedido.

**Acopiar en proveedor** registra cantidades pagadas y reservadas, con comprobante
opcional. **Solicitar entrega** deja constancia del retiro solicitado; la recepción
se confirma cuando el material llega. El acopio del proveedor y **Material recibido
en obra** son cantidades distintas. Una recepción parcial reduce el primero y
agrega al segundo.

**Canjear materiales** cancela únicamente cantidades pendientes de entrega,
registra el motivo y el importe reconocido por el proveedor. Ese importe queda
como saldo en la misma obra, proveedor y moneda. **Aplicar saldo** lo utiliza en
otro pedido sin generar un pago nuevo. El historial conserva el pedido y el pago
originales. Los materiales cancelados vuelven a quedar pendientes en la solicitud.
Los documentos fiscales se siguen conciliando desde Finanzas.

Ejemplo: un pedido pagado por $100.000 se cancela antes de entregarse y el
proveedor reconoce $100.000. Si el reemplazo cuesta $85.000 quedan $15.000 a favor;
si cuesta $120.000, deben pagarse $20.000 adicionales.

El lápiz de edición de solicitudes aparece dentro de cada fila al pasar el mouse
o darle foco con el teclado. Los precios de la comparativa siguen siendo
unitarios sin IVA y se confirman con **Guardar precios**.

**PDF para enviar** pide destino y nombre mediante el diálogo del sistema y abre
el PDF después de guardarlo. La planilla pide destino sin abrirla. Cancelar el
diálogo no guarda un documento. La ruta guardada aparece en la notificación
inferior derecha. Si falta un lector PDF, el archivo permanece guardado.

## Edición de certificados y subcontratos — noviembre de 2026

- Abrir un certificado permite corregir adicionales incompletos sin intentar
  guardar primero. Un adicional totalmente vacío se ignora; uno parcial queda
  disponible para completar o quitar. El guardado usa la revisión vigente.
- El cálculo de vista previa usa las reglas de emisión, dentro de una transacción
  que se revierte: actualizar los totales no guarda ni emite documentos.
- La tabla y los adicionales se desplazan dentro del popup. El pie permanece
  visible con base, anticipo, ajuste, adicionales, diferencias, reparo y neto.
- El acuerdo vigente de anticipo y reparo se aplica a los certificados abiertos;
  los ya emitidos conservan sus valores. En certificados del comitente, la
  recuperación aplica el porcentaje contractual hasta el tope del acuerdo.
  El registro del cobro en Finanzas se mantiene separado; si falta conciliarlo,
  el informe lo indica sin inventar un ingreso de caja.
- Los certificados de subcontrato se consultan en un popup. Sus adicionales
  requieren descripción e importe, con motivo opcional y sin autorización del
  comitente. No consumen cantidades físicas adicionales de la partida.
- **Reducir / dar de baja** modifica únicamente el alcance pendiente y registra
  la causa. Las cantidades certificadas y los documentos anteriores se conservan.
  Lo liberado puede adjudicarse a otro contratista desde la solicitud original.

El pago de materiales implica acopio en proveedor. El botón de declaración manual
se retiró. En pagos parciales, la cobertura se distribuye en el orden de los
materiales del pedido, conservando lo ya recibido; lo no cubierto continúa pendiente.
Los canjes dejan saldo en el mismo proveedor, obra y moneda. Al registrar un nuevo
pedido se aplica automáticamente el saldo disponible hasta cubrir su importe:
no se agrega un segundo pago. La tabla distingue los pagos históricos, el importe
cubierto, el saldo a favor y la diferencia pendiente.

El PDF de certificados usa A4 apaisado, filas compactas, rubros diferenciados y
liquidación separada. Incluye todas las partidas, precios unitarios y totales,
publicaciones base/actuales de cada índice, pesos, coeficiente, descuentos,
retenciones y neto, incluso cuando alguna deducción sea cero.
