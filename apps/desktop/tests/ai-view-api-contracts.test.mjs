import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AI_NATIVE_INVENTORY} from '../src/services/ai-native-inventory.generated.js';
import {AI_VIEW_API,aiViewApiContext,invokeReviewedAiAction} from '../src/services/ai-view-api-contracts.js';

const permitted=new Set(AI_NATIVE_INVENTORY.native.filter(cmd=>cmd.allowed).map(cmd=>cmd.name));
test('every screen contract refers to real, permitted Tauri actions with response schemas',()=>{
 for(const [view,screen] of Object.entries(AI_VIEW_API.screens)){
  assert.ok(screen.purpose,view);
  for(const command of screen.actions){
   assert.ok(permitted.has(command),view+' cannot use '+command);
   assert.ok(AI_VIEW_API.actions[command]?.response,command+' response undocumented');
  }
 }
 for(const view of ['projects','clients','resources','analyses','workspace','management','operations','planning','backups']){
  const context=aiViewApiContext({view});
  assert.match(context,/PANTALLA ACTUAL Y API DEL PROGRAMA/);
  assert.match(context,/current_screen/);
  assert.match(context,/description/);
 }
 const resources=aiViewApiContext({view:'resources',selectedResourceId:'id-r',selectedLineId:'id-l'});
 assert.match(resources,/Biblioteca general de insumos/);
 assert.match(resources,/id-r/);
 assert.match(resources,/id-l/);
 assert.match(resources,/import_resources/);
 assert.match(resources,/resource_ids/);
 // Show method signatures globally, but label UI-only commands explicitly.
 assert.match(resources,/switch_database/);
 assert.match(resources,/ui_dialog_only/);
 assert.match(resources,/model_callable/);
 assert.match(resources,/native_methods/);
});

test('bridge rejects mismatched view, missing approval and invalid IPC argument names BEFORE writing',async()=>{
 const calls=[];
 const invoke=async(name,args)=>{calls.push({name,args});return {created:1,resource_ids:['id-1']};};
 const args={rows:[{code:'',description:'Arena',unit:'m3',kind:'material',price:null}],effectiveDate:'2026-11-12',source:'IA revisada'};
 await assert.rejects(invokeReviewedAiAction(invoke,'workspace','import_resources',args,{approved:true}),/no está habilitada/);
 await assert.rejects(invokeReviewedAiAction(invoke,'resources','import_resources',args),/aprobación explícita/);
 await assert.rejects(invokeReviewedAiAction(invoke,'resources','import_resources',{...args,effective_date:'2026-11-12'},{approved:true}),/Parámetros IPC/);
 assert.equal(calls.length,0);
 assert.deepEqual(await invokeReviewedAiAction(invoke,'resources','import_resources',args,{approved:true}),{created:1,resource_ids:['id-1']});
 assert.deepEqual(calls[0],{name:'import_resources',args});
});

test('native response types are checked and uncertain writes are never auto-retried',async()=>{
 let calls=0;
 const native=async()=>{calls++;return {created:1};};
 await assert.rejects(invokeReviewedAiAction(native,'resources','import_resources',{rows:[],effectiveDate:'2026-11-12',source:'test'},{approved:true}),/PUDO guardarse/);
 assert.equal(calls,1);
 const analysis={id:'acu-id',code:'ACU-1',description:'Muro',unit:'m2',unit_cost:'0'};
 assert.deepEqual(await invokeReviewedAiAction(async()=>analysis,'analyses','create_analysis',{code:'',description:'Muro',unit:'m2',components:[]},{approved:true}),analysis);
 const rubros=await invokeReviewedAiAction(async()=>({created:1,renamed:0,deleted:0,converted:0}),'workspace','apply_reviewed_section_batch',{batch:{}},{approved:true});
 assert.equal(rubros.created,1);
 const presup=await invokeReviewedAiAction(async()=>({updated:0,created:1,deleted:0,composed:0,moved_sections:0}),'workspace','apply_reviewed_budget_batch',{batch:{}},{approved:true});
 assert.equal(presup.created,1);
});
