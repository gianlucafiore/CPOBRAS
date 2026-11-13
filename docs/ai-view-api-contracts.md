# API de CPObras para el asistente IA: contratos por vista

El registro vivo es apps/desktop/src/services/ai-view-api-contracts.js.
Se alimenta del inventario generado ai-native-inventory.generated.js y distingue:
la vista activa, los métodos nativos realmente registrados, sus propiedades de
entrada, su respuesta y el nivel de acceso. Esta documentación es parte del
mantenimiento interno, no concede permisos al proveedor de IA.

## Diferencia fundamental: llamada y respuesta

Tauri recibe invoke("nombre_del_comando", {propiedadCamelCase: valor});
el método Rust declara argumentos en snake_case, pero las propiedades del
objeto JavaScript son camelCase. Los campos devueltos por Rust conservan,
en general, snake_case. El asistente nunca debe fabricar un nombre de
comando, UUID, SQL o parámetros de escritura.

El registro expone los contratos de las pantallas reales:
- Inicio / proyectos: projects
- Clientes y proveedores: clients, suppliers
- Bibliotecas: resources, analyses
- Presupuesto y ACU de partida: workspace
- Administración: management
- Herramientas, impresión y precio: budget-tools, budget-printing, price-determination, costing
- Gestión de obra: planning, operations
- Otros módulos: portfolio, organizations, sharing, system-settings, backups

Cuando una pantalla no tiene ejecutor de IA validado, el registro indica
que la acción sigue siendo manual. La existencia del método en la UI no
lo convierte en un tool_call del asistente.

## Biblioteca de insumos (vista resources)

Consulta:
- list_resources(): array de {id,code,description,unit,kind,price,active}.
- ai_catalog_context({projectId:null,estimateId:null,asOf:"YYYY-MM-DD",
  currency:"ARS"}): {currency,as_of,total,resources}. price=null
  significa precio faltante, no cero.

Alta por IA revisada:
- El modelo propone resource_proposals con description,kind,unit.
- reviewAiResourceRows comprueba duplicados, formato, tipo y unidad; precios
  del modelo se descartan. Solo pueden usarse precios confirmados por usuario.
- import_resources({rows,effectiveDate,source}), cada fila:
  {code:"",description,unit,kind,price:null|decimal}.
- Respuesta nativa: {created:number,resource_ids:string[]}. Es atómica
  a nivel de importación, no modifica ACU o presupuestos.

Otros métodos de UI que NO están habilitados para ejecución libre desde IA:
create_resource, update_resource, register_resource_price.

## Biblioteca ACU independiente (vista analyses)

Consulta: list_analyses(): [{id,code,description,unit,unit_cost}].
Preparación: library_acu con insumos referenciados por IDs reales, cantidades
decimales expresadas como texto y unidad técnica verificada. La aprobación
visible del usuario es obligatoria.

Alta:
create_analysis({
 code:"",description:"Mampostería",unit:"m²",
 components:[{resourceId:"UUID real",quantity:"0.25",unitPrice:"125"}]
})
Devuelve {id,code,description,unit,unit_cost}. El código vacío se genera
automáticamente en el backend. Los insumos tienen que existir; no inventar IDs.
update_analysis y reprice_analysis existen en la interfaz, sin escritura
libre de IA. El backend no devuelve un campo committed para estas operaciones.

## Sesiones cortas por tarea y control de costos

CPObras IA **no necesita archivar conversaciones** para operar correctamente.
El estado de trabajo se obtiene del ACU/presupuesto seleccionado, la base
SQLite activa y la propuesta revisable actual.

- Mientras la propuesta está abierta, el chat retiene solo los turnos
  imprescindibles y su validación. Preguntar o aclarar NO equivale a aprobar.
- Después de un guardado nativo confirmado y completo, `finishTaskSession`
  elimina los turnos, borradores, referencias y notas temporales anteriores;
  deja únicamente el comprobante y pregunta **«¿Necesitás hacer algo más?»**
  en la interfaz, sin hacer una llamada adicional a la API.
- Si hay elementos pendientes, falla la operación, o se desconoce el resultado
  del guardado, **no** se limpia la propuesta: primero hay que verificarla.
- En la siguiente consulta, CPObras vuelve a consultar la vista seleccionada.
  No reutiliza descripciones o acuerdos de tareas anteriores.
- Las conversaciones no se guardan en `localStorage`. Al iniciar la app se
  purgan las claves heredadas `cpobras:conversation:*`.
- La limpieza se refiere a la memoria de trabajo del cliente. No altera los
  registros de presupuestos/ACU en SQLite ni sus auditorías. Tampoco implica
  borrar registros de facturación o retención del proveedor externo.

Los costos de API dependen de los tokens realmente enviados y generados,
no de cuántos mensajes se muestran. Por eso el flujo evita reenviar el
historial de tareas terminadas y no genera una respuesta adicional de IA
solo para despedirse.

## Contexto conversacional del ACU seleccionado

Para cada mensaje de la biblioteca ACU el clasificador debe recibir
**la selección real** (`selectedAnalysisId` leída con
`get_analysis_details`), la descripción, unidad, los insumos actuales y las últimas
intervenciones del usuario. No se debe interpretar un mensaje aislado ni
reiniciar el trabajo por un seguimiento breve sobre rendimientos, materiales o
dosificación.

`ai-library-conversation.js` construye un resumen acotado y **solo de lectura**;
`interaction:"question"` produce `{answer,keep_draft:true}` sin modificaciones
propuestas. Las aclaraciones del trabajo se incorporan al siguiente turno de
edición sin depender de palabras especiales.

Una búsqueda de insumos devuelve candidatos, **no equivalencias técnicas**.
Una adición de material nombrado explícitamente debe coincidir con el
material solicitado. `requestedAddedMaterials` recupera los términos
literales del usuario (sin nombres de materiales programados) y
`candidateMatchesExplicitMaterial` impide aprobar productos de
denominación no correspondiente, aunque compartan verbos de uso o palabras
parecidas. Si el nombre es diferente pero realmente equivalente, se pide
revisión explícita: no inventar la equivalencia.

Las respuestas del modelo a la biblioteca deben ser objetos JSON; para
OpenAI Responses se solicita `text.format=json_object`. La aplicación
valida además el contrato tipado y puede reintentar internamente **una sola
vez** una propuesta inválida. Las respuestas incoherentes no pueden habilitar
el botón de escritura.

## Conversión de unidades en la biblioteca ACU (decisión de la IA)

La IA es responsable de **razonar y calcular** los consumos por unidad de
obra. Los valores numéricos de una presentación comercial se obtienen de la
**descripción real del insumo en el catálogo**. CPObras no fija tamaños de bolsa,
bolsón, dosis por material ni densidades en su código.

Contrato del componente propuesto:
- resource_id: ID real del insumo consultado;
- quantity: consumo original positivo, expresado como decimal;
- quantity_unit: unidad física del consumo antes de la compra;
- catalog_quantity: cantidad **calculada por el modelo** en la unidad de precio
  del catálogo cuando difiere de quantity_unit;
- conversion_basis: {per_unit_quantity,per_unit_unit}, aportado por la IA
  cuando el insumo se vende por una presentación comercial; expresa la
  capacidad física de **una** unidad de compra documentada en el catálogo.

El validador frontend verifica únicamente las identidades de unidades físicas
universales y que los números y capacidades citados existan en la ficha del
catálogo. Si no puede corroborar el cálculo, marca el componente pendiente y
solicita al modelo **una única revisión automática**; no guarda una conjetura.
No se infiere densidad a partir del nombre comercial. La IA debe explicitar la
equivalencia cuando haya masa frente a volumen y, si no está documentada, dejar
pendiente de revisión. El usuario puede abrir el editor con lenguaje natural;
guardar sigue exigiendo un ACU válido y aprobación.

Para insumos expresamente excluidos por el usuario, el modelo devuelve
excluded y los omite de components y missing. El parser aplica esa lista
genérica, sin excepciones programadas para materiales particulares.

## Edición conversacional del ACU seleccionado (vista analyses)

La selección visible en la biblioteca es la única referencia de destino.
`state.selectedAnalysisId` identifica el ACU; la IA nunca inventa ni cambia su ID.

Flujo:
1. Consultar `get_analysis_details({analysisId})` y extraer código,
   descripción, unidad, recursos, cantidades y **precios históricos** actuales.
2. Modo de IA `library_acu_edit`: devuelve `analysis_edit` con
   operaciones **add / set / remove** solamente sobre los insumos solicitados,
   y opcionalmente descripción o unidad. Sin edición implícita de otros insumos.
3. Resolver IDs reales en el catálogo. Verificar las conversiones de la IA
   con el método genérico de cantidad física/presentación comercial.
   Mantener precios históricos existentes; un cambio de precio explícito se
   muestra en la vista previa antes de aprobarse.
4. Visualizar un diff acumulado respecto del ACU original; el usuario lo puede
   revisar en el editor o autorizar desde el chat, sin palabras mágicas.
5. Guardar mediante `update_analysis({analysisId,code,description,unit,components,
   expectedSnapshot})`. Cada componente usa propiedades IPC camelCase:
   `{resourceId,quantity,unitPrice}`. Respuesta:
   `{id,code,description,unit,unit_cost}`.
   `expectedSnapshot` contiene el estado original y Rust lo compara,
   dentro del mismo bloqueo de SQLite, antes de sobrescribirlo.
6. Un ACU seleccionado distinto, otro archivo SQLite, un ACU de partida o
   datos actualizados desde otra interfaz invalidan la propuesta pendiente.
   Una respuesta nativa inesperada no provoca reintentos de escritura.

La edición de un ACU de biblioteca no debe actualizar automáticamente los
análisis históricos guardados en presupuestos emitidos.

## Presupuesto y ACU de partida (vista workspace)

Consultas: list_project_estimates({projectId}),
list_estimate_lines({estimateId}), list_budget_sections({estimateId}),
ai_catalog_context({projectId,estimateId,asOf,currency:null}),
assisted_acu_context({projectId,estimateId,asOf}).

Cambios de ACU y partidas:
apply_reviewed_budget_batch({batch}).
El batch es ReviewedBatch del storage:
{id,estimate_id,currency,new_estimate,updates,creates,deletes,acus,section_moves}.
Respuesta nativa:
{updated:number,created:number,deleted:number,
 composed:number,moved_sections:number}.
Los identificadores y precios se resuelven en CPObras, no desde la respuesta IA;
la instantánea de la vista se valida en una transacción SQLite. La aplicación
puede construir una propiedad committed después de comprobar el guardado;
NO es una propiedad de la respuesta de Tauri.

Cambios de rubros:
apply_reviewed_section_batch({batch}).
El batch es ReviewedSectionBatch:
{id,estimate_id,creates,renames,deletes,converts}.
Respuesta nativa:
{created:number,renamed:number,deleted:number,converted:number}.
Si se elimina un rubro, no se eliminan las partidas vinculadas. El backend
rechaza modificaciones a presupuestos ajenos, emitidos, o cambiados desde
la vista previa. Los rubros no tienen cantidad, precio ni ACU.

## Otras pantallas

- management: list_project_estimates({projectId}); create_estimate con
  {projectId,title}, solo a través del circuito de UI autorizado.
- projects: list_projects, list_project_estimates y acciones UI de obra.
- clients/suppliers: consulta del directorio; escritura manual.
- planning, operations: inspect_module brinda consultas reducidas. No hay
  ejecutor transaccional de IA para crear compras, certificados, movimientos,
  pagos ni planificaciones. No prometer que estas acciones se guardaron.
- backups, system-settings: active_database() permite conocer la base activa;
  switch_database({create:boolean}) abre diálogo nativo y puede reiniciar
  la aplicación. No ofrecer este método como tool_call de IA.
- sharing y demás áreas: UI manual hasta implementar adaptador revisado.

## Seguridad y respuesta esperada

1. La IA interpreta lenguaje natural y devuelve intención/plan tipado.
2. CPObras consulta datos actuales, resuelve referencias y valida unidades,
   precio, moneda, pertenencia de IDs y estado de edición.
3. Muestra una vista previa concreta. Solo el usuario puede aprobar.
4. invokeReviewedAiAction valida pantalla, comando registrado, aprobación,
   nombres de argumentos y forma de respuesta, sin ejecutar SQL ni comandos
   arbitrarios del proveedor.
5. Solo al confirmar la respuesta nativa puede informarse que se guardó.
   Si la respuesta es inesperada después de invocar Tauri, el guardado
   puede haberse producido: NO reintentar automáticamente. Consultar los
   registros primero, para evitar duplicados.

## Mantenimiento y pruebas

Al agregar un comando nativo: registrar la función Rust en lib.rs,
autorizarla en permissions/workspace.toml, regenerar el inventario,
actualizar el contrato en ai-view-api-contracts.js e incorporar pruebas
de entrada, resultado, navegación, rechazo y aprobación.

Comandos de verificación, desde la raíz del repositorio:

    node tools/generate-ai-inventory.mjs --check
    cd apps/desktop
    npm test
    npm run build
    npm run test:browser -- ai-app-capabilities.spec.mjs

La documentación no sustituye un adaptador de ejecución real.
