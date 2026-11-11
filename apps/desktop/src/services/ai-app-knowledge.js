// Cross-module domain map for CPObras. Business rules are curated; tables and
// registered native actions come from a generated inventory of the real source.
// A native command being present in the app is NOT an AI execution grant.
import {AI_NATIVE_INVENTORY} from './ai-native-inventory.generated.js';

export const APP_MODULES=Object.freeze({
 projects:{
  title:'Obras y clientes',terms:['obra','obras','proyecto','proyectos','cliente','clientes'],
  entities:['clients','projects','project_attachments'],depends:[],
  read:['list_projects','list_clients','list_project_attachments','list_project_estimates'],
  write:['create_project','update_project','create_client','add_project_attachment'],
  rule:'Cada presupuesto y flujo de gestión pertenece a una obra; validar titularidad y permisos antes de cualquier cambio.'
 },
 budgets:{
  title:'Presupuestos, rubros y partidas',terms:['presupuesto','presupuestos','partida','partidas','rubro','rubros'],
  entities:['estimates','estimate_lines','budget_sections','estimate_line_sections','estimate_pricing'],depends:['projects'],
  read:['list_project_estimates','list_estimate_lines','estimate_total','list_budget_sections'],
  write:['apply_reviewed_budget_batch','apply_reviewed_section_batch','edit_budget_lines'],
  rule:'Solo presupuestos propios en elaboración se pueden editar. Rubro agrupa partidas y no tiene unidad, cantidad ni ACU.'
 },
 resources:{
  title:'Biblioteca de insumos y precios',terms:['insumo','insumos','material','materiales','mano de obra','precio de insumo','biblioteca','catalogo'],
  entities:['resources','resource_prices','estimate_resource_prices','analyses'],depends:['budgets'],
  read:['list_resources','list_price_history','list_analyses','ai_catalog_context'],
  write:['create_resource','update_resource','register_resource_price'],
  rule:'Un precio tiene unidad, moneda y fecha. Un precio ausente no equivale a cero y una coincidencia de nombre no confirma equivalencia técnica.'
 },
 acu:{
  title:'Análisis de costos unitarios',terms:['acu','acus','analisis de costos','rendimiento','rendimientos','dosificacion','consumo','consumos'],
  entities:['analyses','estimate_lines','line_analysis_sources','line_analysis_snapshots'],depends:['budgets','resources'],
  read:['assisted_acu_context','analysis_cost_breakdown'],
  write:['apply_reviewed_budget_batch','save_line_resources','reprice_analysis'],
  rule:'Costo unitario = suma de consumos por unidad × precio de insumo. La IA propone consumos, CPObras calcula con decimales exactos y controla unidades.'
 },
 takeoffs:{
  title:'Cómputos y metrados',terms:['metrado','metrados','computo','computos','medicion','mediciones','dimensiones','superficie','volumen'],
  entities:['takeoff_rows','measured_lines','line_formulas'],depends:['budgets'],
  read:['list_takeoffs','list_measured_lines'],
  write:['save_takeoff','apply_takeoff','set_line_formula'],
  rule:'Los metrados medidos no deben sustituirse por hipótesis de IA; cantidad y parcial dependen de una unidad compatible.'
 },
 procurement:{
  title:'Materiales, compras y cotizaciones',terms:['compra','compras','orden de compra','ordenes de compra','pedido','pedidos','cotizacion','cotizaciones','adjudicacion','proveedor','proveedores','abastecimiento'],
  entities:['quotation_requests','quotation_responses','quotation_awards','operation_documents'],depends:['budgets','acu','resources','stock'],
  read:['list_quotation_requests','list_quote_responses','list_supplier_orders','award_balances'],
  write:['create_quotation_request','save_quote_response','award_quotation','receive_material_order'],
  rule:'Necesidades materiales dependen de ACU, cantidades, acopio y pendientes de entrega. Cotizaciones no alteran precios del presupuesto. Adjudicar genera compromisos.'
 },
 subcontracts:{
  title:'Subcontratos y cuadrillas',terms:['subcontrato','subcontratos','subcontratacion','contratista','contratistas','cuadrilla','cuadrillas','tercerizado'],
  entities:['quotation_requests','quotation_awards','operation_documents'],depends:['budgets','planning','certificates'],
  read:['list_quotation_requests','list_supplier_orders','list_certificate_drafts'],
  write:['award_quotation','revise_subcontract','issue_certificate_draft'],
  rule:'La contratación define tareas, modalidades y límites. Su avance y certificados afectan compromisos y pagos; no confundir con compra de materiales.'
 },
 stock:{
  title:'Depósitos, acopio y entregas',terms:['acopio','deposito','depositos','stock','inventario','almacen','entrega','entregas','recepcion','recepciones'],
  entities:['operation_warehouses','operation_stock','supplier_movements'],depends:['procurement','projects'],
  read:['list_warehouses','stock_balances','list_supplier_movements'],
  write:['create_warehouse','receive_material_order_with_proof','record_supplier_movement'],
  rule:'Recepción aumenta acopio y está limitada a cantidades pendientes del pedido. No confundir pedido adjudicado con material efectivamente recibido.'
 },
 planning:{
  title:'Planificación, calendario y Gantt',terms:['planificacion','planificar','gantt','cronograma','calendario','hito','hitos','plazo','plazos','tarea','tareas'],
  entities:['project_plans','plan_baselines','plan_revisions','plan_task_references'],depends:['projects','budgets'],
  read:['get_project_plan','list_plan_baselines','list_plan_revisions','get_general_calendar'],
  write:['save_project_plan','create_plan_baseline'],
  rule:'Cambios de plazo deben considerar dependencias, calendario, rendimientos y una revisión de planificación.'
 },
 certificates:{
  title:'Certificaciones y avances',terms:['certificado','certificados','certificacion','certificaciones','avance','avances','comitente'],
  entities:['certificate_drafts','certificate_sheets','certified_sources'],depends:['budgets','planning','subcontracts'],
  read:['list_certificate_drafts','available_progress','certificate_editor_sheet'],
  write:['save_certificate_draft','issue_certificate_draft','open_next_client_certificate'],
  rule:'Certificados emitidos se conservan; el avance físico aprobado y su valoración no son lo mismo que compras ni pagos.'
 },
 sitebook:{
  title:'Libro de obra y partes diarios',terms:['libro de obra','parte diario','partes diarios','parte de obra','bitacora','novedades','registro de obra'],
  entities:['site_book_entries'],depends:['projects','planning'],
  read:['list_site_entries'],
  write:['save_site_entry','confirm_site_entry'],
  rule:'Un parte es borrador hasta confirmar; el confirmado no se edita y no crea automáticamente costos o avance.'
 },
 finance:{
  title:'Finanzas, caja y operaciones',terms:['finanzas','financiero','caja','pago','pagos','cobro','cobros','deuda','deudas','flujo de fondos','anticipo','anticipos'],
  entities:['operation_documents','operation_links','advance_agreement_links'],depends:['projects','procurement','certificates'],
  read:['list_operations','operations_report','operations_portfolio'],
  write:['post_operation','register_fund_movement','material_payment_with_proof'],
  rule:'Pagos, certificaciones, anticipos y recepción son eventos distintos. Evitar duplicar obligaciones y controlar documentos conciliados.'
 },
 people:{
  title:'Personas y organizaciones',terms:['personal','empleado','empleados','persona','personas','organizacion','organizaciones','empresa','empresas','contacto','contactos'],
  entities:['organizations','project_organizations','project_suppliers','management_records'],depends:['projects'],
  read:['list_persons','list_organizations','list_management_records'],
  write:['save_person','add_person_role','save_organization'],
  rule:'Las entidades externas y sus datos personales requieren permisos y no deben mezclarse con registros de otras obras.'
 },
 pricing:{
  title:'Determinación de precios e índices',terms:['precio de venta','determinacion','indice','indices','redeterminacion','ajuste de precios','inflacion'],
  entities:['estimate_price_definitions','price_definition_templates','index_points','estimate_adjustment_agreements'],depends:['budgets','finance'],
  read:['get_price_definition','list_price_templates','list_index_points'],
  write:['save_price_definition','save_index_point','save_adjustment_agreement'],
  rule:'Costo directo, gastos, impuestos, financiación y ajuste por índices son conceptos distintos; ningún índice se inventa.'
 },
 reporting:{
  title:'Reportes y trazabilidad',terms:['reporte','reportes','informe','informes','auditoria','auditar','historial','trazabilidad'],
  entities:['change_events','deleted_estimate_lines','assisted_budget_batches'],depends:['budgets','finance'],
  read:['list_change_events','operations_report','operations_portfolio'],
  write:['write_export','open_export_pdf'],
  rule:'Reportar no equivale a modificar. Los estados y totales deben proceder de operaciones verificables, no de aproximaciones del modelo.'
 },
 sync:{
  title:'Sincronización, permisos y respaldos',terms:['sincronizacion','sincronizar','p2p','compartir','permisos','respaldo','backup','copia de seguridad','restaurar'],
  entities:['entity_archives','schema_migrations'],depends:['projects','people'],
  read:['p2p_status','get_backup_settings','list_backups','verify_database'],
  write:['p2p_sync','restore_backup','create_backup'],
  rule:'Una copia o sincronización puede sustituir datos: exigir aprobación de la aplicación y nunca delegar restauraciones a una IA.'
 }
});

const text=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const native=new Map(AI_NATIVE_INVENTORY.native.map(item=>[item.name,item]));
const db=new Map(AI_NATIVE_INVENTORY.tables.map(item=>[item.name,item]));
const matched=word=>Object.entries(APP_MODULES).filter(([,mod])=>mod.terms.some(term=>word.includes(text(term)))).map(([key])=>key);

export function relevantAppModules(question='',max=3){
 const q=text(question);
 const selected=matched(q);
 if(!selected.length)return ['projects','budgets'];
 if(selected.length>max)return selected.slice(0,max);
 // A dependency is context, not a new executable step. Include no more than
 // two dependencies to avoid flooding the provider with unrelated modules.
 const deps=[];
 for(const key of selected)for(const dep of APP_MODULES[key].depends){
  if(!selected.includes(dep)&&!deps.includes(dep)&&deps.length<2)deps.push(dep);
 }
 return [...selected,...deps].slice(0,max+2);
}

function commandInformation(names){
 return names.map(name=>{
  const entry=native.get(name);
  return {name,registered:!!entry,desktop_allowed:entry?.allowed===true};
 });
}
export function appModuleOverview(module){
 const names=module&&module!=='all'?[module]:Object.keys(APP_MODULES);
 if(names.some(id=>!Object.hasOwn(APP_MODULES,id)))return null;
 return names.map(id=>{
  const m=APP_MODULES[id];
  return {id,title:m.title,related:m.depends,entities:m.entities,
   desktop_read:m.read.filter(name=>native.get(name)?.allowed===true),
   ui_operations:m.write.filter(name=>native.get(name)?.allowed===true),
   rule:m.rule};
 });
}
export function appKnowledgeContext(question='',state={}){
 const modules=relevantAppModules(question);
 const fullSchema=/\b(?:esquema|base de datos|tablas?|columnas?|estructura interna|relaciones de datos)\b/.test(text(question));
 const details=modules.map(id=>{
  const m=APP_MODULES[id];
  return {module:id,title:m.title,rule:m.rule,requires:m.depends,
   entities:m.entities.map(name=>{
    const table=db.get(name);
    return fullSchema?{table:name,columns:table?.columns?.slice(0,9).map(c=>c.name)||[],references:table?.references||[]}:{table:name};
   }),native_read:commandInformation(m.read).filter(x=>x.registered&&x.desktop_allowed).slice(0,5),
   native_write:commandInformation(m.write).filter(x=>x.registered&&x.desktop_allowed).slice(0,4)};
 });
 const payload={
  inventory_version:AI_NATIVE_INVENTORY.version,
  discovered_native_commands:AI_NATIVE_INVENTORY.native.length,
  discovered_db_tables:AI_NATIVE_INVENTORY.tables.length,
  selection:modules,
  modules:details,
  active:{project_id:state.projectId||null,estimate_id:state.estimateId||null,
   view:state.view||null,remote:!!state.remoteProject,selected_line_id:state.selectedLineId||null,
   editable:!state.remoteProject&&!state.pageDirty&&!state.estimates?.find(e=>e.id===state.estimateId)?.issued},
  policy:'Estos son comandos instalados en la aplicación, NO herramientas otorgadas a la IA. Solo herramientas con validador y autorización explícitos pueden ejecutarse; ante falta de adaptador, describí el plan y la función manual sin afirmar que se ejecutó.'
 };
 // Never let a large application map displace the active budget or the
 // evidence retrieved from the catalog in the bounded provider context.
 let serialized=JSON.stringify(payload);
 while(serialized.length>3100&&payload.modules.length>1){payload.modules.pop();serialized=JSON.stringify(payload);}
 if(serialized.length>3100){
  payload.modules=payload.modules.map(m=>({module:m.module,title:m.title,rule:m.rule,requires:m.requires,entities:m.entities.map(x=>x.table),native_read:m.native_read.slice(0,3)}));
  serialized=JSON.stringify(payload);
 }
 return 'MAPA VIVO DE ARQUITECTURA CPObras (informativo, sin permisos de ejecución):\n'+serialized;
}

export function appCapabilityAnswer(module='all'){
 const selected=appModuleOverview(module);
 if(!selected)return {answer:'No existe ese módulo en el mapa de CPObras. Pedí una lista de módulos disponibles.',data:{modules:Object.keys(APP_MODULES)},read_only:true};
 const summary=selected.map(m=>m.title+' ('+m.id+'): '+m.rule);
 return {answer:module==='all'?'CPObras tiene '+selected.length+' áreas de trabajo identificadas: '+selected.map(x=>x.title).join(' · ')+'. Podés consultar una en detalle.':summary.join(' '),
  data:{modules:selected,version:AI_NATIVE_INVENTORY.version},read_only:true};
}

const workflows=[
 {id:'purchase_materials',matches:['compra','orden de compra','abastecimiento','materiales para'],required:['budgets','acu','stock','procurement'],
  steps:[['budgets','Consultar el presupuesto vigente y partidas'],['acu','Calcular necesidades por consumo del ACU'],['stock','Descontar acopio y pedidos pendientes de recepción'],['procurement','Preparar solicitud de cotización y seleccionar proveedores'],['procurement','Revisar adjudicación y orden de compra']]},
 {id:'certify_progress',matches:['certificar','certificacion','certificado','avance de obra'],required:['budgets','planning','certificates'],
  steps:[['budgets','Identificar cantidades y precios del contrato'],['planning','Contrastar cronograma y avance realizado'],['certificates','Preparar borrador de certificado y comprobar avances'],['certificates','Revisar y emitir con autorización']]},
 {id:'plan_works',matches:['cronograma','gantt','planificar','plazos','planificacion'],required:['projects','budgets','planning'],
  steps:[['budgets','Identificar partidas y cantidades'],['planning','Determinar tareas, dependencias y duración'],['planning','Calcular cronograma y comparar líneas base'],['planning','Revisar y guardar nueva revisión del plan']]},
 {id:'budget_review',matches:['revisa este presupuesto','organiza las partidas','completa los acu'],required:['budgets','resources','acu'],
  steps:[['budgets','Relevar partidas y rubros reales'],['resources','Consultar precios de biblioteca'],['acu','Preparar análisis y registrar faltantes'],['budgets','Revisar y aplicar lote validado de rubros y ACU']]}
];
export function planAppWorkflow(goal,state={}){
 const q=text(goal).trim();
 if(!q||q.length>3000)throw new Error('Describí el objetivo en hasta 3000 caracteres');
 const flow=workflows.find(w=>w.matches.some(term=>q.includes(text(term))));
 const modules=flow?flow.required:relevantAppModules(goal,3);
 const steps=flow?flow.steps:modules.map(id=>[id,'Consultar el módulo '+APP_MODULES[id].title+' y definir operaciones y datos necesarios']);
 const plan=steps.map(([module,description],i)=>({
  order:i+1,module,description,
  available_read:APP_MODULES[module].read.filter(name=>native.get(name)?.allowed===true).slice(0,4),
  writes_require_review:APP_MODULES[module].write.filter(name=>native.get(name)?.allowed===true).slice(0,4)
 }));
 const constraints=[];
 if(!state.projectId)constraints.push('Elegí una obra para operar sobre sus datos reales.');
 if(state.remoteProject)constraints.push('Este proyecto remoto es de solo lectura.');
 if(state.estimates?.find(e=>e.id===state.estimateId)?.issued)constraints.push('El presupuesto emitido es inmutable.');
 const ready=flow?.id==='budget_review'&&!!state.projectId&&!state.remoteProject;
 return {answer:'Plan de trabajo para «'+goal+'»: '+plan.map(p=>p.order+'. '+p.description).join('; ')+'. '+(constraints.length?'Condiciones: '+constraints.join(' '):'')+(ready?' El circuito revisado de rubros y ACU ya dispone de herramientas de preparación y aprobación.':' Las operaciones de otros módulos todavía requieren adaptadores validados; el plan no guarda ni modifica nada.'),
  data:{workflow:flow?.id||'custom',modules,steps:plan,constraints,read_only:true},read_only:true};
}
