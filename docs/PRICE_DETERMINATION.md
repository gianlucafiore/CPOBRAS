# Determinación de precio

Abrí una obra y un presupuesto, y pulsá **Determinación de precio** en la barra
del presupuesto o en su pestaña **Resumen**. A la izquierda están el resumen,
las líneas de cálculo y las plantillas; a la derecha, el concepto seleccionado.

## Cálculos y orden

Cada línea tiene nombre editable, activación, tipo, categoría y operación
(sumar/restar). Reordená mediante el asa **⋮⋮** o las flechas. El orden define
las bases de cálculo:

| Tipo | Base |
| --- | --- |
| % costo directo | Suma de cantidades × costos unitarios guardados de las partidas |
| % subtotal acumulado | Acumulado inmediatamente anterior a esa línea |
| % utilidad anterior | Suma de los conceptos anteriores activos clasificados como Beneficio / utilidad |
| Monto fijo | Importe ingresado |
| Con detalle | Uno de los tres modos descritos abajo |
| Separador / subtotal | Muestra el acumulado; no vuelve a sumarlo |

Los conceptos desactivados se conservan y no afectan al total. Un descuento
clasificado como tal debe restar. No se permiten deducciones que hagan negativo
el acumulado ni referencias a conceptos futuros. Los importes usan decimales
exactos en Rust; la pantalla muestra dos decimales sin redondear las bases
intermedias del cálculo.

En un presupuesto antiguo, la configuración inicial reproduce sus porcentajes
y total anteriores. En particular, el beneficio anterior se calculaba sobre el
subtotal con gastos generales y financieros: cambiarlo a **% costo directo**
es una decisión explícita del usuario.

## Conceptos detallados

Seleccioná una línea con detalle. Agregá grupos e ítems con descripción, unidad,
participación, cantidad y precio. Los grupos admiten subgrupos; doble clic o
**Editar** abre un formulario individual. Eliminar un grupo elimina sus hijos
previa confirmación. La unidad permite buscar y agregar en la biblioteca.

Cada ítem aporta `cantidad × precio × participación / 100`. Los subtotales de
los grupos incluyen a sus descendientes sin duplicarlos en el total. La
participación está entre 0 y 100; cantidades y precios no admiten negativos.

Hay tres modos explícitos:

- **Con detalle**: aplica la suma de los ítems.
- **Monto manual**: aplica el importe ingresado.
- **% CD de referencia**: aplica el porcentaje indicado sobre costo directo.

Cambiar de modo conserva el detalle. La referencia siempre se muestra para
comparar, pero no se suma además del modo elegido. Un detalle vacío aporta cero
si se selecciona **Con detalle**.

## Guardado, plantillas y exportación

La vista previa se recalcula mientras editás. **Guardar determinación** persiste
los cambios y actualiza el total del presupuesto. Salir o recargar con cambios
pendientes pide confirmar el descarte. Las ventanas no se cierran haciendo clic
fuera. Si otra instancia guardó una revisión nueva, se rechaza sobrescribirla y
se indica recargar.

**Guardar plantilla** permite guardar la determinación completa o el detalle
del concepto seleccionado. **Cargar plantilla** muestra plantillas de la misma
moneda; la plantilla completa reemplaza las líneas, mientras que una plantilla
de detalle reemplaza solo el detalle, modo, monto y referencia seleccionados.
Los cambios cargados requieren guardar la determinación. Guardar una plantilla
no guarda automáticamente el presupuesto.

**Exportar** genera Excel, PDF, CSV o JSON de la determinación completa o el
concepto seleccionado. La ruta aparece al terminar. La exportación usa la vista
previa actual; si hay cambios pendientes, guardalos también para persistirlos.
En **Herramientas / exportar**, el PDF de presupuesto incluye los conceptos
activos y Excel agrega una hoja de Determinación de precio. El JSON completo de
presupuesto conserva la configuración para importarla en un presupuesto nuevo.
El CSV de partidas conserva su formato de intercambio habitual.

Duplicar un presupuesto y las plantillas completas de presupuesto conservan
la determinación. Incorporar patrones de cómputo conserva la determinación del
destino; los cargos del origen no se copian junto con las partidas.

Los presupuestos emitidos permiten consultar y exportar, pero no editar. Las
certificaciones distribuyen el precio final proporcionalmente al costo directo
de las partidas; con costo directo cero y cargos fijos no hay una distribución
válida y se rechaza certificar. Si un cambio en cantidades deja deducciones
mayores al acumulado, la pantalla permite reparar la determinación y bloquea
la emisión hasta corregirla.

## Prueba sugerida

1. Prepará un presupuesto con costo directo 1.000.
2. En Gastos generales elegí **% CD de referencia**, con referencia 10: aporta 100.
3. Seleccioná Beneficio, elegí **% costo directo** y poné 15: aporta 150.
4. En Impuestos poné 21 sobre subtotal: aporta 262,50. Total: 1.512,50.
5. Cambiá Gastos generales a **Con detalle**; agregá un ítem de cantidad 2,
   precio 100 y participación 25: aporta 50. El total será 1.452,00.
6. Guardá, volvé al presupuesto y revisá su Resumen. Reabrí, guardá una plantilla,
   duplicá el presupuesto y exportá PDF y Excel para comparar los valores.

La migración 18 agrega las definiciones y plantillas sin reemplazar partidas ni
precios existentes. Los presupuestos con configuración personalizada se
exportan en JSON de presupuesto versión 2; se siguen importando los de versión 1.
