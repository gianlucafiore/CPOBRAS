# Calendario, índices y certificados

## Tres conceptos para orientarse

1. **Publicación del índice:** un puntaje mensual con fecha y fuente, por ejemplo
   CAC de octubre. Se registra una vez en **Inicio → Datos generales**.
2. **Acuerdo del presupuesto:** define mes base, índices, pesos y desfase. Se
   configura desde **Determinación de precio → Acuerdo de ajuste del presupuesto**
   o desde la tarjeta de certificaciones de Planificación. Cada presupuesto puede
   tener una fórmula distinta. Los pesos deben sumar 100 %.
3. **Certificado:** registra las cantidades que se cobran, el ajuste utilizado,
   adicionales y diferencias anteriores. Al emitirlo, sus valores quedan guardados:
   una publicación nueva no modifica ese documento.

## Calendario general y excepciones de obra

En **Inicio → Datos generales → Calendario general** se definen la semana habitual,
feriados, nombres y si se trabaja en esas fechas. El calendario permanece abierto
para seleccionar varios días y pasar entre meses. Un feriado puede declararse
laborable también con carácter general.

Las obras heredan ese calendario. En **Planificación → Seguimiento y excepciones
de esta obra** permanecen el inicio de obra y la fecha de seguimiento. Allí podés
cambiar una fecha únicamente para esa obra o personalizar su semana. La excepción
local tiene prioridad sobre el criterio general. Quitar una excepción local
restaura el criterio general; no elimina el feriado de las otras obras.

El Gantt pinta las fechas especiales y muestra su descripción y condición laborable
al pasar el mouse. Un feriado habilitado para trabajar sigue identificado como
fecha especial. Las fechas cargadas antes de esta actualización se conservan como
excepciones de sus obras; no se convierten automáticamente en feriados generales,
porque podrían tratarse de suspensiones particulares.

La tarjeta de líneas base e historial se quitó de Planificación. Se conservan las
revisiones y los registros internos para su análisis posterior; no se borraron
históricos ni se modificaron las líneas base ya guardadas.

## Cortes y lista de certificaciones

Activá **Marcar cortes de certificación** en el Gantt:

- Un clic en una fecha agrega un corte.
- Otro clic sobre un corte existente lo elimina.
- Arrastrar un corte cambia su fecha y muestra su nueva posición. No se pueden
  superponer dos cortes ni colocarlos antes del inicio de obra.

**Certificaciones programadas** muestra el importe neto previsto o emitido, el
ajuste aplicado, los gastos previstos de la próxima etapa y el resto. El resto
es ese importe menos esos gastos: no incluye la caja inicial, no equivale a
utilidad y no sustituye el calendario diario de fondos. Emitido no significa
cobrado: los cobros se registran en Finanzas.

El botón **Configurar condiciones** reúne plazo de cobro, caja, reparo y
recuperación prevista de anticipos. El resto de la pantalla muestra la lista,
sin mantener todos esos campos desplegados.

## Publicaciones y acuerdo de ajuste

Registrá en Datos generales:

- Nombre de la serie: CAC, IPC u otra denominación que identifique el índice pactado.
- Mes al que corresponde el puntaje.
- Valor publicado, fecha de publicación y enlace de la fuente.

Se ingresan **puntajes**, no variaciones mensuales. Si el contrato utiliza una
serie de inflación acumulada, sus valores deben pertenecer a una misma base;
no se debe ingresar un porcentaje mensual como si fuera el puntaje de un índice.
El programa no descarga ni inventa publicaciones.

Una corrección se registra como una nueva publicación para la misma serie y mes.
Se conserva la anterior. Para un cálculo se usa la publicación más reciente que
ya estuviera disponible en la fecha de emisión indicada.

El acuerdo del presupuesto permite, por ejemplo:

- CAC al 100 %.
- CAC al 60 % más IPC al 40 %.
- Otra combinación de series, con pesos propios.

La fórmula compara cada índice con su propio mes base:

`coeficiente = 0,60 × CAC aplicado / CAC base + 0,40 × IPC aplicado / IPC base`

El mes base sugerido es el mes de creación del presupuesto y puede cambiarse
según lo pactado. Desfase 0 usa el mes del corte; desfase 1, el anterior. El acuerdo
se edita con el presupuesto en borrador; para cambiarlo después de emitir, volvé
el presupuesto a borrador o utilizá una versión revisada. Los certificados ya
emitidos conservan su acuerdo original. Los presupuestos duplicados y los
intercambios de presupuesto conservan su acuerdo.

## Índice provisorio y diferencia posterior

Si falta el mes correspondiente, se utiliza el **último mes común publicado para
todos los índices del acuerdo**. No se mezcla CAC de un mes con IPC de otro.
El certificado guarda mes objetivo, mes aplicado, coeficiente, pesos, puntajes,
identificadores y fuentes. Queda identificado como **provisorio**.

Si ni siquiera se cuenta con los puntajes del mes base, no puede emitirse un
certificado ajustado. En la previsión se advierte que el importe aún está pendiente
de confirmar; no se fabrica un coeficiente.

Ejemplo: sobre $100.000 de trabajo a precios base se emitió con coeficiente 1,10,
por lo que se certificaron $110.000 antes de deducciones. Al publicarse el mes
correspondiente, el coeficiente resulta 1,20: hay una diferencia de $10.000.

En **Gestión de obra → Certificaciones**, el próximo certificado ofrece esa
**diferencia pendiente**, vinculada al número original. Seleccionala para incluirla.
Si correspondía reparo, también se calcula su diferencia. No se aplica por segunda
vez la recuperación de anticipo sobre una diferencia ya originada en otro documento.
El certificado anterior permanece intacto y la misma diferencia no se liquida dos
veces. Si aparecen nuevas publicaciones, se compara con el último coeficiente ya
liquidado, no siempre con el primero.

Se contemplan diferencias negativas a favor del comitente. Pueden descontarse de
una certificación posterior con saldo suficiente. Si el neto resultara negativo,
no se emite: la diferencia sigue pendiente para incorporarla cuando corresponda.

Los antiguos certificados sin acuerdo mantienen su circuito de ajuste manual,
identificado como **Ajuste de certificado anterior sin acuerdo**. Esa opción solo
se ofrece si existen documentos anteriores compatibles. Puede usar sus índices
históricos o publicaciones del catálogo general. Los certificados nuevos con
acuerdo usan las diferencias pendientes, sin ajustes manuales paralelos.

## Adicionales

- **Trabajo que amplía el alcance:** se presupuesta como partidas en un rubro de
  adicionales, con sus cantidades, costos y materiales. Se certifica por esas
  partidas. No se vuelve a cargar como cargo puntual.
- **Cargo extraordinario de una certificación:** usá **Agregar adicional puntual**.
  Indicá descripción, motivo, autorización o referencia del comitente e importe
  completo. No aumenta una cantidad de obra presupuestada.

Para cada cargo puntual elegí si lleva ajuste, reparo o recuperación de anticipo.
Si es ajustable, ingresá el importe a valores del mes base y configurá primero el
acuerdo. Si es fijo, ingresá el importe final pactado. Los cargos fijos no se
reajustan posteriormente; los ajustables participan de las diferencias futuras.

El detalle del certificado y sus exportaciones incluyen adicionales, autorización,
publicaciones utilizadas y diferencias vinculadas. Los importes y ponderaciones
se calculan con Decimal. Las nuevas reglas se guardan en el esquema 27 y se incluyen
en las copias de seguridad. La transmisión P2P respeta los permisos del propietario.
