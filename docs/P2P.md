# Vinculación P2P de solo lectura

## Compartir una obra

1. Ambos equipos necesitan esta versión de CPOBRAS.
2. En el equipo propietario, abrí **Inicio → Vinculación P2P**.
3. Elegí la obra y escribí un nombre para el observador.
4. Pulsá **Crear invitación**, luego **Copiar invitación** y enviásela por tu
   medio habitual. CPOBRAS no envía mensajes ni correos automáticamente.
5. El observador pega el código en **Invitación del propietario** y pulsa
   **Vincular obra**. Después puede usar **Abrir copia**.

Cada invitación corresponde a una obra y un equipo observador. La primera
conexión válida la vincula a la identidad criptográfica de ese equipo. Para
otro equipo, generá otra invitación. Los contactos, obras y organizaciones
propias del observador no se reemplazan.

La copia externa tiene vistas de presupuesto, determinación de precio,
documentos de gestión, planificación y datos de la obra y su organización.
Incluye todos los presupuestos de la obra, sus costos internos, composiciones,
cómputos, proveedores vinculados y documentos operativos. Los datos públicos de
la organización también aparecen en Organizaciones como externos de solo lectura.
No se permite guardar cambios sobre una obra recibida.

## Actualización, desconexión y revocación

Las vinculaciones y las identidades del equipo se conservan al cerrar el
programa. Con las conexiones activas, el proceso nativo comprueba cambios cada
30 segundos; no hace falta mantener abierta la pantalla P2P. **Buscar cambios**
fuerza una comprobación y **Actualizar estado** consulta el resultado local.
Con varios propietarios desconectados, los tiempos de conexión pueden demorar
la siguiente comprobación.

Ambos programas deben estar abiertos y conectados para recibir una versión
nueva. Si uno está desconectado, la copia anterior sigue disponible, con su
fecha y el resultado de la última comprobación. No hay un servidor que guarde
las obras: si el propietario está desconectado cuando vuelve el observador,
este conserva su última copia y espera a que vuelvan a coincidir conectados.
Cuando sucede, recibe el estado más reciente, sin tener que reconstruir todos
los cambios intermedios.

**Pausar conexiones** detiene el acceso de red, manteniendo las copias locales.
**Revocar acceso**, en el propietario, bloquea futuras consultas de esa
invitación. No puede borrar información que el observador ya recibió o copió.
**Desvincular**, en el observador, elimina su copia local y detiene esa suscripción;
no modifica la obra del propietario.

## Conexión por Internet

Se usa iroh 1.4.1: QUIC cifrado y autenticado por identidad del equipo, conexión
directa cuando es posible y relay público cuando las redes no permiten esa
conexión. No requiere configurar puertos del router ni un servidor propio de
CPOBRAS. Los relays retransmiten tráfico cifrado; no almacenan una copia de la obra.
La infraestructura pública y la resolución de identidades dependen de iroh y su
política/disponibilidad, y requieren acceso a Internet desde ambos equipos.

Cada petición exige la invitación válida, la identidad vinculada y un acceso no
revocado. El protocolo solo ofrece consultar una obra; no hay comandos remotos
para editar, ejecutar programas o acceder a toda la base. La exportación filtra
los datos por obra antes de enviarlos. La recepción valida el origen, los IDs,
la versión, el tamaño y el resumen del contenido antes de publicar la copia.

## Alcance de esta primera versión

- Límite de 32 MB por copia de obra. Se transmite una instantánea completa cuando
  cambia, no diferencias entre filas ni edición colaborativa.
- Archivos externos referenciados por documentación o fotos no se transfieren.
  Los logotipos almacenados en la base sí se incluyen.
- Las copias recibidas quedan separadas de los proyectos editables. No son una
  segunda base SQLite abierta a través de la red y no se pueden volver a compartir.
- Las claves e invitaciones están en el directorio local privado `p2p`; no se
  incluyen en el respaldo SQLite. Cambiar de equipo requiere otra invitación.
- Si el almacenamiento local no permite escribir, se conserva la copia anterior
  y se informa un error. Las invitaciones no se incluyen en registros de estado.

## Validación

Se verificaron dos aplicaciones con identidades distintas, conexión QUIC real,
recepción, actualización, ausencia de reescritura cuando no cambia la obra,
vinculación a un solo equipo, revocación y consulta sin conexión después de
reabrir los datos guardados. También se comprueba que la exportación no incluya
una segunda obra, sus presupuestos o su cliente, y que el navegador no presente
controles para modificar la copia externa.

El entorno de esta sesión bloquea el relay público de Internet (rechazo del
proxy HTTP 403). También pasó una prueba con relay local real y los transportes IP directos
deshabilitados en ambos equipos, incluyendo creación de invitación y recepción.
La prueba entre dos redes públicas distintas queda pendiente;
no debe interpretarse la prueba local como validación de esa conectividad.
