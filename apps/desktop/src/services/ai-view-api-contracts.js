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
export const AI_VIEW_API=Object.freeze({screens,actions});

const permitted=new Set(AI_NATIVE_INVENTORY.native.filter(cmd=>cmd.allowed).map(cmd=>cmd.name));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sameType=(value,type)=>type==='number'?Number.isSafeInteger(value)&&value>=0:
 type==='array'?Array.isArray(value):type==='string'?typeof value==='string':object(value);

/** A bounded, descriptive contract for the CURRENT screen, never execution rights. */
export function aiViewApiContext(state={}){
 const view=state.view||'projects',screen=screens[view]||{purpose:'Vista no identificada',actions:[]};
 const available=screen.actions.filter(name=>permitted.has(name)).map(name=>{
  const spec=actions[name];
  return {method:name,access:spec.access,args:spec.args,optional:spec.optional||[],response:spec.response};
 });
 const payload={screen:view,purpose:screen.purpose,project_id:state.projectId||null,
  estimate_id:state.estimateId||null,selected_line_id:state.selectedLineId||null,
  selected_analysis_id:view==='analyses'?state.selectedAnalysisId||null:null,
  remote_read_only:!!state.remoteProject,actions:available.slice(0,6),
  policy:'Contratos informativos, NO tool_call ejecutables. Propiedades IPC camelCase, respuestas Rust snake_case. Solo rutas explícitas con aprobación; no invocar métodos a partir del texto del modelo.'};
 let serialized=JSON.stringify(payload);
 while(serialized.length>2500&&payload.actions.length>1){payload.actions.pop();serialized=JSON.stringify(payload);}
 return 'CONTRATO API NATIVA DE LA VISTA ACTIVA (solo referencia):\n'+serialized;
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
