# Patrones de cómputo y precios por presupuesto

En la grilla del presupuesto abrí **Patrones de cómputo**. La ventana permite
consultar presupuestos de cualquier obra y la biblioteca de patrones guardados.
Se puede guardar un patrón desde un presupuesto emitido; incorporar partidas
requiere que el destino esté en borrador.

## Copiar desde otra obra

1. Elegí **Obras y presupuestos**, la obra y el presupuesto de origen.
2. En el árbol marcá rubros completos o partidas individuales. Un rubro incluye
   sus subrubros y partidas; se puede desmarcar cualquier partida y el rubro queda
   parcialmente marcado. El buscador filtra la vista y conserva la selección.
3. Elegí **Solo cantidades, sin precios** o **Traer precios del origen**.
4. Elegí incorporar al final del presupuesto o dentro de un rubro existente.
5. Pulsá **Incorporar selección**.

La selección se agrega al presupuesto abierto. Se conservan cantidades,
unidades, metrados con dimensiones/factores/descuentos y fórmulas de cantidad.
Las partidas individuales conservan los rubros antecesores necesarios para
mantener su jerarquía; no se copian las partidas hermanas no seleccionadas.
Los rubros vacíos también se pueden copiar. Marcar un rubro y una partida que
contiene no duplica esa partida.

Cada rubro, partida y medición recibe un identificador nuevo. Si un código de
rubro ya existe en el destino, se agrega un sufijo (por ejemplo `01-2`). No se
fusionan partidas por nombre ni se reemplazan datos existentes. Los gastos,
beneficios, descuentos e impuestos del destino permanecen iguales.

**Sin precios** deja precio unitario cero, sin vinculación a un ACU que pueda
reintroducir costos al actualizar. Conserva el cómputo, las cantidades y los
metrados. Esta opción permite copiar entre presupuestos de monedas diferentes.

**Con precios** conserva composiciones y precios del origen para insumos nuevos.
Si el insumo ya tiene un precio en el presupuesto destino, se utiliza ese precio
único y se recalcula la partida incorporada. No se convierten monedas de forma
implícita: para traer precios las monedas deben coincidir. Si un presupuesto
antiguo solo conserva el precio de una partida y su ACU de biblioteca ya cambió,
se copia ese precio como manual en lugar de inventar una composición histórica.

## Crear un patrón reutilizable

Armá los rubros, partidas y metrados con el editor habitual de un presupuesto.
Después abrí la ventana, elegí ese presupuesto como origen, marcá lo que querés
reutilizar, ingresá **Nombre del patrón** y pulsá **Guardar selección como patrón**.
También se puede crear el patrón a partir de otra obra o de una selección de un
patrón existente.

La biblioteca guarda una copia independiente. Cambiar o borrar partidas en la
obra de origen no modifica lo guardado. Para usarla, elegí **Patrones guardados**,
el patrón y los elementos de su árbol. La opción de precios también se aplica
al guardar: un patrón guardado sin precios conserva sus cantidades, pero no
recuperará precios que no fueron incluidos.

Los patrones usan el almacenamiento de plantillas existente y quedan incluidos
en las copias de seguridad. Las plantillas anteriores también están disponibles
como origen. No se necesita una migración para esta biblioteca.

## Un precio de insumo dentro de cada presupuesto

La migración 17 agrega la lista de precios de cada presupuesto y conserva la
referencia de las partidas creadas desde ACU de biblioteca.

- Un mismo ID de insumo usa un único precio dentro de un presupuesto.
- Cada partida conserva su consumo/rendimiento por unidad.
- Al editar el precio de un componente, se recalculan todas las partidas de ese
  borrador que usan el insumo. La actualización es una única transacción: si un
  resultado es inválido o desborda el rango decimal, no cambia ninguna partida.
- Al asignar un insumo existente se propone el precio del presupuesto; si todavía
  no tiene uno, se usa el del catálogo en ARS. En presupuestos USD se requiere
  precio explícito cuando no existe un precio propio.
- Los ACU de biblioteca no se modifican. Cada presupuesto conserva sus propias
  composiciones, incluso si varios partían del mismo ACU.
- Las otras obras, versiones y presupuestos emitidos conservan sus importes.
  Duplicar una versión copia sus precios y luego permite cambiarlos de forma
  independiente.
- Los costos reales de stock, partes, servicios y documentos históricos no se
  revalorizan al cambiar precios presupuestarios.
- Una partida con precio manual, sin composición de insumos, sigue siendo manual.
  Las partidas traídas sin precios tampoco se vinculan automáticamente a insumos.

Para borradores anteriores con precios contradictorios, al abrir la aplicación
se toma el precio de la composición guardada más recientemente y se unifica en
ese presupuesto. Los emitidos no se recalculan. Si un ACU antiguo de biblioteca
cambió de unidad, se conserva el precio guardado de la partida como manual para
no reinterpretar sus cantidades con otra unidad.

**Actualizar precios ACU** sigue siendo una acción explícita: toma los precios
actuales de los ACU de biblioteca vinculados y los unifica en el borrador. No
cambia los consumos editados en cada partida ni actualiza presupuestos emitidos.

La ventana de patrones no se cierra al pulsar el fondo. Cambiar el origen o cerrar
con una selección pendiente requiere confirmar el descarte. Guardar un patrón
conserva la selección para poder incorporarla después.
