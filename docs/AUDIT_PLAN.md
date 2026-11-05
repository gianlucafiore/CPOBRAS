# Plan de desarrollo y auditoría

Alcance autorizado en esta sesión: **etapas 1 a 10, con 75 subítems**.
El listado original completo conserva 85 ítems en 12 etapas.

Los checks siguientes indican una implementación funcional local con la evidencia
descrita. No significan una certificación de producción ni pruebas exhaustivas
con obras reales. Las decisiones y límites están en [VALIDATION.md](VALIDATION.md),
la seguridad de dependencias en [DEPENDENCIES.md](DEPENDENCIES.md), y los comandos
para compilar y arrancar están en el [README principal](../README.md).

El desarrollo se mantiene en `develop`, partiendo de `f50b792`. Los cambios se publican en `origin/develop`. No se modificó main remoto ni se
eliminaron ramas de otras personas. No se fija una fecha u horas de entrega para
las etapas futuras.

## ETAPA 1: Auditoría, estabilización y seguridad

- [x] 1. Crear una única rama activa de desarrollo, manteniendo main estable.

  Rama local develop; main remoto conserva su referencia.

- [x] 2. Ejecutar y registrar las pruebas existentes de Rust, Tauri y JavaScript.

  Runner reproducible, resultados y límites registrados en VALIDATION.md.

- [x] 3. Auditar las dependencias y versiones, y fijar las necesarias.

  Tres lockfiles, versiones de runtimes, npm/RustSec y backport GLib verificado.

- [x] 4. Reorganizar el backend Tauri por módulos funcionales.

  Comandos separados en clientes, obras, presupuesto, rubros, cómputos, costos, gestión y mantenimiento.

- [x] 5. Dividir workspace.js en componentes, servicios y manejo de estado.

  Arranque, selectores/estado, servicios, componentes y acciones separados; tests importan módulos reales.

- [x] 6. Revisar validaciones, manejo de errores y operaciones transaccionales.

  Validación de referencias y datos, revisión optimista, desbordes controlados y operaciones atómicas.

- [x] 7. Corregir riesgos de precisión y formato de importes en la interfaz.

  BigInt para suma/formato/multiplicación de importes y cantidades en la interfaz.

- [x] 8. Revisar integridad referencial, claves foráneas y migraciones SQLite.

  Migraciones transaccionales, claves foráneas y enlaces normalizados del plan actual.

- [x] 9. Implementar copias de seguridad, restauración y verificación de integridad.

  Backup online SQLite, validación, migración aislada de copias antiguas y copia de seguridad previa a restaurar.

- [x] 10. Configurar seguridad Tauri, CSP, permisos y validación de entradas.

  CSP, permiso explícito de ventana principal y rechazo de otros orígenes/ventanas.

- [x] 11. Ampliar pruebas unitarias, de integración y de regresión.

  Regresiones de negocio, persistencia, IPC, seguridad, navegador e intercambio de archivos.

- [x] 12. Actualizar README, arquitectura y documentación técnica.

  README con comandos y guía de prueba; arquitectura, auditoría y validación actualizadas.

## ETAPA 2: Modelo central de empresas y obras

- [x] 1. Definir empresas, establecimientos, usuarios y roles.

  Fichas de empresa/establecimiento, usuarios y roles locales; autenticación colaborativa queda en etapa 11.

- [x] 2. Ampliar clientes y crear proveedores, subcontratistas y contactos.

  Datos ampliados de clientes, proveedores, subcontratistas y contactos relacionados.

- [x] 3. Crear fichas completas de obras con ubicación, responsables y documentación.

  Ubicación, coordenadas, responsable, establecimiento, estado, fechas y referencias documentales.

- [x] 4. Agregar contratos, plazos, monedas, estados y parámetros económicos.

  Contratos con monto/moneda/plazos/condiciones; porcentajes de obra heredados por presupuestos nuevos.

- [x] 5. Implementar centros de costos y estructura de clasificación de obras.

  Centros jerárquicos por empresa/obra y referencia de clasificación.

- [x] 6. Crear una biblioteca central de unidades, categorías y rubros.

  Directorio de unidades/categorías/rubros; unidades sugeridas en formularios y rubros reutilizables.

- [x] 7. Definir registro de movimientos y trazabilidad de cambios.

  Eventos de antes/después por entidad, revisión y fecha, protegidos contra modificación.

## ETAPA 3: Cómputos métricos y presupuestos

- [x] 1. Consolidar la grilla jerárquica de capítulos, rubros, ítems y subítems.

  Rubros/subrubros de profundidad variable, partidas asignadas y subtotales de descendientes.

- [x] 2. Mejorar edición masiva, duplicación, búsqueda y ordenamiento de partidas.

  Edición masiva transaccional, búsqueda, movimiento, orden por descripción y copia de partidas.

- [x] 3. Completar fórmulas de cómputo, dimensiones, factores, descuentos y subtotales.

  Metrados dimensionados, factores, signos de descuento y fórmulas aritméticas con variables.

- [x] 4. Permitir ítems manuales, paramétricos y vinculados a análisis unitarios.

  Costos manuales, fórmulas persistidas y partidas creadas desde ACU.

- [x] 5. Implementar plantillas y bibliotecas reutilizables de presupuestos.

  Biblioteca persistente de plantillas con rubros, tasas, fórmulas y metrados.

- [x] 6. Crear importación y exportación Excel, CSV y formatos de intercambio útiles.

  Excel real .xlsx, CSV y JSON; las importaciones crean un presupuesto nuevo.

- [x] 7. Implementar versiones, comparativas e identidad estable de partidas.

  Origen estable al duplicar versiones; comparación por identidad, con fallback para documentos independientes.

- [x] 8. Generar presupuestos, cómputos y análisis en PDF con formatos configurables.

  PDF de presupuesto, cómputos y ACU actuales, con título/orientación y resumen económico.

## ETAPA 4: Análisis de costos unitarios y precios

- [x] 1. Perfeccionar los ACU de materiales, mano de obra, equipos y subcontratos.

  Materiales, mano de obra, equipos y subcontratos; desglose y comparación de modos de ejecución.

- [x] 2. Agregar rendimientos, desperdicios, consumos y coeficientes de producción.

  Consumo por fórmula, coeficiente, desperdicio y divisor de rendimiento.

- [x] 3. Implementar insumos compuestos y análisis anidados sin referencias circulares.

  Biblioteca de nodos reutilizables para ACU/insumos compuestos; rechazo de ciclos y expansión excesiva.

- [x] 4. Crear listas de precios por proveedor, moneda, fecha y zona.

  Listas explícitas por proveedor, moneda, zona y fechas de validez.

- [x] 5. Agregar historial, vigencia y actualización selectiva de precios.

  Observaciones de precio inmutables y actualización de ACU por insumo/fecha/lista.

- [x] 6. Incorporar conversiones monetarias con cotizaciones explícitas.

  Cotizaciones guardadas con dirección, fecha, fuente y tasa; conversión explícita.

- [x] 7. Perfeccionar gastos generales, financieros, utilidad, impuestos y descuentos.

  Gastos generales, financieros, beneficio, descuento e impuestos en orden documentado.

- [x] 8. Permitir análisis de sensibilidad y escenarios de costos.

  Comparación base/escenario con cambios porcentuales por insumo o conjunto de insumos.

## ETAPA 5: Planificación de obras

- [x] 1. Crear estructura de tareas y vincularlas con partidas presupuestarias.

  Jerarquía de tareas y vínculos a partidas de la misma obra con protección referencial.

- [x] 2. Desarrollar diagrama de Gantt interactivo.

  Gantt con selección/edición, arrastre de reprogramación y cambio de duración desde el extremo.

- [x] 3. Agregar dependencias, restricciones, hitos, calendarios y días no laborables.

  FS/SS/FF/SF, desfases, hitos, inicio mínimo, alertas de fecha límite, semana configurable y feriados.

- [x] 4. Calcular ruta crítica, holguras y duración del proyecto.

  Programación por dependencias, ruta crítica, holguras, fechas y duración laborable.

- [x] 5. Asignar cuadrillas, equipos y recursos a actividades.

  Asignaciones de cuadrillas, equipos y recursos con unidades por día.

- [x] 6. Crear líneas base y reprogramaciones con historial.

  Líneas base inmutables, superposición y versiones de reprogramación recuperables como nueva revisión.

- [x] 7. Generar cronogramas valorizados, curvas S y flujo previsto.

  Valorización por días laborables, curva S y tabla de flujo; conservación exacta de totales.

- [x] 8. Registrar avances programados y reales.

  Avance real guardado por tarea y comparación ponderada con el programado a una fecha explícita.

## ETAPA 6: Compras, contratación y almacenes

- [x] 1. Implementar solicitudes de materiales y necesidades por obra.

- [x] 2. Crear pedidos de cotización y comparativas de proveedores.

- [x] 3. Generar órdenes de compra y órdenes de servicio.

- [x] 4. Administrar contratos de subcontratistas y sus condiciones.

- [x] 5. Registrar remitos, recepciones y entregas parciales.

- [x] 6. Implementar depósitos, ubicaciones, existencias y movimientos de stock.

- [x] 7. Registrar consumos, devoluciones y transferencias entre obras.

- [x] 8. Vincular compras, materiales y subcontratos con costos reales.

Evidencia funcional y guía de uso: [OPERATIONS.md](OPERATIONS.md).

## ETAPA 7: Ejecución y producción

- [x] 1. Crear partes diarios de obra.

- [x] 2. Registrar asistencia, horas trabajadas, cuadrillas y equipos.

- [x] 3. Registrar ejecución de tareas, cantidades y producción diaria.

- [x] 4. Comparar rendimientos reales contra los previstos en ACU.

- [x] 5. Registrar incidencias, imprevistos, fotografías y observaciones.

- [x] 6. Implementar seguimiento de avances físicos por rubro.

- [x] 7. Crear indicadores de productividad y desvíos.

Evidencia funcional y guía de uso: [OPERATIONS.md](OPERATIONS.md).

## ETAPA 8: Certificaciones y ajustes de precios

- [x] 1. Implementar certificados de avance por período y partida.

- [x] 2. Calcular acumulados anteriores, del período y pendientes.

- [x] 3. Gestionar anticipos financieros, descuentos y fondos de reparo.

- [x] 4. Crear certificados de subcontratistas y conciliaciones.

- [x] 5. Implementar índices CAC, IPC e INDEC con fuentes y períodos verificables.

- [x] 6. Agregar fórmulas contractuales de redeterminación de precios.

- [x] 7. Generar certificados y anexos exportables, con historial inmutable.

Evidencia funcional y guía de uso: [OPERATIONS.md](OPERATIONS.md).

## ETAPA 9: Finanzas y rentabilidad

- [x] 1. Registrar compromisos, facturas, cuentas por pagar y cuentas por cobrar.

- [x] 2. Registrar pagos, cobros y vencimientos.

- [x] 3. Crear flujo de fondos previsto y realizado.

- [x] 4. Comparar presupuesto, comprometido, devengado y efectivamente pagado.

- [x] 5. Calcular resultados por obra, centro de costos y rubro.

- [x] 6. Agregar proyección de costo a terminar y resultado final esperado.

Evidencia funcional y guía de uso: [OPERATIONS.md](OPERATIONS.md).

## ETAPA 10: Tableros e informes

- [x] 1. Crear un panel general de cartera de obras.

- [x] 2. Mostrar avances físicos y económicos, plazos y alertas.

- [x] 3. Desarrollar indicadores de rentabilidad, productividad y desviaciones.

- [x] 4. Crear informes configurables exportables a Excel y PDF.


Evidencia funcional y guía de uso: [OPERATIONS.md](OPERATIONS.md).

## ETAPA 11: Inteligencia artificial y colaboración

- [ ] 1. Crear una capa de consultas IA sobre los datos autorizados.

- [ ] 2. Permitir que la IA analice presupuestos, ACU, costos y cronogramas.

- [ ] 3. Agregar generación asistida de informes y detección de inconsistencias.

- [ ] 4. Implementar propuestas de acciones con revisión y aprobación humana.

- [ ] 5. Definir usuarios, permisos, auditoría y sincronización futura con servidor.

## ETAPA 12: Pruebas finales y distribución

- [ ] 1. Preparar pruebas integrales con obras y presupuestos reales.

- [ ] 2. Probar rendimiento con miles de ítems, recursos y movimientos.

- [ ] 3. Realizar pruebas de migración, recuperación, seguridad y regresión.

- [ ] 4. Empaquetar versiones Linux, Windows y macOS.

- [ ] 5. Implementar instalador, actualización controlada, manuales y versiones estables.
