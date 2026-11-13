import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedPlanRunner} from '../src/services/ai-approved-plan.js';

const projectId='30000000-0000-4000-8000-000000000001';
const estimateId='30000000-0000-4000-8000-000000000002';
const oldLineId='30000000-0000-4000-8000-000000000003';
const proposed=(overrides={})=>({description:'Revoque grueso',unit:'m²',quantity:'42',unit_price:'1500.25',section:'Revoques',target:'new',selected:false,new_id:oldLineId,...overrides});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture({newEstimate=false,currency='ARS',lines=[]}={}){
 const state={view:newEstimate?'management':'workspace',projectId,estimateId:newEstimate?null:estimateId,projects:[{id:projectId,currency}],estimates:newEstimate?[]:[{id:estimateId,currency,issued:false}],lines:[],selectedLineId:oldLineId,search:'anterior',panel:'summary',modal:null,pageDirty:false,remoteProject:null,navigating:false};
 const calls=[],loads=[],batches=[],events=[];
 const hooks={};
 const invoke=async(name,args)=>{
  calls.push({name,args:structuredClone(args)});
  if(name==='assisted_acu_context')return hooks.context?await hooks.context(args):{currency,lines:structuredClone(lines)};
  if(name==='apply_reviewed_budget_batch'){batches.push(structuredClone(args.batch));return hooks.write?await hooks.write(args.batch):{created:args.batch.creates.length,updated:0,deleted:0};}
  throw new Error('Unexpected native command '+name);
 };
 const runner=createApprovedPlanRunner({invoke,state,
  loadEstimate:async()=>{loads.push('estimate');if(hooks.refresh)await hooks.refresh();},
  loadEstimates:async()=>{loads.push('estimates');state.estimates=batches.map(batch=>({id:batch.estimate_id,currency,issued:false}));if(hooks.list)await hooks.list();},
  openEstimate:async(id,lineId)=>{loads.push(['open',id,lineId]);state.estimateId=id;state.selectedLineId=lineId;state.view='workspace';if(hooks.open)await hooks.open();},
 });
 return {state,calls,loads,batches,hooks,runner,events,progress:event=>events.push(event)};
}

test('an approved plan creates only new lines with private IDs and no AI or model commands',async()=>{
 const f=fixture(),rows=[proposed({sql:'DELETE FROM estimate_lines',id:oldLineId,quantity:null,unit_price:null})];
 const result=await f.runner.run(rows,{onProgress:f.progress});
 assert.equal(result.committed,true);assert.equal(result.created,1);assert.equal(result.saved,0);assert.equal(result.pending,0);
 assert.deepEqual(f.calls.map(call=>call.name),['assisted_acu_context','apply_reviewed_budget_batch']);
 const batch=f.batches[0];assert.deepEqual(batch.updates,[]);assert.deepEqual(batch.deletes,[]);assert.equal(batch.new_estimate,null);
 assert.equal(batch.creates[0].quantity,'0');assert.equal(batch.creates[0].unit_price,'0');assert.equal(batch.creates[0].section,'Revoques');
 assert.notEqual(batch.creates[0].id,oldLineId);assert.notEqual(batch.id,batch.creates[0].id);
 assert.deepEqual(Object.keys(batch.creates[0]).sort(),['description','id','quantity','section','unit','unit_price'].sort());
 assert.equal(JSON.stringify(batch).includes('DELETE'),false);
 assert.deepEqual(result.lineIds,[batch.creates[0].id]);assert.equal(f.state.selectedLineId,result.lineIds[0]);assert.equal(f.state.panel,'acu');assert.equal(f.state.search,'');
 assert.deepEqual(f.events.map(event=>event.phase),['preparing','saving','done']);assert.ok(f.events.every(event=>event.projectId===projectId&&event.estimateId===estimateId));
});

test('a new project gets one new estimate in the actual project currency',async()=>{
 const f=fixture({newEstimate:true,currency:'USD'});
 const result=await f.runner.run([proposed()]);
 assert.equal(result.committed,true);assert.equal(result.created,1);
 const batch=f.batches[0];assert.equal(batch.currency,'USD');assert.notEqual(batch.estimate_id,estimateId);
 assert.deepEqual(batch.new_estimate,{project_id:projectId,title:'Presupuesto con partidas'});
 assert.deepEqual(f.loads,['estimates',['open',batch.estimate_id,result.lineIds[0]]]);
 assert.equal(f.calls[0].args.estimateId,null);assert.equal(f.calls[0].args.projectId,projectId);
});

test('invalid values and destructive targets are rejected before any native write',async()=>{
 for(const extra of [{unit:''},{description:''},{quantity:'-1'},{quantity:2},{unit_price:'-1'},{unit_price:'1,000'},{unit:'x'.repeat(31)},{section:'x'.repeat(101)},{target:oldLineId},{operation:'delete'},{action:'edit'},{components:[{resource_id:'x',quantity:'1'}]}]){
  const f=fixture();await assert.rejects(f.runner.run([proposed(extra)]));assert.equal(f.batches.length,0);
 }
 const f=fixture();await assert.rejects(f.runner.run([]),/1 y 60/);await assert.rejects(f.runner.run(Array.from({length:61},()=>proposed())),/1 y 60/);
 assert.equal(f.calls.length,0);
});

test('duplicate checks use fresh native lines and block the entire proposal rather than duplicating',async()=>{
 const f=fixture({lines:[{id:oldLineId,description:'Revoque grueso',unit:'m2'}]});
 await assert.rejects(f.runner.run([proposed({description:'REVOQUE GRUESO'}),proposed({description:'Otra partida'})]),/Ya existe o se repite/);
 assert.equal(f.batches.length,0);assert.equal(f.state.lines.length,0);
 const repeated=fixture();await assert.rejects(repeated.runner.run([proposed(),proposed({description:'revoque grueso',unit:'m2'})]),/Ya existe o se repite/);
 assert.equal(repeated.batches.length,0);
 const different=fixture({lines:[{id:oldLineId,description:'Revoque grueso',unit:'m³'}]});
 assert.equal((await different.runner.run([proposed()])).created,1);
});

test('local permissions and draft status are checked before validation and before writing',async()=>{
 for(const apply of [s=>s.remoteProject={},s=>s.modal={},s=>s.pageDirty=true,s=>s.navigating=true,s=>s.projects[0].read_only=true,s=>s.estimates[0].issued=true,s=>s.projects=[]]){
  const f=fixture();apply(f.state);await assert.rejects(f.runner.run([proposed()]));assert.equal(f.calls.length,0);
 }
 const f=fixture();f.hooks.context=async()=>{f.state.estimates[0].issued=true;return {currency:'ARS',lines:[]};};
 await assert.rejects(f.runner.run([proposed()]),/elaboración/);assert.equal(f.batches.length,0);
});

test('cancellation and navigation during validation leave the database untouched',async()=>{
 const f=fixture(),context=deferred();f.hooks.context=()=>context.promise;
 const pending=f.runner.run([proposed()],{onProgress:f.progress});
 assert.equal(f.runner.cancel(),true);context.resolve({currency:'ARS',lines:[]});
 const result=await pending;assert.equal(result.committed,false);assert.equal(result.cancelled,true);assert.equal(result.created,0);assert.equal(result.pending,1);assert.equal(f.batches.length,0);
 const moved=fixture();moved.hooks.context=async()=>{moved.state.view='management';return {currency:'ARS',lines:[]};};
 assert.equal((await moved.runner.run([proposed()])).committed,false);assert.equal(moved.batches.length,0);
 const lastMoment=fixture();const stopped=await lastMoment.runner.run([proposed()],{onProgress:event=>{if(event.phase==='saving')lastMoment.runner.cancel();}});
 assert.equal(stopped.committed,false);assert.equal(lastMoment.batches.length,0);
});

test('changed approved data or currency cannot be saved after asynchronous validation',async()=>{
 const f=fixture(),rows=[proposed()];
 await assert.rejects(f.runner.run(rows,{onProgress:event=>{if(event.phase==='saving')rows[0].unit_price='999';}}),/cambiaron durante la validación/);
 assert.equal(f.batches.length,0);
 const changed=fixture();changed.hooks.context=async()=>{changed.state.projects[0].currency='USD';changed.state.estimates[0].currency='USD';return {currency:'USD',lines:[]};};
 await assert.rejects(changed.runner.run([proposed()]),/Cambió la moneda/);assert.equal(changed.batches.length,0);
});

test('cancellation cannot claim to abort an in-flight write, and an approval is single-use',async()=>{
 const f=fixture(),entered=deferred(),write=deferred(),rows=[proposed()];
 f.hooks.write=async()=>{entered.resolve();return write.promise;};
 const pending=f.runner.run(rows);await entered.promise;
 assert.equal(f.runner.cancel(),false);await assert.rejects(f.runner.run([proposed()]),/en curso/);
 write.resolve({created:1,updated:0,deleted:0});const result=await pending;
 assert.equal(result.committed,true);assert.equal(result.created,1);
 await assert.rejects(f.runner.run(rows),/ya fue utilizada/);assert.equal(f.batches.length,1);
});

test('a refresh failure after commit reports saved data and never repeats the write',async()=>{
 const f=fixture();f.hooks.refresh=async()=>{throw new Error('read failed');};
 const result=await f.runner.run([proposed()],{onProgress:f.progress});
 assert.equal(result.committed,true);assert.equal(result.created,1);assert.match(result.refreshError,/read failed/);assert.equal(f.batches.length,1);
 assert.match(f.events.at(-1).message,/se guardaron.*no se pudo actualizar/i);
});

test('a write rejection has an uncertain-commit message and no automatic or repeated write',async()=>{
 const f=fixture(),rows=[proposed()];f.hooks.write=async()=>{throw new Error('IPC interrupted');};
 await assert.rejects(f.runner.run(rows),error=>error.mayHaveCommitted===true&&/No se pudo confirmar el guardado/.test(error.message));
 assert.equal(f.batches.length,1);assert.equal(f.loads.length,0);
 await assert.rejects(f.runner.run(rows),/ya fue utilizada/);assert.equal(f.batches.length,1);
});

test('navigation during commit preserves the result without reopening the previous budget',async()=>{
 const f=fixture(),entered=deferred(),write=deferred();f.hooks.write=async()=>{entered.resolve();return write.promise;};
 const pending=f.runner.run([proposed()],{onProgress:f.progress});await entered.promise;
 f.state.projectId='30000000-0000-4000-8000-000000000099';f.state.estimateId=null;f.state.view='management';
 write.resolve({updated:0,created:1,deleted:0,composed:0,moved_sections:0});const result=await pending;
 assert.equal(result.committed,true);assert.equal(result.created,1);assert.deepEqual(f.loads,[]);
 assert.equal(f.state.projectId,'30000000-0000-4000-8000-000000000099');assert.match(f.events.at(-1).message,/presupuesto de origen/);
});
