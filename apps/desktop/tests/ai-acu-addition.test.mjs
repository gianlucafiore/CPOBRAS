import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendRequest,parseAcuAdditions,mergeAcuAddition,additionPreservationErrors} from '../src/services/ai-acu-addition.js';
import {acuSeed,acuTotals,acuBatch} from '../src/services/ai-acu.js';

const resources=[
 {id:'cement',description:'Cemento',unit:'kg',kind:'material',price:'20'},
 {id:'sand',description:'Arena',unit:'m³',kind:'material',price:'100'},
 {id:'pipe',description:'Caño',unit:'m',kind:'material',price:'50'}
];
const seed=acuSeed({id:'line-1',description:'Revoque exterior',unit:'m²',quantity:'100',unit_cost:'2',analysis_id:'acu-1',expected_recipe:'recipe-before',section_id:'section-1',section:'Revoques',components:[{resource_id:'cement',quantity:'0.10'}],takeoffs:[{id:'takeoff-1'}],formula:null});
const component=(id,quantity,quantityUnit,scope='per_unit')=>({resource_id:id,quantity,quantity_unit:quantityUnit,quantity_scope:scope});
function addition(components,{target=seed,brief='',section='Rubro distinto'}={}){
 const response=JSON.stringify({acu_proposals:[{line_id:target.id,components,section,measurements:[],assumptions:[],missing_resources:[]}]});
 return mergeAcuAddition(parseAcuAdditions(response,[target],resources,brief)[0],resources);
}
const batch=row=>acuBatch({rows:[{...row,selected:true}],context:{resources,currency:'ARS'},estimate:{id:'estimate-1'},newEstimate:null,batchId:'batch-1',asOf:'2026-11-09'});

test('append targeting prefers an exact unique longer name and selection only when explicitly referenced',()=>{
 const lines=[{id:'short',description:'Revoque'},{id:'long',description:'Revoque exterior'},{id:'paint',description:'Pintura'}];
 assert.deepEqual(appendRequest('Agregá cemento a la partida Revoque exterior',lines,'paint'),{operation:'append',lineIds:['long']});
 assert.deepEqual(appendRequest('Añadí cal en esta partida seleccionada',lines,'paint'),{operation:'append',lineIds:['paint']});
 assert.deepEqual(appendRequest('Incorporá mano de obra en la partida PINTURA',lines),{operation:'append',lineIds:['paint']});
 assert.deepEqual(appendRequest('Cargá cemento a Revoque exterior',lines),{operation:'append',lineIds:['long']});
 assert.deepEqual(appendRequest('No saques lo existente, agregá cemento a la partida Revoque exterior',lines),{operation:'append',lineIds:['long']});
 for(const brief of ['Agregá caño en la partida Instalaciones','Añadí cemento a la partida Revoque exterior y Pintura','Agregá cal a esta partida seleccionada llamada Otra','Agregá cemento a esta partida seleccionada Revoque exterior']){
  const result=appendRequest(brief,lines,'paint');assert.equal(result.operation,'append');assert.deepEqual(result.lineIds,[]);assert.ok(result.error);
 }
 assert.deepEqual(appendRequest('Agregá cemento en la partida Revoque exterior',[...lines,{id:'duplicate',description:'Revoque exterior'}]).lineIds,[]);
 assert.equal(appendRequest('Agregá una partida de excavación',lines),null);
 assert.equal(appendRequest('No agregues cemento en la partida Pintura',lines),null);
});

test('merging additions preserves existing resources and snapshots and sums matching deltas exactly',()=>{
 const before=structuredClone(seed),row=addition([component('cement','0.20','kg'),component('sand','2','m³')]);
 assert.deepEqual(seed,before);
 assert.equal(row.components[0].resource_id,'cement');assert.equal(row.components[0].quantity,'0.30');
 assert.equal(row.components[1].resource_id,'sand');assert.equal(row.components[1].quantity,'2');
 assert.equal(row.section_id,seed.section_id);assert.equal(row.section_title,seed.section);assert.deepEqual(row.measurements,[]);assert.equal(row.apply_measurements,false);
 const result=batch(row);assert.deepEqual(result.creates,[]);assert.deepEqual(result.deletes,[]);assert.deepEqual(result.updates,[]);
 assert.equal(result.acus[0].expected_recipe,'recipe-before');assert.equal(result.acus[0].expected.quantity,'100');
 assert.deepEqual(result.acus[0].expected_takeoffs,seed.takeoffs);assert.equal(result.acus[0].section_id,'section-1');assert.equal(result.acus[0].measurements,null);
});

test('total quantities are divided by the current line quantity before adding and never treated as per-unit consumption',()=>{
 const total={...component('cement','30','kg','total'),source_quantity:'30',source_unit:'kg'};
 const row=addition([total],{brief:'Agregar 30 kg en total a la partida Revoque exterior'});
 assert.equal(row.components[0].quantity,'0.40');assert.equal(acuTotals(row,resources).unit_cost,'8.00');
 assert.equal(batch(row).acus[0].components[0].quantity,'0.40');
 for(const target of [{...seed,quantity:'0'}]){
  const bad=addition([component('cement','1','kg','total')],{target});
  assert.equal(acuTotals(bad,resources).unit_cost,null);assert.throws(()=>batch(bad));
 }
 const periodic=addition([component('cement','50','kg','total')],{target:{...seed,quantity:'3'}});
 assert.equal(periodic.components[0].quantity,'16.76666666');
 assert.equal(periodic.components[0].source_quantity,'16.76666666');
 assert.ok(periodic.assumptions.some(note=>note.includes('redondeo')));assert.equal(acuTotals(periodic,resources).errors.length,0);
 const mislabeled=addition([component('cement','30','kg','per_unit')],{brief:'Agregar 30 kg en total a la partida'});
 assert.equal(acuTotals(mislabeled,resources).unit_cost,null);assert.throws(()=>batch(mislabeled));
});

test('unknown resources, duplicate additions and incompatible units stay blocked; legacy per-unit additions remain usable',()=>{
 for(const components of [
  [component('unknown','1','kg')],
  [component('cement','1','kg'),component('cement','2','kg')],
  [component('pipe','2','m²')],
  [component('pipe','2','m²','total')],
  []
 ]){
  const row=addition(components);assert.equal(row.components[0].resource_id,'cement');assert.equal(row.components[0].quantity,'0.10');
  assert.equal(acuTotals(row,resources).unit_cost,null);assert.throws(()=>batch(row));
 }
 const legacy=addition([{resource_id:'cement',quantity:'1',quantity_unit:'kg'}]);assert.equal(acuTotals(legacy,resources).errors.length,0);
 assert.deepEqual(additionPreservationErrors(legacy),[]);
 const removed={...legacy,components:legacy.components.filter(component=>component.resource_id!=='cement')};
 assert.ok(additionPreservationErrors(removed).length);
 const reduced={...legacy,components:legacy.components.map(component=>({...component,quantity:'0.01'}))};
 assert.ok(additionPreservationErrors(reduced).length);
 assert.ok(additionPreservationErrors({...legacy,section_id:'another-section'}).length);
 assert.ok(additionPreservationErrors({...legacy,apply_measurements:true}).length);
});
