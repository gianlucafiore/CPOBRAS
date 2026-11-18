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

## Acuerdo de ajuste del presupuesto

El botón **Acuerdo de ajuste del presupuesto** define mes base, desfase e índices
ponderados. Las publicaciones se cargan una vez en **Inicio → Datos generales**.
Este acuerdo no altera los precios base guardados; se aplica al certificar y
conserva los valores utilizados en cada emisión. [Guía de índices y adicionales](INDEX_ADJUSTMENTS.md).

## Conceptos separados en la cotización del cliente

Cada concepto distinto de impuestos y separadores tiene un segundo check,
desmarcado por defecto. Su texto «Mostrar separado en la cotización» aparece
al pasar el mouse por la fila o enfocar el check con el teclado. Su etiqueta
accesible identifica también el concepto. La selección se guarda automáticamente
y queda bloqueada cuando el presupuesto está emitido.

Un concepto marcado se descuenta del importe distribuido entre partidas y se
muestra con su nombre e importe en la vista previa, PDF y Excel para cliente.
Se respeta su posición respecto de los impuestos. Por ejemplo, con un subtotal
de partidas de 115.262.500, impuestos de 24.205.125 y honorarios posteriores de
47.470.531, el total sigue siendo 186.938.156. Los conceptos no marcados conservan
su distribución entre las partidas; sus nombres y detalles no se publican.

El cálculo de la determinación, las bases porcentuales y el total del presupuesto
se conservan. Los descuentos separados mantienen su signo. El redondeo público
se reparte de forma acumulada para conservar los centavos y el total. El Excel
para cliente suma el subtotal de partidas, los conceptos separados y los impuestos;
los importes separados quedan editables y los impuestos se recalculan sobre la
base pública visible. El respaldo completo conserva la formación interna del precio.

La preferencia viaja en las copias y plantillas de determinación y en el JSON
completo. Esquema SQLite 41 y formato de intercambio 11: versiones anteriores
rechazan estos datos para evitar perder la preferencia al guardarlos.

La aplicación 0.1.11 admite hasta el esquema 40. La rama de desarrollo que
incorpora estos conceptos se identifica como 0.1.12-dev.1 y admite el 41.
En 0.1.11, la lectura de la determinación rechaza campos desconocidos; por eso
no alcanza con quitar la comprobación de esquema para abrir una base actualizada.
Las migraciones de bases anteriores siguen siendo automáticas al abrirlas con
la aplicación nueva. La apertura con aplicaciones anteriores queda bloqueada:
por ahora no hay un modo de solo lectura para esquemas futuros. Un cambio
compatible debe evaluarse tanto en la estructura SQL como en los documentos JSON
y en el cálculo; compartir el sistema operativo no determina la compatibilidad.
