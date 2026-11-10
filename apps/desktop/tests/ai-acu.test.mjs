import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acuSeed,emptyAcu,parseAcuProposals,measurementQuantity,acuTotals,copyAcuExample,acuPromptContext,acuBatch} from '../src/services/ai-acu.js';
const resource={id:'10000000-0000-4000-8000-000000000001',code:'MAT',description:'Mortero',unit:'kg',kind:'material',price:'20',price_source:'catálogo:price-1'};
const seed=acuSeed({id:'10000000-0000-4000-8000-000000000002',description:'Revoque',unit:'m²',quantity:'10',unit_cost:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',takeoffs:[],formula:null,components:[]});
const text=JSON.stringify({acu_proposals:[{line_id:seed.id,components:[{resource_id:resource.id,quantity:'0.25',unit_price:'99999'}],assumptions:['Hipótesis de espesor a revisar'],measurements:[],missing_resources:[]}]});
test('unit prices come from the local catalog, never the model response',()=>{
 const row=parseAcuProposals(text,[seed],[resource])[0];assert.equal(row.selected,false);assert.equal(row.components[0].unit_price,undefined);
 const totals=acuTotals(row,[resource]);assert.equal(totals.unit_cost,'5.00');assert.equal(totals.total,'50.00');
 row.selected=true;const batch=acuBatch({rows:[row],context:{resources:[resource],currency:'ARS'},estimate:{id:'e'},newEstimate:null,batchId:'batch',asOf:'2026-11-10'});
 assert.equal(batch.acus[0].components[0].expected_resource.price,'20');assert.equal(batch.acus[0].expected.quantity,'10');assert.equal(batch.acus[0].measurements,null);
});
test('unknown resources, duplicate IDs and non-positive consumption are rejected',()=>{
 const bad=JSON.parse(text);bad.acu_proposals[0].components[0].resource_id='unknown';assert.throws(()=>parseAcuProposals(JSON.stringify(bad),[seed],[resource]));
 bad.acu_proposals[0].components=[{resource_id:resource.id,quantity:'0'}];assert.throws(()=>parseAcuProposals(JSON.stringify(bad),[seed],[resource]));
 bad.acu_proposals[0].components=[{resource_id:resource.id,quantity:'1'},{resource_id:resource.id,quantity:'1'}];assert.throws(()=>parseAcuProposals(JSON.stringify(bad),[seed],[resource]));
});
test('missing prices and pending recipe data never look like a complete zero-priced ACU',()=>{
 const row=parseAcuProposals(text,[seed],[resource])[0];assert.equal(acuTotals(row,[{...resource,price:null}]).unit_cost,null);
 row.missing_resources=['Falta mano de obra'];assert.equal(acuTotals(row,[resource]).unit_cost,null);
 row.missing_resolved=true;assert.equal(acuTotals(row,[resource]).unit_cost,'5.00');
 assert.equal(acuTotals(emptyAcu(seed),[resource]).unit_cost,null);
});
test('measurement is exact, separate from recipe approval and detects negative net results',()=>{
 const measurements=[{note:'Dos caras',factor:'2',length:'20',width:'1',height:'3',sign:1},{note:'Abertura en ambas caras',factor:'2',length:'2',width:'1',height:'2',sign:-1}];
 assert.equal(measurementQuantity(measurements),'112');
 const row={...parseAcuProposals(text,[seed],[resource])[0],measurements};assert.equal(acuTotals(row,[resource]).quantity,'10');row.apply_measurements=true;assert.equal(acuTotals(row,[resource]).quantity,'112');
 row.measurements=[measurements[1]];assert.ok(acuTotals(row,[resource]).errors.length);
});
test('reference reuse copies consumption and validates units, without copying historical prices',()=>{
 const example={key:'ref',description:'Revoque anterior',unit:'m2',components:[{resource_id:resource.id,quantity:'2',unit_price:'999'}]};
 const row=copyAcuExample(seed,example);assert.equal(acuTotals(row,[resource]).unit_cost,'40');assert.equal(row.components[0].unit_price,undefined);
 assert.throws(()=>copyAcuExample(seed,{...example,unit:'m³'}));
 const context=acuPromptContext([seed],[resource],[example],'Revoque');assert.ok(!context.includes('unit_price'));assert.ok(!context.includes('999'));
});

test('manual consumption with a decimal comma is normalized before IPC',()=>{
 const row=parseAcuProposals(text,[seed],[resource])[0];row.components[0].quantity='0,5';row.selected=true;
 const batch=acuBatch({rows:[row],context:{resources:[resource],currency:'ARS'},estimate:{id:'e'},newEstimate:null,batchId:'b',asOf:'2026-11-10'});
 assert.equal(batch.acus[0].components[0].quantity,'0.5');assert.equal(acuTotals(row,[resource]).unit_cost,'10.0');
});
