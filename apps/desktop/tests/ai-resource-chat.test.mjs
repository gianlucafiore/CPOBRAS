import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readResourceModelDecision} from '../src/services/ai-resource-import.js';
import {validatedResourceDraft,resourceDraftSummary} from '../src/services/ai-resource-chat.js';
import {parseBudgetToolCall} from '../src/services/ai-budget-tools.js';

const quote='necesitamos cargar: Postes de madera de 3"x2.2m. Precio 17500 cada uno tejido romboidal 1500xm2 Mano de obra de Cercado Tipo subcontraro, 50.000 el m2';
const rows=[
 {description:'Poste de madera 3" × 2,2 m',kind:'material',unit:'unidad',price:'17500',price_evidence:'Precio 17500 cada uno'},
 {description:'Tejido romboidal',kind:'material',unit:'m²',price:'1500',price_evidence:'1500xm2'},
 {description:'Servicio de colocación de cercado de tejido romboidal',kind:'subcontract',unit:'m²',price:'50000',price_evidence:'50.000 el m2'}
];
function model(rows,answer='Preparé tres insumos de cercado con las unidades y precios que indicaste.'){
 return JSON.stringify({answer,tool_call:{name:'propose_resources',args:{rows}}});
}
function decide(rows,options={}){
 const tool=parseBudgetToolCall(JSON.parse(model(rows)).tool_call);
 assert.ok(tool);
 return readResourceModelDecision(JSON.stringify({
   answer:'Ficha lista para revisar',action:'propose',resource_proposals:tool.args.rows
 }),{userMessages:[quote],...options});
}
test('the same model tool works regardless of screen and produces an exact three-item card',()=>{
 const decision=decide(rows);
 assert.equal(decision.action,'propose');
 assert.deepEqual(decision.rows.map(x=>[x.description,x.kind,x.unit,x.price]),[
   ['Poste de madera 3" × 2,2 m','material','unidad','17500'],
   ['Tejido romboidal','material','m²','1500'],
   ['Servicio de colocación de cercado de tejido romboidal','subcontract','m²','50000']
 ]);
 assert.equal(validatedResourceDraft(decision.rows).pending.length,0);
 assert.equal(validatedResourceDraft(decision.rows).ready.length,3);
 assert.match(resourceDraftSummary(validatedResourceDraft(decision.rows)),/revisar/i);
});
test('unsubstantiated prices cannot be imported from the language model',()=>{
 const bad=decide([{...rows[0],price:'99999'}]);
 assert.equal(bad.rows[0].price,null);
 assert.ok(bad.rows[0].warnings.some(x=>/Precio no incorporado/.test(x)));
 const wrongSource=decide([{...rows[0],price_evidence:'fuente inexistente'}]);
 assert.equal(wrongSource.rows[0].price,null);
 const missing=decide([{description:'Malla a evaluar',kind:'material',unit:'',price:null}]);
 assert.equal(validatedResourceDraft(missing.rows).ready.length,0);
 assert.equal(validatedResourceDraft(missing.rows).pending.length,1);
});
test('model revisions preserve only previously grounded prices through draft_ref',()=>{
 const prior=decide(rows);
 const changed=readResourceModelDecision(JSON.stringify({action:'propose',answer:'Quité el cemento y mantuve precios.',resource_proposals:[
  {...rows[0],price_evidence:null,draft_ref:'0'},
  {...rows[1],price_evidence:null,draft_ref:'1'}
 ]}),{userMessages:['quitá cemento'],priorDraft:prior.rows});
 assert.deepEqual(changed.rows.map(row=>row.price),['17500','1500']);
 assert.deepEqual(changed.rows.map(row=>row.description),[rows[0].description,rows[1].description]);
});
test('approval and discard calls do not authorize IPC by themselves',()=>{
 assert.deepEqual(parseBudgetToolCall({name:'approve_resource_draft',args:{}}),{name:'approve_resource_draft',args:{}});
 assert.deepEqual(parseBudgetToolCall({name:'discard_resource_draft',args:{}}),{name:'discard_resource_draft',args:{}});
 assert.equal(parseBudgetToolCall({name:'approve_resource_draft',args:{force:true}}),null);
 assert.equal(parseBudgetToolCall({name:'import_resources',args:{rows:[]}}),null);
 assert.equal(parseBudgetToolCall({name:'arbitrary_native_command',args:{}}),null);
});
test('malformed or hostile proposals never become reviewable items',()=>{
 for(const bad of [
   {answer:'ok',tool_call:{name:'propose_resources',args:{rows:[{description:'A',unit:'unidad',kind:'material',price:'17',extra:'sql'}]}}},
   {answer:'ok',tool_call:{name:'propose_resources',args:{rows:[{description:'B',unit:'unidad',kind:'material',price:17500}]}}},
   {answer:'ok',tool_call:{name:'propose_resources',args:{rows:[]}}}
 ])assert.equal(parseBudgetToolCall(bad.tool_call),null);
 assert.throws(()=>readResourceModelDecision('{not json}'),/JSON/);
 assert.throws(()=>readResourceModelDecision(JSON.stringify({answer:'x',action:'propose',resource_proposals:[{
   description:'C',unit:'m²',kind:'subcontraro',price:'50000'
 }]})),/inválidos/);
});
