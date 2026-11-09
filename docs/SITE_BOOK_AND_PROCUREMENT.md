# Libro de obra, materiales y subcontrataciones

## Libro de obra

Reemplaza la pestaña «Producción». Arriba se redacta el parte; debajo está la lista,
del más reciente al más antiguo y con 30 registros por página.

- **Guardar borrador** asigna número correlativo por obra y fecha/hora del sistema.
- **Editar** permite corregir el texto mientras sea borrador. La identidad y fecha
  de creación no cambian.
- **Confirmar** solicita confirmación explícita. Después, el texto queda bloqueado,
  incluso en la base de datos, y se conserva también fecha/hora de confirmación.
- **PDF de partes confirmados** selecciona por fechas de registro o números,
  imprime en orden cronológico e incluye número, registro y confirmación de cada
  entrada. Los borradores no se imprimen como definitivos.

Los partes diarios anteriores se conservan como entradas históricas confirmadas,
con prefijo `HIST-`, sin modificar su documentación ni sus efectos originales.
Los nuevos partes son descriptivos: no crean costos ni avances certificados.
Las copias P2P incluyen partes confirmados cuando Gestión de obra está autorizada;
no transmiten borradores.

## Materiales y Acopio

En esta pestaña solo hay solicitudes **Por materiales**, su comparación y los
pedidos adjudicados. Se quitaron los formularios genéricos de movimientos y las
viejas tablas desplegables de la vista principal.

Al preparar una solicitud aparecen primero **Materiales necesarios para esta obra**,
resaltados. Provienen de los ACU del presupuesto activo. La sugerencia descuenta
acopio y compras pendientes de recibir. Debajo están los otros materiales del
catálogo, disponibles para seleccionar. No se ofrecen mano de obra ni equipos en
este selector.

A la izquierda está la lista de solicitudes; a la derecha, el pedido seleccionado.
Cada material ocupa una fila, y cada proveedor una columna. **Agregar proveedor**
agrega una columna; los precios se escriben en sus celdas, siempre **unitarios y sin
IVA**. Los subtotales y la oferta más barata se actualizan mientras se escribe.
**Guardar precios** conserva los cambios y controla revisiones para evitar pisar
una respuesta modificada por otra sesión.

Cada columna tiene referencia, condiciones, importación XLSX y bandeja de archivos
PDF/PNG/JPEG/WebP de hasta 10 MB. Los adjuntos se abren con la aplicación del sistema.
Importar una planilla lleva los valores a la comparativa para revisarlos y guardarlos.
No modifica los precios del presupuesto.

### Adjudicar y recibir

**Asignar todo a este proveedor** o **Distribuir pedido** abre un checklist con
cantidades pendientes, precios y proveedor por renglón. Se sugiere el menor precio,
pero puede elegirse otro. Es posible adjudicar cantidades parciales y distribuir
lo restante después.

Confirmar genera un pedido por proveedor, conservando el precio y las condiciones
cotizadas en ese momento. Una cotización modificada después no cambia un pedido
ya adjudicado. Si algún renglón falla, toda la adjudicación se revierte.

Los pedidos muestran dos seguimientos independientes:

- Pago: pendiente, parcial o pagado.
- Entrega: solicitada, parcial o completa, con cantidades recibidas y pendientes.

**Registrar entrega** permite cargar las cantidades de esa recepción; el material
se incorpora al acopio de la obra. Si no existe un depósito, se crea «Acopio de obra».
No se permite recibir más de lo pedido. **Declarar acopio existente** conserva la
carga inicial de material que ya pertenece a la obra.

**Registrar pago** registra un pago directo del pedido sin IVA y controla su saldo.
Si ya hay facturas asociadas, se paga desde Finanzas para conciliarlas. Los importes
de la comparación y adjudicación son netos: la documentación fiscal con impuestos
se gestiona separadamente en Finanzas. No se crea una segunda deuda por recepción
para un pedido que ya recibió pagos directos.

## Subcontrataciones

Reemplaza «Contratistas y cuadrillas». Tiene solicitudes **Por subcontratos** y la
misma disposición de lista, comparativa editable sin IVA, proveedores y adjuntos.
En este caso las filas son tareas del presupuesto.

La adjudicación asigna tareas y cantidades al contratista y define alcance,
modalidad (cantidades, porcentaje, fijo, jornada u hora), frecuencia de pago,
anticipo y reparo. Las tarifas fijas o por tiempo requieren fechas y tope total.
Los contratos de apoyo que no aportan cantidades físicas pueden declararse como
no contribuyentes al avance.

En la lista de subcontratos, **Certificar avances / pagos** abre los certificados
propios del contratista. Se modifica su certificado abierto, se revisa el preliminar,
se emite y se registra el pago. Su avance aprobado puede incorporarse al certificado
del comitente, con los precios de venta de este último, sin emisión automática.

## Certificaciones del comitente

Una sola tabla **Certificaciones pactadas** reúne cortes del Gantt, borrador abierto
e historial emitido. Únicamente el abierto muestra **Modificar avances**. Los
siguientes quedan pendientes; los emitidos permiten **Ver certificado / PDF**.
Los períodos del comitente no se vuelven a introducir manualmente en otro formulario.
También se conservan borradores y certificados anteriores cuyos períodos no
coincidan exactamente con los cortes actuales.

## Consultas históricas y copias

**Consultar al** está en Finanzas. Al pasar a Materiales y Acopio se calculan las
necesidades actuales, sin conservar ocultamente un filtro histórico de Finanzas.
Las copias externas usan su fecha de sincronización. Los adjuntos de cotizaciones
se conservan en la base local y sus respaldos; esta edición no transfiere sus
archivos binarios mediante P2P.

Migración 29: Libro de obra, respuestas de cotización con revisión, archivos y
adjudicaciones inmutables. Se conservan los documentos anteriores y los respaldos
incluyen las tablas nuevas automáticamente.

## Editar solicitudes y confirmar precios

El botón **+ Nueva** crea una solicitud en la pestaña correspondiente. Cada entrada
de la lista tiene **Editar solicitud**, que abre el mismo popup con sus materiales,
cantidades y condiciones. **Guardar cambios** conserva el número, fecha y moneda
originales, así como los identificadores de los renglones y sus precios cotizados.
Los materiales agregados aparecen sin precio en cada proveedor. No se pueden
quitar materiales adjudicados ni reducirlos por debajo de la cantidad ya pedida;
los pedidos existentes conservan sus precios e historial.

El indicador **Cambios sin guardar** aparece al escribir precios o condiciones.
**Guardar precios** lo cambia a **Precios guardados**. Al intentar salir con cambios,
un diálogo ofrece **Guardar y continuar**, **Descartar** o **Cancelar**. Si el guardado
falla, no se abandona la pantalla ni se pierden los valores ingresados.

**Quitar proveedor**, en el encabezado de cada columna, retira esa respuesta de la
comparativa con confirmación. Se conservan sus pedidos adjudicados y adjuntos.
Al volver a agregar el mismo proveedor se recuperan la columna y sus valores.

La migración 30 conserva revisiones de las solicitudes y permite varios materiales
dentro de un mismo pedido adjudicado. También incorpora las ofertas importadas
anteriormente a la comparativa editable.
