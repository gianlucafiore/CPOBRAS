# Organizaciones

**Inicio → Organizaciones** reúne la identidad, los datos públicos de impresión,
el logotipo y el acceso a los directorios. Reemplaza las dos entradas anteriores
«Datos de impresión» y «Organización».

La lista distingue:

- **Propia**: creada o administrada en este equipo. Permite editar nombre, datos
  públicos y logotipo; sus directorios están disponibles dentro de la ficha.
- **Externa · solo lectura**: identidad pública recibida de otro propietario.
  Permite consultar, pero no guardar cambios ni usarla como predeterminada.

## Predeterminada y obras nuevas

**Usar como predeterminada** cambia únicamente la preselección del formulario
**Nueva obra**. Podés elegir otra organización propia antes de guardar la obra.
La organización elegida queda guardada con esa obra.

Cambiar la predeterminada no mueve obras existentes, no cambia el propietario
al editar una obra y no reemplaza el emisor de sus presupuestos. La lista de
obras y la barra de contexto muestran su organización. Una obra sin presupuestos
puede corregir su organización desde Editar; una vez que tiene presupuestos,
se conserva la asociación para evitar cambiar la identidad de sus versiones.

## Editar y usar los datos

Abrí una organización propia. El nombre de la organización identifica la ficha;
razón social, nombre comercial y profesional definen la identidad pública. La
ficha incluye domicilio, CUIT, contacto, matrícula, leyenda y logotipo. Completá
al menos la razón social o el nombre profesional al guardar datos de impresión.

**Guardar organización** valida la revisión para evitar sobrescribir cambios de
otra instancia. Los formularios conservan los datos ante errores; cambiar de
ficha o salir con cambios pendientes pide confirmar el descarte.

**Directorios de la organización** abre establecimientos, usuarios, proveedores,
contactos y demás fichas dentro de la misma pestaña. Los nuevos registros quedan
vinculados con esa organización. También se conservan los registros generales
antiguos sin empresa asignada; son datos locales compartidos, no datos de una
organización externa. Las fichas propias de una obra siguen en **Datos de obra**.

Los presupuestos imprimen siempre los datos y el logotipo de la organización
asociada a su obra, cualquiera sea la predeterminada actual. Los archivos PDF ya
generados no se modifican. Guía: [PRINTING.md](PRINTING.md).

## Migración de datos anteriores

La migración 20 conserva las empresas existentes como organizaciones propias.
La identidad pública anterior se copia con su logotipo a una organización,
aprovechando la empresa de igual nombre si existe. Si no había ninguna, aparece
**Mi organización** para completar. No se publican automáticamente los contactos
internos de las antiguas fichas de empresa.

Las obras anteriores se vinculan una vez con la identidad de impresión que se
utilizaba antes. Abrir de nuevo el programa no recalcula ni reemplaza esas
asociaciones. La predeterminada, los datos públicos, logotipos y vínculos de obras
quedan incluidos en las copias de seguridad.

## Preparación para P2P

Todavía no se conecta con otros equipos ni se reciben proyectos por red. Quedan
preparados la procedencia, la identidad del propietario remoto, las revisiones y
la consulta de organizaciones externas. La escritura local de una externa se
rechaza en almacenamiento, además de deshabilitar la edición en pantalla.

La futura sincronización autenticada tendrá que entregar las actualizaciones del
propietario al receptor. El almacenamiento ya distingue esa entrada de las
ediciones locales, rechaza revisiones antiguas, cambios de procedencia y colisiones
con organizaciones propias. Esa entrada no está expuesta como comando de edición
local de la interfaz.

## Prueba sugerida

1. Abrí Organizaciones, completá la ficha inicial y agregá una segunda propia.
2. Elegí la segunda como predeterminada. En Nueva obra debe aparecer seleccionada;
   podés cambiarla explícitamente antes de guardar.
3. Verificá que las obras anteriores conserven su organización y su emisor al imprimir.
4. Editá datos públicos o el logotipo de una organización y generá un PDF de una
   obra que le pertenezca: debe usar esa ficha, no la predeterminada de otra obra.
