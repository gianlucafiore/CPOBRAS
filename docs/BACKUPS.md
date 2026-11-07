# Respaldos locales y carpeta sincronizada

## Configuración

Abrí **Inicio → Copias de seguridad**. Indicá una ruta absoluta, por ejemplo
`/home/usuario/Nube/Respaldos CPOBRAS` en Linux Mint. No es una dirección web:
debe ser una carpeta que exista localmente o que el programa pueda crear.
Guardá para aplicar. Se comprueba que permita escribir antes de cambiar el destino.

Activá la programación y elegí 15 minutos, una hora, cuatro horas o un día.
La programación comienza desactivada y conserva el directorio interno para
quienes todavía no eligieron otra carpeta. **Crear copia ahora** usa siempre
el destino guardado, incluso si la programación está desactivada.

Podés usar una carpeta que tu cliente local de Drive, Dropbox, OneDrive u otro
proveedor ya sincronice. CPOBRAS crea el archivo local; ese cliente administra
la conexión, autenticación y subida. La fecha de última copia no certifica que
el proveedor ya la haya recibido. Si no tenés cliente de sincronización, podés
abrir la carpeta y subir el archivo manualmente.

## Cuándo se ejecuta

El planificador funciona en el proceso nativo mientras la aplicación está
abierta, aunque no estés en la pantalla de copias. Comprueba una vez por minuto.
Al activar sin una copia reciente o abrir el programa con una copia pendiente,
se genera una dentro del siguiente minuto. No crea una por cada intervalo perdido.
Una copia manual completada también inicia un nuevo intervalo.

La configuración y el último resultado se guardan en el directorio local de
la aplicación, fuera de la base respaldada. Persisten al reiniciar y no cambian
al restaurar una base. **Actualizar estado** consulta el último resultado.

Si la carpeta desaparece o no permite escribir, se conserva la última copia
completada y se informa el error. El programa vuelve a intentarlo cada cinco
minutos mientras el respaldo siga pendiente. No cambia a otra carpeta ni recrea
automáticamente un destino que haya desaparecido. Podés pausar la programación
aunque la carpeta esté desconectada. Para elegir otro destino, guardá una ruta
que sí esté disponible.

## Archivos y restauración

Cada archivo `.sqlite` es una copia completa de la base: obras, presupuestos,
personas, organizaciones y logotipos incluidos en ella. Se utiliza el respaldo
consistente de SQLite, incluidas las páginas del WAL, y se verifica integridad y
referencias. Se escribe primero un archivo temporal oculto `.partial`; solo al
terminar se publica el archivo definitivo, con fecha UTC y un identificador único.
No se debe usar un archivo `.partial` para restaurar.

Los archivos se llaman `cpobras-manual-…`, `cpobras-auto-…` o
`cpobras-antes-de-restaurar-…`. No se sobrescriben ni borran automáticamente.
En Linux los archivos se crean con permisos de lectura y escritura para su
propietario. No se exportan credenciales de nube porque esta integración no las usa.

La lista incluye la carpeta elegida y las copias históricas del directorio
interno. Si cambiás entre carpetas externas, los archivos anteriores permanecen
en su ubicación: podés volver a seleccionarla para listarlos. Las copias
sincronizadas en otra máquina se pueden colocar en la carpeta seleccionada
conservando su nombre original. Los archivos temporales y los enlaces simbólicos
no aparecen como copias restaurables.

Restaurar pide confirmación y crea primero un respaldo preventivo. Si no se
puede guardar esa copia preventiva, no se cambia la base activa. Las copias de
versiones antiguas admitidas se migran antes de restaurar; las estructuras no
admitidas se rechazan. Una copia abarca toda la base, no solo la obra abierta.

La subida a la nube no sustituye los archivos locales mientras se está creando
una copia. La carpeta compartida contiene información completa de tu negocio;
elegí el acceso adecuado en tu proveedor. No hay login de Google, servidor de
CPOBRAS ni sincronización de una base activa entre usuarios en esta función.
