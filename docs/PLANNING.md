# Planificación: Gantt y PERT

Ambas pestañas usan el mismo cronograma de la obra. Podés empezar desde cualquiera:
los nombres, duraciones, precedencias, recursos y avances se comparten.

## Gantt

- Creá una tarea o vinculala con una partida presupuestaria.
- Arrastrá una barra para fijar una fecha mínima de comienzo; su extremo cambia
  la duración. El calendario y las dependencias siguen teniendo prioridad.
- Configurá días laborables y feriados en **Calendario y seguimiento**.
- Las tareas críticas se distinguen en rojo. Las líneas base y revisiones se
  consultan desde **Líneas base e historial de revisiones**.

## PERT

1. Abrí **Planificación → PERT**.
2. Arrastrá una partida desde la lista al lienzo o pulsá **Añadir**. Cada partida
   puede valorizar una sola tarea del plan. También podés crear tareas sin partida.
3. Abrí **Ver / editar tarea** para indicar duración, recursos o avance.
4. Arrastrá el punto de salida de una tarea al punto de entrada de su sucesora.
   También podés hacer clic primero en la salida y después en la entrada.
5. La conexión nueva es **fin → inicio**. Desde el editor de la sucesora podés
   cambiar el tipo de relación, agregar desfases o quitar conexiones.

Mover un nodo desde su cabecera cambia su posición visual; conserva las fechas y
la duración. **Organizar nodos** los distribuye según las precedencias. Las
posiciones se guardan con el plan, las revisiones y las líneas base.

Las conexiones circulares, tareas inexistentes y restricciones incompatibles se
rechazan antes de guardar. El cronograma anterior se conserva si la modificación
no es válida. Los cambios válidos se guardan como una nueva revisión.

### Estimación de tres duraciones

Es opcional. En el editor activá **Calcular duración con tres estimaciones** e
indicá días optimistas, probables y pesimistas, en ese orden. La duración es:

```text
(optimista + 4 × probable + pesimista) / 6
```

Se redondea hacia arriba a días laborables. Un hito puede tener duración cero.
Cambiar la duración arrastrando el extremo de una barra de Gantt reemplaza esa
estimación por una duración manual.

Las obras externas se pueden consultar en ambas vistas según los permisos del
propietario, sin modificar tareas, conexiones o posiciones.
