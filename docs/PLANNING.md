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

## Gantt con fechas reales

El encabezado se divide en **año → mes → semana ISO → día**. Cada columna
representa un día calendario y muestra su día de la semana. El número de semana
incluye su año ISO, que puede diferir del año calendario cerca de Año Nuevo.

Arrastrá el fondo para panear horizontalmente hacia fechas anteriores o futuras.
También podés usar el desplazamiento horizontal del panel táctil, Mayús + rueda,
las flechas de cuatro semanas, **Inicio de obra** y **Hoy**. Estos movimientos
cambian la vista; no modifican fechas ni guardan revisiones.

Los fines de semana se resaltan. Los feriados no laborables aparecen en otro
color y las jornadas excepcionales laborables se distinguen en verde. Una barra
puede abarcar un fin de semana, pero sus segmentos de trabajo y su duración
cuentan únicamente las fechas laborables. Las líneas base conservan sus fechas
originales para comparar con el calendario actual.

Al arrastrar una barra se fija una fecha mínima de comienzo, respetando el inicio
de la obra y las precedencias. Si cae en un día no laborable, se ajusta al siguiente
laborable. Al cambiar el extremo de la barra se cuenta el trabajo efectivo,
sin sumar fines de semana o feriados que se atraviesen.

## Feriados y jornadas especiales

**Calendario y seguimiento** y el resumen de duración/avance se muestran en dos
columnas de una misma fila cuando hay ancho suficiente.

1. Desplegá **Calendario y seguimiento** y configurá los días habituales.
2. Seleccioná todas las fechas necesarias en el calendario mensual. Permanece
   abierto y conserva la selección al cambiar de mes.
3. A la derecha, indicá una descripción para cada fecha. Por defecto se trata
   de un día **no laborable**. Activá **Laborable** para habilitarlo, incluso
   si es sábado, domingo o un feriado anterior.
4. **Guardar calendario** aplica los cambios a Gantt y PERT. Las selecciones
   sin guardar no cambian el cronograma. Se conservan en revisiones, líneas base
   y respaldos junto con la obra.

Una excepción por fecha tiene prioridad sobre los días habituales y los feriados
anteriores. Quitarla restaura la regla semanal. Los feriados de versiones previas
se conservan como fechas no laborables editables. Actualizá ambos equipos si
compartís por P2P un plan que utiliza jornadas laborables excepcionales.
