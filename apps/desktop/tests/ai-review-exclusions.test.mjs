import {test} from 'node:test';
import assert from 'node:assert/strict';
import {componentKey,missingKey,excludedAcuRows,reviewSelectionState} from '../src/services/ai-review-exclusions.js';
import {acuTotals} from '../src/services/ai-acu.js';
const ids=['a','b'];
const resources=[
 {id:'steel',description:'Perfil metálico',unit:'kg',kind:'material',price:'100'},
 {id:'labor',description:'Operario calificado',unit:'jor',kind:'labor',price:'200'}
];
const seed=(id,description)=>({id,description,unit:'kg',quantity:'20',is_new:true,section:'Montaje',expected_resources:[
 {id:'req-1',description:'Perfil metálico',kind:'material',unit:'kg'},
 {id:'req-2',description:'Operario calificado',kind:'labor',unit:'jor'}
]});
const row=id=>({id,seed:seed(id,id),components:[{resource_id:'steel',quantity:'1',quantity_unit:'kg'},
 {resource_id:'labor',quantity:'0.02',quantity_unit:'jor'}],measurements:[],assumptions:[],missing_resources:[],missing_resource_drafts:[],requirement_coverage:[
 {requirement_id:'req-1',resource_id:'steel'}, {requirement_id:'req-2',resource_id:'labor'}
 ],missing_resolved:false});
test('X on a part excludes it from the actual batch while undo restores it',()=>{
 const excludedLines=new Set(),inputs=new Map(),original=[row('a'),row('b')];
 reviewSelectionState(excludedLines,inputs,'a',null,true);
 assert.deepEqual(excludedAcuRows(original,excludedLines,inputs).map(r=>r.id),['b']);
 reviewSelectionState(excludedLines,inputs,'a',null,false);
 assert.deepEqual(excludedAcuRows(original,excludedLines,inputs).map(r=>r.id),['a','b']);
});
test('X on an assigned input removes its real consumption and linked requirement, not the library row',()=>{
 const excludedLines=new Set(),inputs=new Map(),original=[row('a')];
 reviewSelectionState(excludedLines,inputs,'a',componentKey('labor'),true);
 let [effective]=excludedAcuRows(original,excludedLines,inputs);
 assert.deepEqual(effective.components.map(c=>c.resource_id),['steel']);
 assert.deepEqual(effective.seed.expected_resources.map(req=>req.id),['req-1']);
 assert.equal(acuTotals(effective,resources).errors.length,0);
 assert.equal(original[0].components.length,2);
 assert.equal(resources.length,2);
 reviewSelectionState(excludedLines,inputs,'a',componentKey('labor'),false);
 [effective]=excludedAcuRows(original,excludedLines,inputs);
 assert.deepEqual(effective.components.map(c=>c.resource_id),['steel','labor']);
});
test('X on an unresolved requirement excludes only that requirement in its own partida',()=>{
 const original=[row('a'),row('b')];
 for(const r of original){r.components=r.components.filter(c=>c.resource_id==='steel');
 r.requirement_coverage=r.requirement_coverage.filter(c=>c.resource_id==='steel');
 r.missing_resources=['Operario calificado: falta seleccionar un insumo compatible'];
 r.missing_resource_drafts=[{description:'Operario calificado',kind:'labor',unit:'jor',action:'specify'}];}
 const excludes=new Map(),lines=new Set();
 reviewSelectionState(lines,excludes,'a',missingKey('Operario calificado'),true);
 const [a,b]=excludedAcuRows(original,lines,excludes);
 assert.equal(a.seed.expected_resources.length,1);
 assert.equal(a.missing_resource_drafts.length,0);
 assert.equal(a.missing_resources.length,0);
 assert.equal(b.seed.expected_resources.length,2);
 assert.equal(b.missing_resource_drafts.length,1);
});
test('arbitrary exclusion keys are rejected',()=>{
 assert.throws(()=>reviewSelectionState(new Set(),new Map(),'a','bad-key',true),/no es válido/);
});
