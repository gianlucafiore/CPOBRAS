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
