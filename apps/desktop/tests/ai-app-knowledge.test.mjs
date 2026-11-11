import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AI_NATIVE_INVENTORY} from '../src/services/ai-native-inventory.generated.js';
import {APP_MODULES,relevantAppModules,appKnowledgeContext,appCapabilityAnswer,planAppWorkflow} from '../src/services/ai-app-knowledge.js';
import {AI_TOOL_CONTRACTS,aiDomainContext} from '../src/services/ai-domain-context.js';
import {parseBudgetToolCall,executeBudgetTool} from '../src/services/ai-budget-tools.js';
import {inspectAppModule,INSPECTABLE_MODULES,focusedAppSnapshot} from '../src/services/ai-workspace-reader.js';

const state={projectId:'project-1',estimateId:'estimate-1',remoteProject:null,estimates:[{id:'estimate-1',issued:false}],lines:[],sections:[],view:'workspace'};
test('generated native and SQLite catalog is present and descriptive, never executable',()=>{
 assert.ok(AI_NATIVE_INVENTORY.native.length>80,'run the inventory generator before tests');
 assert.ok(AI_NATIVE_INVENTORY.tables.length>30,'SQLite schema was not discovered');
 assert.ok(AI_NATIVE_INVENTORY.native.some(c=>c.name==='list_supplier_orders'&&c.module==='site_workflow'));
 assert.ok(AI_NATIVE_INVENTORY.tables.some(t=>t.name==='estimate_lines'&&t.columns.some(c=>c.name==='quantity')));
 assert.ok(!Object.hasOwn(AI_NATIVE_INVENTORY,'invoke'));
});
test('all major application areas have grounded dependency and business rules',()=>{
 for(const id of ['projects','budgets','resources','acu','takeoffs','procurement','subcontracts','stock','planning','certificates','sitebook','finance','people','pricing','reporting','sync']){
  assert.ok(APP_MODULES[id]?.rule);
  for(const dep of APP_MODULES[id].depends)assert.ok(APP_MODULES[dep],id+' -> '+dep);
 }
 assert.ok(relevantAppModules('Necesito organizar compras y acopio').includes('procurement'));
 assert.ok(relevantAppModules('Cómo va la planificación de esta obra').includes('planning'));
 const context=appKnowledgeContext('Cómo funciona el circuito de compras, proveedores y acopio',state);
 assert.match(context,/quotation_requests/);
 assert.match(context,/native_write/);
 assert.ok(context.length<3450,'the context should remain bounded');
 assert.match(aiDomainContext(state,'Qué hace el módulo de compras'),/MAPA VIVO DE ARQUITECTURA/);
});
test('natural-language capabilities and workflow planning are read-only and typed',async()=>{
 assert.equal(AI_TOOL_CONTRACTS.plan_workflow.kind,'read');
 assert.deepEqual(parseBudgetToolCall({name:'describe_capabilities',args:{module:'procurement'}}),{name:'describe_capabilities',args:{module:'procurement'}});
 assert.deepEqual(parseBudgetToolCall({name:'plan_workflow',args:{goal:'Preparar órdenes de compra para la obra'}}),{name:'plan_workflow',args:{goal:'Preparar órdenes de compra para la obra'}});
 assert.equal(parseBudgetToolCall({name:'inspect_module',args:{module:'restore_backup'}}),null);
 assert.equal(parseBudgetToolCall({name:'describe_capabilities',args:{module:'nonexistent'}}),null);
 assert.equal(parseBudgetToolCall({name:'plan_workflow',args:{goal:123}}),null);
 const description=await executeBudgetTool({name:'describe_capabilities',args:{module:'procurement'}},{invoke:async()=>{throw Error('must not call IPC');},state,today:'2026-11-10'});
 assert.match(description.answer,/Materiales, compras y cotizaciones/);
 const planning=await executeBudgetTool({name:'plan_workflow',args:{goal:'Necesito emitir una orden de compra de materiales y elegir proveedores'}},{invoke:async()=>{throw Error('must not call IPC');},state,today:'2026-11-10'});
 assert.equal(planning.data.workflow,'purchase_materials');
 assert.equal(planning.read_only,true);
 assert.ok(planning.data.steps.some(s=>s.module==='stock'));
 assert.ok(planning.data.steps.some(s=>s.module==='procurement'));
 assert.match(planning.answer,/no guarda ni modifica/i);
});
test('narrow read adapters query native data without invoking any mutation',async()=>{
 const calls=[];
 const invoke=async(name,args)=>{
  calls.push({name,args});
  if(name==='list_quotation_requests')return [{id:'q1',name:'Arena gruesa',status:'open'},{id:'q2',name:'Ladrillos',status:'closed'}];
  if(name==='list_supplier_orders')return [{id:'o1',title:'Compra 1',status:'pending'}];
  throw Error('unexpected IPC: '+name);
 };
 assert.ok(INSPECTABLE_MODULES.includes('procurement'));
 const result=await inspectAppModule('procurement',{invoke,state});
 assert.equal(result.data.results.solicitudes_de_cotizacion.count,2);
 assert.equal(result.data.results.pedidos_de_materiales.count,1);
 assert.ok(calls.every(call=>['list_quotation_requests','list_supplier_orders'].includes(call.name)));
 assert.deepEqual(calls[1].args,{projectId:'project-1',kind:'material'});
 const snapshot=await focusedAppSnapshot('Cuántas compras tengo pendientes',{invoke,state});
 assert.match(snapshot,/CONSULTA REAL DE SOLO LECTURA/);
 assert.doesNotMatch(snapshot,/DELETE FROM/);
});
test('unavailable context and unsafe modules fail closed',async()=>{
 let calls=0;
 const invoke=async()=>{calls++;};
 await assert.rejects(inspectAppModule('procurement',{invoke,state:{...state,projectId:null}}),/Abrí una obra/);
 await assert.rejects(inspectAppModule('procurement',{invoke,state:{...state,remoteProject:{id:'r'}}}),/Abrí una obra/);
 await assert.rejects(inspectAppModule('restore_backup',{invoke,state}),/no habilitado/);
 assert.equal(calls,0);
 assert.equal(await focusedAppSnapshot('Necesito restaurar un backup',{invoke,state}), '');
});
