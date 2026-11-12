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
