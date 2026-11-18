# Resumen, configuración inicial y rendimiento diario

Resumen muestra las filas activas de la Determinación de precio guardada, con sus nombres, orden, porcentajes reales y montos. Se usa el mismo cálculo que en la determinación. Junto a cada subtotal se muestra Factor precio / costo directo = subtotal / costo directo, con hasta cuatro decimales; si el denominador es cero se muestra un guion. El cálculo no cambia el presupuesto.

Los presupuestos nuevos creados desde la aplicación reciben siete conceptos: Gastos indirectos (con detalle), Gastos Directos (con detalle), Gastos financieros (0 % subtotal acumulado), Beneficio (20 % subtotal acumulado), Subtotal, Honorarios profesionales (con detalle, desactivado) e Impuestos (21 % subtotal acumulado). Los presupuestos existentes, las copias y las importaciones conservan su propia configuración. La definición inicial se guarda en la misma transacción que el presupuesto nuevo.

El plazo estimado que se muestra en el editor de gastos indirectos respeta el margen de los campos y resalta los meses.

El menú contextual de un rubro ofrece Eliminar rubro y sus partidas. La confirmación muestra el nombre del rubro y cuántas partidas y subrubros contiene. El borrado es atómico, está limitado a presupuestos en elaboración y comprueba que el contenido confirmado siga siendo el mismo. Las partidas se eliminan mediante el mecanismo existente que conserva las referencias históricas de planificación y gestión. La eliminación conversacional de rubros por IA mantiene su comportamiento previo de conservar las partidas.

La biblioteca de insumos agrega Rendimiento por día hábil, opcional y positivo. Su unidad siempre es la del insumo (por ejemplo m²/día hábil), sin un segundo selector. Se puede cargar o ajustar al asignar o editar el insumo de una partida. Cada partida conserva su propio valor, sin seguir cambios futuros de la biblioteca.

Cuando un presupuesto guarda explícitamente un rendimiento positivo, la biblioteca se completa solo si todavía está vacía. La actualización es condicional y ocurre en la misma transacción que la composición: una edición cancelada o un guardado fallido no completa la biblioteca. Los presupuestos posteriores pueden usar otro rendimiento sin sobrescribir la referencia. Las copias, los respaldos de la base, el JSON completo y el Excel de ACU conservan estos valores. El dato queda disponible para una integración posterior con planificación; no modifica automáticamente el calendario ni el plazo manual de obra.

Base de datos: esquema 40. Intercambio completo: formato 10, con lectura de los anteriores. Para esta actualización no se ejecutaron tests ni compilaciones, por indicación del usuario.
