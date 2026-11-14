// Verified Tauri API contracts used by the conversational assistant.
// Native command discovery is NOT an AI permission. Only audited UI code
// may invoke a reviewed write after approval and local validation.
import {AI_NATIVE_INVENTORY} from './ai-native-inventory.generated.js';

const actions=Object.freeze({
 list_projects:{access:'read',args:[],response:'ProjectView[]'},
 list_clients:{access:'read',args:[],response:'ClientView[]'},
 list_project_estimates:{access:'read',args:['projectId'],response:'EstimateView[{id,title,currency,issued}][]'},
 list_estimate_lines:{access:'read',args:['estimateId'],response:'LineView[{id,description,unit,quantity,unit_cost,total,analysis_id}][]'},
 list_budget_sections:{access:'read',args:['estimateId'],response:'BudgetSectionView[{id,estimate_id,parent_id,code,title,position}][]'},
 list_resources:{access:'read',args:[],response:'ResourceView[{id,code,description,unit,kind,price|null,active}][]'},
 list_analyses:{access:'read',args:[],response:'AnalysisView[{id,code,description,unit,unit_cost}][]'},
 get_analysis_details:{access:'read',args:['analysisId'],response:'{is_line_owned,code,description,unit,unit_cost,components:[{resource_id,description,kind,quantity,unit_price,total}]}'},
 ai_catalog_context:{access:'read',args:['asOf'],optional:['projectId','estimateId','currency'],response:'{currency,as_of,total,resources:[{id,code,description,unit,kind,price|null,price_source,effective_date|null,active}]}'},
 assisted_acu_context:{access:'read',args:['projectId'],optional:['estimateId','asOf'],response:'{currency,resources,lines,sections,...}'},
 create_resource:{access:'ui_write',args:['code','description','unit','kind','price','effectiveDate'],optional:['source'],response:'ResourceView'},
 update_resource:{access:'ui_write',args:['resourceId','code','description','unit','kind','active'],response:'ResourceView'},
 register_resource_price:{access:'ui_write',args:['resourceId','amount','currency','effectiveDate'],optional:['source'],response:'{id,amount,currency,effective_date,source}'},
 create_analysis:{access:'reviewed_write',args:['code','description','unit','components'],response:'{id,code,description,unit,unit_cost}'},
 update_analysis:{access:'reviewed_write',args:['analysisId','code','description','unit','components'],optional:['expectedSnapshot'],response:'{id,code,description,unit,unit_cost}'},
 reprice_analysis:{access:'ui_write',args:['analysisId','effectiveDate'],response:'AnalysisView'},
 import_resources:{access:'reviewed_write',args:['rows','effectiveDate','source'],response:'{created:number,resource_ids:string[]}'},
 apply_reviewed_section_batch:{access:'reviewed_write',args:['batch'],response:'{created:number,renamed:number,deleted:number,converted:number}'},
 apply_reviewed_budget_batch:{access:'reviewed_write',args:['batch'],response:'{updated:number,created:number,deleted:number,composed:number,moved_sections:number}'},
 create_estimate:{access:'ui_write',args:['projectId','title'],response:'{id,title,currency,issued}'},
 active_database:{access:'read',args:[],response:'DatabaseInfo (SQLite activo)'},
 switch_database:{access:'ui_dialog_only',args:['create'],response:'void; abre diálogo del SO y puede reiniciar la aplicación'}
});
const screens=Object.freeze({
 projects:{purpose:'Inicio / obras y presupuestos',actions:['list_projects','list_project_estimates','create_estimate']},
 clients:{purpose:'Directorio de clientes',actions:['list_clients']},
 suppliers:{purpose:'Directorio de proveedores; sin adaptador de IA',actions:[]},
 resources:{purpose:'Biblioteca de insumos',actions:['import_resources','ai_catalog_context','list_resources','create_resource','update_resource','register_resource_price']},
 analyses:{purpose:'Biblioteca de ACU reutilizables',actions:['update_analysis','get_analysis_details','create_analysis','ai_catalog_context','list_analyses','list_resources','reprice_analysis']},
 workspace:{purpose:'Presupuesto, partidas, rubros y ACU',actions:['apply_reviewed_budget_batch','apply_reviewed_section_batch','assisted_acu_context','ai_catalog_context','list_estimate_lines','list_budget_sections','list_project_estimates']},
 management:{purpose:'Administración de obra y presupuestos',actions:['list_project_estimates','create_estimate']},
 'budget-tools':{purpose:'Herramientas de presupuesto; no ejecutar acciones no revisadas',actions:['list_estimate_lines','list_budget_sections']},
 'budget-printing':{purpose:'Impresión y exportación; UI manual',actions:[]},
 'price-determination':{purpose:'Determinación de precio; UI manual',actions:[]},
 costing:{purpose:'Precios y costos; necesita adaptador específico',actions:[]},
 planning:{purpose:'Planificación/Gantt; solo inspect_module para lectura',actions:[]},
 operations:{purpose:'Compras, gestión y certificados; solo inspect_module para lectura',actions:[]},
 portfolio:{purpose:'Cartera de obras; sin escritura IA',actions:[]},
 organizations:{purpose:'Organizaciones; sin escritura IA',actions:[]},
 sharing:{purpose:'P2P; nunca habilitar por IA',actions:[]},
 'system-settings':{purpose:'Configuración y base SQLite; solo UI manual',actions:['active_database','switch_database']},
 backups:{purpose:'Respaldo/restauración; solo UI manual',actions:['active_database']}
});
const screenDescriptions=Object.freeze({
 "projects": "Pantalla de inicio para elegir la obra, el cliente y sus presupuestos; sirve para abrir o gestionar trabajos.",
 "clients": "Directorio de clientes para consultar a quién pertenecen las obras y los presupuestos.",
 "suppliers": "Directorio de proveedores para consultar y administrar contactos comerciales; las escrituras aún no están conectadas al agente.",
 "resources": "Biblioteca general de insumos: materiales, mano de obra, equipos y subcontratos, con unidad de compra y precios vigentes; sirve para crear, consultar y reutilizar recursos en los ACU.",
 "analyses": "Biblioteca de análisis de costos unitarios (ACU) reutilizables: cada receta compone materiales, mano de obra, equipos y consumos por unidad de obra.",
 "workspace": "Editor del presupuesto activo: organiza rubros y partidas, cantidades, precios y ACU; sirve para presupuestar y calcular costos de la obra.",
 "management": "Vista de administración de una obra y sus presupuestos, para gestionar su estado y seguimiento.",
 "budget-tools": "Herramientas de elaboración y verificación del presupuesto activo, sus partidas y mediciones.",
 "budget-printing": "Vista de impresión y exportación de presupuestos, planillas y documentación.",
 "price-determination": "Vista de determinación del precio de venta a partir de costos y criterios comerciales.",
 "costing": "Vista de costos y precios; consulta y comparación de insumos y costos de obra.",
 "planning": "Planificación/Gantt de obra: tareas, precedencias, duración, plazos e hitos.",
 "operations": "Gestión de obra: pedidos, compras, subcontratos, certificaciones y actividad operativa.",
 "portfolio": "Cartera y seguimiento agregado de obras.",
 "organizations": "Organizaciones, personas y equipos vinculados a la gestión.",
 "sharing": "Sincronización y colaboración entre instalaciones; las operaciones P2P no están autorizadas por IA.",
 "system-settings": "Configuración del programa y selección de archivo SQLite; cambiar base es una operación manual.",
 "backups": "Resguardos y restauración de bases de datos, de uso manual por seguridad."
});
export const AI_VIEW_API=Object.freeze({screens,actions});

const permitted=new Set(AI_NATIVE_INVENTORY.native.filter(cmd=>cmd.allowed).map(cmd=>cmd.name));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sameType=(value,type)=>type==='number'?Number.isSafeInteger(value)&&value>=0:
 type==='array'?Array.isArray(value):type==='string'?typeof value==='string':object(value);

/** A bounded, descriptive contract for the CURRENT screen, never execution rights. */
export function aiViewApiContext(state={},agentTools={}){
 const view=state.view||'projects',screen=screens[view]||{purpose:'Vista no identificada',actions:[]};
 // These are documented native interfaces, NOT arbitrary model-executable
 // commands. The model can call only tools in AI_TOOL_CONTRACTS, and native
 // reviewed writes additionally require approval and response validation.
 const methods=Object.entries(actions).filter(([name])=>permitted.has(name)).map(([name,spec])=>({
  method:name,access:spec.access,args:spec.args,optional:spec.optional||[],response:spec.response,
  model_callable:false,
  execution:spec.access==='reviewed_write'?'solo_por_adaptador_tras_aprobacion':spec.access==='read'?'consulta_por_adaptador':'solo_interfaz',
 }));
 const selection={
  project_id:state.projectId||null,estimate_id:state.estimateId||null,
  line_id:state.selectedLineId||null,
  analysis_id:state.selectedAnalysisId||null,
  resource_id:state.selectedResourceId||null,
 };
 const payload={
  current_screen:{id:view,title:screen.purpose,description:screenDescriptions[view]||screen.purpose,
    purpose:'Esta es la pantalla visible; indica contexto, NO restringe los métodos de la IA.'},
  selection,remote_read_only:!!state.remoteProject,
  agent_methods:Object.entries(agentTools).map(([name,spec])=>({
    method:name,args:spec.args,access:spec.kind,effect:spec.effect,response:spec.response||'Respuesta tipada validada por CPOBRAS'
  })),
  native_methods:methods,
  safety:'El inventario nativo documenta métodos y respuestas: NO permite llamadas IPC arbitrarias. El agente sólo puede solicitar agent_methods y aprobar escrituras en una ficha revisada.'
 };
 return 'PANTALLA ACTUAL Y API DEL PROGRAMA (contexto común a todos los pedidos):\\n'+JSON.stringify(payload);
}
const resultChecks={
 import_resources:{created:'number',resource_ids:'array'},
 create_analysis:{id:'string',code:'string',description:'string',unit:'string',unit_cost:'string'},
 update_analysis:{id:'string',code:'string',description:'string',unit:'string',unit_cost:'string'},
 apply_reviewed_section_batch:{created:'number',renamed:'number',deleted:'number',converted:'number'},
 apply_reviewed_budget_batch:{updated:'number',created:'number',deleted:'number'}
};
/** Audited, already approved UI-only bridge: fail closed before IPC.
 * If the native response is malformed, do not auto-retry: the save is uncertain.
 */
export async function invokeReviewedAiAction(invoke,view,name,args,{approved=false}={}){
 const screen=screens[view],spec=actions[name];
 if(!screen?.actions.includes(name)||!spec||spec.access!=='reviewed_write'||!permitted.has(name))
  throw new Error('La acción de IA no está habilitada para esta pantalla: '+name);
 if(approved!==true)throw new Error('La operación requiere aprobación explícita de la propuesta.');
 if(typeof invoke!=='function'||!object(args))throw new Error('Parámetros IPC incompletos');
 const allowed=new Set([...spec.args,...(spec.optional||[])]);
 if(Object.keys(args).some(key=>!allowed.has(key))||spec.args.some(key=>!Object.hasOwn(args,key)))
  throw new Error('Parámetros IPC incorrectos para '+name+': '+spec.args.join(', '));
 const result=await invoke(name,args);
 if(!object(result)||Object.entries(resultChecks[name]).some(([key,type])=>!sameType(result[key],type)))
  throw new Error('Respuesta inesperada de '+name+'. La operación PUDO guardarse: verificá los registros antes de reintentar.');
 return result;
}
