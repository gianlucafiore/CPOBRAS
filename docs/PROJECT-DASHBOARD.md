# Datos de obra

El tablero muestra únicamente información de la obra abierta:

- **Ficha:** título, comitente, organización, ubicación, tipo de edificio,
  superficie, dimensiones estimadas y memoria descriptiva.
- **Ubicación:** mapa de OpenStreetMap, ampliable y navegable. Sin ubicación
  guardada muestra Argentina. **Elegir ubicación** activa el pin: hacé clic en
  el mapa o arrastrá el marcador y pulsá **Guardar ubicación**. No hace falta
  escribir coordenadas. **Cancelar ubicación** conserva el punto anterior.
  El mapa requiere Internet; la ficha sigue disponible sin conexión. La
  cartografía visible se solicita a OpenStreetMap al mostrar o navegar el mapa.
- **Cuadrillas:** registros asociados a la obra y cuadrillas asignadas al plan.
- **Subcontratistas:** registros de la obra y contrapartes de solicitudes,
  órdenes de servicios o subcontratos.
- **Equipos:** recursos de tipo equipo utilizados en planificación o gestión.
- **Presupuestos:** estado, importe y fechas. El presupuesto seleccionado aparece
  primero; después se muestran los que están en elaboración. Seleccionar otra
  versión conserva la confirmación habitual de cambio de presupuesto.

**Directorios y fichas** mantiene los formularios de contratos, centros de costos,
cuadrillas y documentación. Los clientes y proveedores generales se gestionan
por separado desde Inicio.

## Archivos y legajos

**Agregar archivo…** abre el explorador del sistema. Se guarda una copia en la
base de datos de esta obra, por lo que mover o borrar el archivo original no
rompe el legajo. Los respaldos de la base incluyen estas copias.

El límite es 20 MB por archivo. Se admiten PDF, imágenes, textos, documentos,
planillas, planos DWG/DXF y ZIP. **Abrir** utiliza la aplicación predeterminada
del sistema. **Quitar** pide confirmación antes de eliminar la copia del legajo.

Los adjuntos permanecen locales en esta versión: no se transmiten por P2P.
Los datos de obra externos respetan los apartados autorizados y siguen siendo
de solo lectura.

## Distribución del tablero y ficha física

En pantallas amplias, la fila superior contiene ficha, mapa y presupuestos; la
inferior muestra archivos compactos, subcontratistas, cuadrillas y equipos. La
distribución se adapta al ancho disponible.

**Editar datos de obra** abre una ficha amplia con campos agrupados en columnas,
memoria descriptiva y datos avanzados desplegables. Esa vista no incluye la tabla
vacía de Código/Nombre: se edita la ficha de la obra abierta directamente.

## Dirección aproximada desde el mapa

Al confirmar **Guardar ubicación**, CPOBRAS consulta Nominatim de OpenStreetMap
con las coordenadas del pin e intenta completar **Ubicación**, **Localidad** y
**Provincia**. El resultado queda identificado como aproximado y se puede
corregir desde la ficha de la obra.

La búsqueda se realiza solo al guardar el punto, con caché por ubicación y sin
consultas durante el arrastre. Requiere Internet y disponibilidad del servicio.
Si falla, el punto se guarda igualmente y la ficha indica que su dirección está
pendiente de verificar. Una dirección existente se conserva con esa advertencia.
Editar manualmente la dirección retira su identificación automática.
