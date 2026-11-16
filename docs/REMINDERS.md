# Recordatorios de Inicio / Obras

La tabla de obras ocupa el 75 % del ancho disponible y el panel de recordatorios
ocupa el 25 % restante. En pantallas angostas los paneles se apilan.

Usá **Recordatorios → Nuevo** para cargar un título y una fecha de vencimiento.
Podés elegir General, Compra de materiales, Certificado de comitente,
Certificado a contratista o Solicitud de presupuesto de cliente, y agregar notas.
La obra y el contacto son opcionales. Elegir una obra preselecciona su cliente;
podés cambiar el contacto por un contratista. Una solicitud de presupuesto
puede asociarse directamente a un cliente aunque todavía no tenga obra.

Los vigentes aparecen primero, por vencimiento ascendente; el día de vencimiento
se indica como **Vence hoy**. Desde el día siguiente aparecen en gris y después
de los vigentes. Los vencidos más recientes aparecen antes que los antiguos.
Los resueltos quedan al final. No se borra ningún registro automáticamente.
Cada página muestra hasta 20 recordatorios.

Podés editar, resolver, reabrir o eliminar un recordatorio. Eliminar pide
confirmación. Los cambios sin guardar se conservan al paginar y se advierte
antes de descartarlos al abrir otro registro o salir de la sección. Un guardado
fallido conserva el formulario. La lista se actualiza cuando cambia el día,
también al volver a una ventana que estuvo suspendida.

Los recordatorios son manuales: no se crean a partir de compras o certificados.
Se guardan en la base SQLite seleccionada y forman parte de sus respaldos y
restauraciones. No se mezclan entre bases ni se agregan a las copias P2P de obras.
La revisión de cada registro impide sobrescribir una edición concurrente.
