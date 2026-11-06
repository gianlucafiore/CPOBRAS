# Revisión de uso — 2026-11-05

Se revisó visualmente la grabación de 8:17 enviada por el usuario. El recorrido
muestra creación de obras, rubros y partidas; un intento de insertar desde un
selector de ACU vacío; alta de insumos y navegación por costos, planificación y
organización. La revisión se concentra en los problemas comunicados por el usuario.

## Cambios

- El asa ⋮⋮ permite arrastrar una partida antes/después de otra o sobre un rubro.
  La zona «sin rubro» permite desagruparla. Posición y rubro se guardan juntos.
- Doble clic, Enter sobre la fila y menú contextual abren la edición de partida.
  La selección conserva el nodo de la grilla para que el doble clic funcione.
- Clic derecho en una partida ofrece editar, asignar insumos, duplicar, medir o
  eliminar. Los campos de texto conservan su menú nativo de edición.
- Una partida puede recibir insumos directamente desde la pestaña Insumos.
  El editor guarda consumos por unidad y precios; recalcula el precio unitario y
  el importe. Cada guardado crea una composición propia e inmutable, sin modificar
  el ACU de biblioteca ni las composiciones de otras versiones.
- Las composiciones propias se conservan al duplicar y en el intercambio JSON.
  Si se cambia manualmente el precio o la unidad de una partida, se desvincula su
  composición anterior; cambiar solo cantidad o descripción la conserva.
- Pulsar el fondo de un popup no lo cierra. Cerrar o usar Escape con cambios sin guardar pide confirmar el descarte; mientras se guarda se conserva el formulario.
- El rubro seleccionado se propone al crear partidas. El selector vacío de ACU
  explica el requisito y deshabilita Guardar en lugar de enviar un ID vacío.
- La navegación principal y las pestañas del detalle resaltan la sección activa
  y exponen el estado accesible. Cada sección y pestaña del detalle tiene ayuda.
- Los presupuestos emitidos bloquean arrastre, edición y asignación de insumos.

## Comprobación

Pruebas de almacenamiento cubren reordenamiento, cambio/desasignación de rubro,
rollback, composiciones privadas, versiones, importación y presupuestos emitidos.
Los recorridos de Chromium comprueban los gestos, la navegación, el editor y la
asignación directa; la integración Tauri verifica los comandos y permisos reales.

La migración 14 agrega la identificación de composiciones propias. La migración
se aplica automáticamente al abrir una base existente. No se reinician los datos.

## Ajuste del 6 de noviembre de 2026

El formulario de la partida edita un solo insumo: Agregar abre uno nuevo y doble
clic, Enter o Editar sobre un componente abre ese registro. La composición se
consulta en el panel y guardar conserva los demás componentes. El buscador de
insumos permanece cerrado al abrir el formulario y se despliega al pulsar,
escribir o usar las flechas.

Los campos de unidad usan un buscador de unidades habituales, de la biblioteca
y ya utilizadas. Agregar unidad abre otro formulario, la guarda en la biblioteca
y la selecciona en el campo de origen. Las ventanas anteriores conservan sus
valores y se bloquean mientras la ventana superior está abierta. El fondo no
cierra las ventanas; descartar cambios sigue requiriendo confirmación.

## Eliminación de partidas y cierre de desplegables

La migración 16 guarda una referencia histórica inmutable antes de eliminar una
partida en borrador. Se eliminan en cascada metrados, asignación a rubro, identidad
y fórmula; la composición privada se limpia cuando ninguna otra versión la usa.
El catálogo permanece intacto. Las tareas quedan desvinculadas conservando costo,
recursos y avance; se registra la nueva revisión del plan. Los documentos ya
registrados conservan sus valores y apuntan al registro histórico. Las recepciones
y devoluciones pendientes pueden continuar sobre esos documentos.

Los combos de insumos y unidades cierran al seleccionar, al volver a pulsar el
campo o al hacer clic fuera de su lista, incluido el fondo del popup. Esto solo
cierra la lista: el formulario y sus valores se conservan. Se evita además que
la selección reactive el campo y vuelva a abrir el desplegable.
