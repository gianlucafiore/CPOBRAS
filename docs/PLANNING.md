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
2. Arrastrá una partida desde la lista al lienzo o pulsá **Añadir**. Podés
   distribuirla entre tramos; la suma no puede superar el 100 %. También podés
   crear tareas sin partida.
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

## Navegar el PERT

Arrastrá el fondo vacío para panear en cualquier dirección. El área visible del
lienzo mantiene su tamaño al agregar nodos. **+** y **−** cambian el zoom;
**Centrar / ver todo** recupera el conjunto de tareas si te alejaste del diagrama.
Guardar un movimiento conserva el paneo, el zoom y el desplazamiento de la página.

El editor de tareas es una ventana compacta. Los datos principales se agrupan
en columnas; dependencias, recursos y estimación PERT se despliegan cuando se
necesitan. Cerrar o presionar Escape pide confirmación si hay cambios pendientes.
El clic en el fondo no descarta la edición.

## Dividir una tarea en tramos

1. Abrí una tarea existente y pulsá **Dividir en tramos**.
2. Indicá nombres, porcentaje para el primer tramo y duración de ambos. El segundo
   recibe el porcentaje restante de la tarea que estás dividiendo.
3. Confirmá. Podés volver a dividir cualquier tramo si necesitás más etapas.

Los tramos conservan la partida original. Cada uno tiene fechas, dependencias,
duración y avance independientes; cantidades y costos se reparten sin crear otra
partida presupuestaria. El total asignado nunca puede superar el 100 % del origen.
Los costos vinculados se calculan en el backend y conservan exactamente su total.

Los tramos nuevos se conectan fin → inicio. Después podés cambiar sus fechas o
conexiones para ejecutarlos en etapas separadas. Las relaciones externas se
conservan según correspondan al inicio o al fin de la tarea original. Las
revisiones y líneas base conservan la distribución usada al guardarlas.

## Leer el plazo

**Cómo se calcula la duración · camino crítico** explica las precedencias. Para
una cadena continua fin → inicio, muestra un recorrido y su suma. Dos tareas
críticas en ramas paralelas no se suman entre sí. Desfases, fechas mínimas y
calendario también pueden cambiar el plazo: conectar una tarea adicional no
implica necesariamente agregar solo su duración.

Para compartir planes con tramos, actualizá ambos equipos a la misma versión.
