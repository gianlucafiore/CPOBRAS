# Clientes y proveedores

## Uso

En Inicio hay dos apartados independientes: **Clientes** y **Proveedores**.
Cada lista muestra únicamente personas que cumplen esa función. Una persona
puede ser cliente, proveedor o ambos; en este último caso aparece en cada lista
con una indicación de su otra función.

Para reutilizar un contacto, pulsá **Importar desde proveedores/clientes**,
buscalo y elegí **Incorporar**. Se agrega la función a la misma persona, sin
copiar sus datos. Editar nombre, CUIT, teléfono, correo, domicilio o código
modifica la identidad compartida, visible en ambos apartados.

Durante un alta se buscan coincidencias por CUIT normalizado, correo, teléfono
y nombre aproximado. Revisá los resultados y usá el contacto existente cuando
corresponda. Un nombre parecido no une registros automáticamente. El CUIT
normalizado es único; si ya existe, debe incorporarse esa persona.

## Desde una obra

Crear y editar obra permite elegir un cliente principal y varios proveedores.
Los proveedores tienen un buscador en su lista de selección. **Crear cliente**,
**Crear proveedor** e **Importar desde…** abren una ventana superpuesta; al
guardar, el contacto queda seleccionado y se conserva el resto del formulario.
Pulsar fuera no cierra el formulario. Cerrar con cambios pide confirmar el descarte.

El contacto se guarda al confirmar su propia ventana, aunque luego canceles la
obra. La asociación con la obra se guarda al confirmar el formulario de obra.
Vincular proveedores facilita identificarlos en Gestión; no crea pedidos,
contratos ni documentos de compra automáticamente. Los contactos siguen siendo
un catálogo general administrado desde Inicio.

## Almacenamiento y migración

El esquema 21 guarda la identidad actual en `persons`, con función `client`,
`supplier` o `both` y revisión para evitar sobrescribir ediciones concurrentes.
`project_suppliers` relaciona obras y personas. `clients` queda como vista de
compatibilidad; no hay una segunda tabla de identidades de clientes.

Al actualizar, los clientes y proveedores con el mismo CUIT no vacío y
normalizado se vinculan a una única persona. No se fusionan automáticamente
nombres similares. Se recuperan los datos de las fichas ampliadas de clientes;
los campos vacíos pueden completarse con los registros anteriores.

Las referencias antiguas de proveedores se conservan como vínculos técnicos
estables para precios y documentos operativos. El nombre y los datos actuales
se leen desde la persona. Las instantáneas originales se conservan en
`person_legacy_links`; los documentos económicos inmutables no se reescriben.
Los selectores muestran una sola entrada por persona, aunque existieran varias
referencias históricas. La migración se ejecuta una vez y es transaccional.

Para probar la actualización con datos propios, generá antes una copia desde
**Inicio → Copias de seguridad**. Los comandos de arranque y compilación están
en el [README](../README.md).
