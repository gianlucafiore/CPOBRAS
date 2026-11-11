# Motor de conocimiento operativo de CPObras

Esta infraestructura permite que la IA comprenda los módulos y dependencias
de CPObras, consulte datos reales por adaptadores tipados y prepare planes
entre áreas. **No** concede a la IA acceso directo a SQL, Tauri o el sistema
de archivos. El contexto y las respuestas del proveedor no son permisos.

## Arquitectura

1. **Inventario técnico generado:** ejecutar
   \`node tools/generate-ai-inventory.mjs\` desde la raíz. Se analizan
   \`src-tauri/src/lib.rs\`, \`permissions/workspace.toml\`, las firmas
   \`#[tauri::command]\` registradas y las migraciones SQLite de
   \`crates/cpobras-storage/migrations\`. El resultado es
   \`apps/desktop/src/services/ai-native-inventory.generated.js\`.
   Incluye comandos permitidos para **la interfaz Tauri**, argumentos
   descubiertos, tablas, columnas y relaciones explícitas.
2. **Semántica de negocio:** \`ai-app-knowledge.js\` describe los dominios,
   dependencias y restricciones constructivas/administrativas. No hay que
   enviar todo el código al proveedor. El inventario no infiere reglas
   empresariales a partir de nombres de tablas.
3. **Contexto dinámico:** \`ai-domain-context.js\` incorpora sólo los módulos
   relacionados con la conversación, junto con la obra y el presupuesto
   activos. \`ai-workspace-reader.js\` aporta consultas reales y resumidas
   cuando hay autorización de contexto y un adaptador de lectura validado.
4. **Catálogo tipado para la IA:** \`ai-budget-tools.js\` es el punto de
   validación de \`tool_call\`. No interpreta JavaScript ni acepta un nombre
   de IPC recibido desde el modelo.
5. **Planes entre módulos:** \`plan_workflow\` traduce objetivos a
   dependencias y fases informativas. El plan no ejecuta escrituras.
6. **Ejecución de presupuestos:** los cambios existentes continúan mediante
   tarjetas de revisión, autorización, validación de instantáneas y
   transacciones nativas. Nuevos dominios precisarán su propio adaptador
   antes de cualquier mutación.

## Capacidades incorporadas en el chat

| Herramienta | Argumentos | Efecto |
| --- | --- | --- |
| \`describe_capabilities\` | \`{module:"all"|ID}\` | Explica los módulos y sus dependencias, sin datos privados |
| \`plan_workflow\` | \`{goal:"objetivo natural"}\` | Propone una secuencia de tareas, requisitos, riesgos y operaciones existentes |
| \`inspect_module\` | \`{module:ID}\` | Consulta datos de la obra activa mediante adaptadores explícitos de solo lectura |

Los módulos admitidos por \`inspect_module\` son proyectos, presupuestos,
compras, subcontratos, planificación, libro de obra, certificaciones,
finanzas y depósitos. Cada uno tiene argumentos nativos predefinidos y
respuestas reducidas, sin enviar al proveedor un objeto completo de base
de datos ni detalles de otras obras.

**Diferenciar tres capacidades:**

- **Inventariada:** la función existe en CPObras y puede describirse.
- **Consultable desde IA:** existe un adaptador concreto y de solo lectura.
- **Ejecutable desde IA:** existe un contrato formal de escritura, vista
  previa, aprobación del usuario, validación nativa y auditoría.

La pertenencia a la primera categoría **no** eleva automáticamente una
función a la tercera.

## Relaciones constructivas para compras

Un pedido «Prepará las órdenes de compra de los materiales necesarios» debe
entender las dependencias:

- Obra y presupuesto vigentes.
- Partidas, cantidades y ACU con materiales por unidad.
- Acopio disponible y pedidos adjudicados pendientes de recibir.
- Solicitudes, cotizaciones y proveedores, con monedas y precios unitarios.
- Revisión y autorización para adjudicar; la recepción y el pago son
  operaciones diferentes.

El planificador reconoce esta cadena, pero **todavía no genera ni adjudica
órdenes de compra automáticamente**. Eso exige un nuevo adaptador
transaccional y pruebas, porque afectarían compras, inventario y finanzas.

## Cómo agregar una función nueva sin romper el chat

1. Registrar el comando nativo y el permiso Tauri correspondiente.
2. Ejecutar \`node tools/generate-ai-inventory.mjs\`. El comando aparecerá
   en el mapa técnico **sin habilitarse para ejecución por IA**.
3. Declarar su entidad, dependencia y regla de negocio en
   \`ai-app-knowledge.js\`.
4. Si es una consulta: crear un adaptador de sólo lectura con nombre,
   argumentos y reducción de resultados explícitos, junto con pruebas.
5. Si modifica datos: definir esquema de parámetros, permisos de obra,
   vista previa, validación de datos y revisión, transacción e idempotencia.
   El catálogo de \`tool_call\` debe permitirla sólo después de existir
   ese circuito completo.
6. Agregar una prueba de navegador que verifique el resultado real y
   rechace operaciones no autorizadas.

## Generación y verificaciones

Desde la raíz:

\`\`\`bash
node tools/generate-ai-inventory.mjs
node tools/generate-ai-inventory.mjs --check
cd apps/desktop
npm ci
npm test
npm run test:browser -- ai-app-capabilities.spec.mjs
\`\`\`

\`npm run dev\`, \`npm run build\`, \`npm run tauri\`, \`npm test\` y
\`npm run test:browser\` generan el inventario automáticamente.
Los tests específicos se ejecutan también en
\`.github/workflows/ai-chat-regression.yml\`.

### Consultas para probar en el chat

- «¿Qué puede hacer CPObras con las compras y proveedores?»
- «Prepará un plan para comprar los materiales del presupuesto, descontando
  acopio y lo pendiente de recibir».
- «¿Cuántos pedidos de materiales hay en esta obra?»
- «¿Qué relación hay entre el Gantt y los certificados de avance?»
- «¿Qué procesos podés hacer realmente desde el chat y cuáles requieren
  que use el módulo manualmente?»

Las respuestas pueden describir todo el dominio, pero deben reconocer que
automatizar las escrituras de los nuevos módulos está pendiente de
implementar. Una propuesta no equivale a un registro guardado.
