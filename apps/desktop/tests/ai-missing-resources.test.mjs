import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missingResourceItems,collectMissingResourceItems} from '../src/services/ai-missing-resources.js';
import {acuSeed,parseAcuProposals,acuTotals} from '../src/services/ai-acu.js';

const resource={id:'10000000-0000-4000-8000-000000000001',description:'Caño estructural',code:'MAT',unit:'kg',kind:'material',price:'2500'};
const seed=(id,description)=>acuSeed({id,description,unit:'kg',quantity:'900',unit_cost:'0',section:'Estructura',components:[]});
const a=seed('10000000-0000-4000-8000-000000000002','Estructura metálica'),b=seed('10000000-0000-4000-8000-000000000003','Casco de pileta');
const missing=[
 {description:'Tablillas de deck plástico',unit:'m²',kind:'material',action:'create',reason:'No se encontró equivalencia en catálogo'},
 {description:'Perfil W, sección a definir',unit:'kg',kind:'material',action:'specify',reason:'Falta sección de perfil'}
];
function proposals(sourceQuantity='0'){
 return JSON.stringify({acu_proposals:[
  {line_id:a.id,components:[{resource_id:resource.id,quantity:'1.5',quantity_unit:'kg',source_quantity:sourceQuantity,source_unit:'kg'}],missing_resources:missing},
  {line_id:b.id,components:[],missing_resources:[missing[0]]}
 ]});
}

test('missing resources are distinct typed drafts and deduplicated across partidas',()=>{
 const rows=parseAcuProposals(proposals(),[a,b],[resource]);
 assert.equal(rows.length,2);
 assert.equal(rows[0].missing_resource_drafts.length,2);
 const items=collectMissingResourceItems(rows);
 assert.equal(items.length,2);
 assert.deepEqual(items[0].lines,['Estructura metálica','Casco de pileta']);
 assert.equal(items[0].description,'Tablillas de deck plástico');
 assert.equal(items[0].unit,'m²');
 assert.equal(items[0].kind,'material');
 assert.equal(items[0].action,'create');
 assert.equal(items[1].action,'specify');
 assert.ok(acuTotals(rows[0],[resource]).errors.includes('Hay faltantes indicados por IA pendientes de resolver'));
});

test('optional source quantity 0 is not a batch-stopping error; actual quantity remains positive',()=>{
 for(const zero of ['0','0.0','0.00',0]){
  const rows=parseAcuProposals(proposals(zero),[a,b],[resource]);
  assert.equal(rows[0].components[0].quantity,'1.5');
  assert.equal(rows[0].components[0].source_quantity,undefined);
  assert.equal(rows[0].components[0].source_unit,undefined);
  assert.match(rows[0].components[0].consumption_support,/Origen cero no válido/);
 }
 const invalid=JSON.parse(proposals());
 invalid.acu_proposals[0].components[0].quantity='0';
 assert.throws(()=>parseAcuProposals(JSON.stringify(invalid),[a,b],[resource]),/consumos deben ser mayores/);
});

test('unstructured descriptions are not interpreted as ready-to-create catalog items',()=>{
 assert.deepEqual(missingResourceItems(['Faltan conexiones metálicas, perfiles W y tornillos']),[]);
 const list=missingResourceItems([
  {description:'Tornillos a definir',kind:'material',unit:'',action:'specify'},
  {description:'',kind:'material',unit:'un',action:'create'},
  {name:'Tablillas de deck',unit:'m²',kind:'otro',action:'create'}
 ]);
 assert.equal(list.length,2);
 assert.equal(list[0].action,'specify');
 assert.equal(list[1].kind,'');
 assert.equal(list[1].action,'create');
});
