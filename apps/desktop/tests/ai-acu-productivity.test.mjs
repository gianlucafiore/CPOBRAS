import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productivityEditRequest,productivityEditRow} from '../src/services/ai-acu-productivity.js';
import {acuSeed,acuBatch,acuTotals} from '../src/services/ai-acu.js';

const resource={id:'eq-1',code:'EQ-RET',description:'Retroexcavadora x Día',kind:'equipment',unit:'kg',price:'130000'};
const other={id:'mat-1',code:'MAT-1',description:'Arena',kind:'material',unit:'m³',price:'15000'};
const seed=acuSeed({id:'line-1',description:'Excavación para zapatas corridas',unit:'m³',quantity:'15',unit_cost:'130000',analysis_id:'acu-old',expected_recipe:'old-recipe',section_id:'foundations',section:'Fundaciones',components:[{resource_id:resource.id,quantity:'1'},{resource_id:other.id,quantity:'0.1'}],takeoffs:[],formula:null});
const ask='Modificá el rendimiento de la retroexcavadora, es de 40m³ x día de trabajo';

test('natural-language productivity routes exclusively to the selected existing line',()=>{
 assert.deepEqual(productivityEditRequest(ask,seed),{mode:'fill',operation:'productivity',lineIds:[seed.id],brief:ask});
 assert.equal(productivityEditRequest(ask,{...seed,unit:'m²'}),null);
 assert.equal(productivityEditRequest('¿Qué rendimiento tiene la retroexcavadora?',seed),null);
 assert.equal(productivityEditRequest('Modificá el rendimiento a 40 m³ por día',null),null);
 assert.equal(productivityEditRequest('Modificar cantidad total de 40 m³ de excavación',seed),null);
});
test('a labeled daily equipment misclassified as kg is inferred but never silently corrected',()=>{
 const before=structuredClone(seed);
 const row=productivityEditRow(ask,seed,[resource,other]);
 assert.deepEqual(seed,before);
 assert.deepEqual(row.components.map(c=>c.quantity),['0.025','0.1']);
 assert.equal(row.components[0].quantity_unit,'kg');
 assert.equal(row.components[1].resource_id,other.id);
 assert.equal(row.advisories.length,1);
 assert.match(row.advisories[0],/kg/);
 assert.match(row.advisories[0],/0\.025 día por m³/);
 assert.equal(row.missing_resources.length,0);
 assert.equal(acuTotals(row,[resource,other]).errors.length,0);
 row.selected=true;
 const batch=acuBatch({rows:[row],context:{resources:[resource,other],currency:'ARS'},estimate:{id:'budget'},newEstimate:null,batchId:'run',asOf:'2026-11-10'});
 assert.equal(batch.acus.length,1);
 assert.equal(batch.acus[0].components[0].quantity,'0.025');
 assert.equal(batch.acus[0].components[0].expected_resource.unit,'kg');
 assert.equal(batch.acus[0].expected_recipe,'old-recipe');
 assert.equal(batch.acus[0].measurements,null);
 assert.match(batch.acus[0].notes,/Advertencia/);
});
test('correctly labeled day units do not raise a warning',()=>{
 const dayResource={...resource,unit:'día'};
 const row=productivityEditRow(ask,seed,[dayResource,other]);
 assert.equal(row.components[0].quantity,'0.025');
 assert.equal(row.components[0].quantity_unit,'día');
 assert.deepEqual(row.advisories,[]);
});
test('ambiguity cannot alter an unrelated equipment or invent a time conversion',()=>{
 assert.throws(()=>productivityEditRow(ask,seed,[{...resource,description:'Retroexcavadora',unit:'kg'},other]),/referencia temporal/);
 assert.throws(()=>productivityEditRow(ask,seed,[{...resource,id:'different'},other]),/único equipo/);
 assert.throws(()=>productivityEditRow('modificá rendimiento retroexcavadora a 40m² por día',seed,[resource,other]),/unidad/);
});
