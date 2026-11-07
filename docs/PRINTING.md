# Presupuestos e impresión

## Identidad pública

Desde **Inicio → Organizaciones → Abrir**, cargá razón social, nombre comercial,
nombre del profesional, título/matrícula, CUIT, domicilio, teléfono, correo,
sitio web y leyenda pública. Solo se imprimen los campos completos de esta
ficha. Los datos de usuarios, proveedores y demás fichas internas de
los directorios no se incorporan automáticamente.

Cada organización tiene su propio perfil. La obra conserva su organización y
usa sus datos al imprimir, aunque cambie la predeterminada para obras nuevas.
Incluye un logotipo PNG o JPEG
(hasta 3 MB al cargar); se adapta a un máximo de 640 px y se guarda como PNG de
hasta 512 KB, conservando las proporciones. Podés quitarlo sin borrar los datos.
El perfil y el logotipo quedan incluidos en las copias de seguridad de la base.
Guardar verifica la revisión para evitar sobrescribir cambios de otra instancia.

## Presentaciones

Abrí la obra y el presupuesto correcto y pulsá **Imprimir presupuesto**. La
barra de contexto conserva la obra, versión y estado del presupuesto. Elegí:

| Presentación | Contenido |
| --- | --- |
| Presupuesto para cliente | Emisor, cliente, obra, rubros y partidas con cantidad, precio unitario final, importe y total. Sin desglose de costos, beneficio ni gastos internos. |
| Presupuesto interno | Costos unitarios y directos, importes finales y determinación de precio con sus conceptos activos. Identificado como USO INTERNO. |
| Incidencias porcentuales | Importe final, participación y porcentaje acumulado de cada partida. Los rubros muestran subtotales de importe e incidencia. |

Podés ajustar título, fecha, referencia, condiciones y observaciones públicas,
y elegir orientación vertical u horizontal. Los campos se conservan al cambiar
de presentación; al salir con cambios pendientes se pide confirmar el descarte.
Se generan PDF y Excel. La vista previa muestra hasta 200 renglones; los archivos
incluyen todos. El documento identifica si el presupuesto está emitido o en
borrador, y numera sus páginas. El logotipo se incluye en PDF.

### Importes e incidencias

El total final es el calculado por **Determinación de precio**, redondeado a dos
decimales para el documento. Se distribuye proporcionalmente al costo directo
de las partidas: cada importe incluye la proporción correspondiente de gastos,
beneficio, impuestos y deducciones. El precio unitario final se obtiene del
importe distribuido dividido por la cantidad. La presentación para cliente no
separa IVA u otros cargos: muestra precios finales según esa determinación.

El reparto utiliza acumulados y ajustes de centavos para que las partidas sumen
exactamente el total impreso. Los importes finales por partida prevalecen sobre
las diferencias que puedan resultar de redondear el precio unitario mostrado.
No se alteran precios de insumos, costos unitarios, cantidades ni metrados de la
base. Los costos internos conservan su precisión original.

La incidencia es el porcentaje del importe final de cada partida sobre el total
final. Se calcula con cuatro decimales y ajuste acumulado para cerrar en 100%.
Los rubros suman las incidencias de sus descendientes, sin duplicarlos en el
total. En un presupuesto de importe final cero, la incidencia total es 0%.
Si el costo directo es cero pero hay cargos fijos, se muestra un renglón explícito
**Importe sin distribución entre partidas**, sin atribuirlos arbitrariamente a
una partida sin costo.

## Apertura e impresión del PDF

**Generar documento**, con salida PDF, primero guarda un archivo con nombre
único en `exports/` del directorio de datos de CPOBRAS y luego solicita abrirlo
en el lector PDF predeterminado del sistema. Desde ese lector podés revisar,
elegir impresora y configurar la impresión física. CPOBRAS no envía el documento
directamente a la impresora.

En Linux Mint se usa `gio open`, que respeta la asociación de PDF configurada en
el escritorio. Si no hay aplicación asociada, el archivo queda guardado y la
pantalla informa el problema con su ruta y un botón **Abrir PDF** para reintentar.
Elegí el lector preferido mediante **Abrir con → Establecer como predeterminado**
en el administrador de archivos. En Windows se solicita la apertura mediante
el manejador del sistema y en macOS mediante `open`; esas plataformas no se
validaron en esta sesión.

La apertura nativa solo acepta PDFs del directorio de exportaciones de CPOBRAS;
no abre URLs, rutas externas ni enlaces simbólicos. Las pruebas en Linux verifican
el envío a una aplicación predeterminada de prueba, incluso con espacios en el
nombre del archivo.

**Herramientas / exportar** conserva los intercambios técnicos CSV/JSON y los
metrados/ACU. Su PDF de presupuesto utiliza la presentación interna y también
solicita abrir el lector del sistema. CSV/JSON técnicos contienen información
interna; usá la presentación para cliente para preparar su presupuesto.

Los archivos ya generados no cambian al editar el presupuesto o la ficha
pública. Al volver a generar, se consultan los valores actuales de la versión
seleccionada y el perfil público vigente; no se sobrescriben archivos anteriores.
La migración SQLite 19 agregó el perfil; la 20 lo conserva dentro de una
organización y vincula cada obra con su emisor. Ver [ORGANIZATIONS.md](ORGANIZATIONS.md).

## Prueba sugerida

1. Guardá los datos públicos y un logotipo desde Inicio.
2. Abrí una obra, elegí el presupuesto y pulsá Imprimir presupuesto.
3. Generá un PDF para cliente y verificá identidad, logo, rubros y total.
4. Cambiá a interno: deben aparecer costos y formación del precio.
5. Elegí incidencias y exportá Excel; sumá solo las partidas, sin duplicar rubros:
   los importes deben cerrar con el total y las incidencias con 100%.
6. Desde el lector PDF, probá la impresión física con tu impresora.
