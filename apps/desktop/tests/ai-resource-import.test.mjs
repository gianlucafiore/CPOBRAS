import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAiResourceProposals,reviewAiResourceRows} from '../src/services/ai-resource-import.js';

const resource=(overrides={})=>({description:'Cemento bolsa 50 kg',kind:'MAT',unit:'bolsa',...overrides});
const response=rows=>JSON.stringify({answer:'Revisá antes de importar',resource_proposals:rows});

test('AI resource proposals are unselected local previews with canonical resource types',()=>{
 const kinds=[['MAT','material'],['M.O.','labor'],['eq','equipment'],['SUB','subcontract']];
 const rows=parseAiResourceProposals('```json\n'+response(kinds.map(([kind],index)=>resource({description:'Insumo '+index,kind})))+'\n```');
 assert.equal(rows.length,4);
 assert.deepEqual(rows.map(row=>row.kind),kinds.map(([,kind])=>kind));
 assert.deepEqual(rows.map(row=>row.row_number),[1,2,3,4]);
 for(const row of rows){
  assert.equal(row.code,'');assert.equal(row.price,null);assert.equal(row.selected,false);
  assert.deepEqual(row.errors,[]);assert.deepEqual(row.warnings,[]);
  assert.deepEqual(Object.keys(row).sort(),['row_number','code','description','kind','unit','price','errors','warnings','selected'].sort());
 }
});

test('AI prices, codes and IDs are always discarded, including an explicit zero or existing ID',()=>{
 const rows=parseAiResourceProposals(response([
  resource({price:'9007199254740993.01',code:'USER-1',id:'existing-id'}),
  resource({description:'Arena',unit:'m³',price:0,resource_id:'native-id'}),
  resource({description:'Piedra',unit:'m³',price:{amount:100,currency:'ARS'},resourceId:'other-id'}),
  resource({description:'Cal',unit:'kg',price:null,code:'',id:null}),
 ]));
 for(const row of rows){assert.equal(row.price,null);assert.equal(row.code,'');assert.equal(row.selected,false);assert.equal('id' in row,false);}
 assert.equal(rows[0].warnings.length,3);
 assert.match(rows[0].warnings.join(' '),/precio.*código.*identificador/i);
 assert.match(rows[1].warnings.join(' '),/precio/i);
 assert.match(rows[2].warnings.join(' '),/precio/i);
 assert.deepEqual(rows[3].warnings,[]);
});

test('AI imports detect existing identities regardless of existing codes and batch duplicates',()=>{
 const existing=[{id:'do-not-update',code:'MAT-1',description:'Cemento bolsa 50 kg',kind:'material',unit:'bolsa',price:'100'}];
 const rows=parseAiResourceProposals(response([
  resource({description:'  CEMENTO BOLSA 50 KG ',unit:' BOLSA ',code:'invented-code'}),
  resource({description:'Arena',unit:'m³'}),
  resource({description:'arena',unit:'m³',kind:'material',code:'another-code'}),
  resource({description:'Arena',unit:'kg'}),
 ]),existing);
 assert.match(rows[0].errors.join(' '),/ya existe o está repetido/);
 assert.deepEqual(rows[1].errors,[]);
 assert.match(rows[2].errors.join(' '),/ya existe o está repetido/);
 assert.deepEqual(rows[3].errors,[]);
 assert.equal(existing[0].price,'100');assert.equal(existing[0].code,'MAT-1');
});

test('missing or unknown fields remain editable errors without invented descriptions, types or units',()=>{
 const rows=parseAiResourceProposals(response([
  {description:null,kind:null,unit:null},
  resource({kind:'desconocido',unit:''}),
  resource({description:'x'.repeat(501),unit:'u'.repeat(51)}),
 ]));
 assert.equal(rows.length,3);
 assert.equal(rows[0].description,'');assert.equal(rows[0].kind,'');assert.equal(rows[0].unit,'');assert.equal(rows[0].errors.length,3);
 assert.equal(rows[1].kind,'');assert.equal(rows[1].unit,'');assert.equal(rows[1].errors.length,2);
 assert.equal(rows[2].errors.length,2);
 assert.ok(rows.every(row=>row.selected===false&&row.price===null));
});

test('AI resource response rejects malformed shapes, unknown actions and oversized batches',()=>{
 for(const value of [null,[],{resource_proposals:[]},{resource_proposals:[null]},{resource_proposals:[[]]},{answer:null,resource_proposals:[resource()]},{resource_proposals:[resource({sql:'DELETE FROM resources'})]},{resource_proposals:[resource()],changes:[{id:'existing'}]},{resource_proposals:[resource({unit:{guess:'kg'}})]},{resource_proposals:Array.from({length:61},()=>resource())}]){
  assert.throws(()=>parseAiResourceProposals(JSON.stringify(value)));
 }
 assert.throws(()=>parseAiResourceProposals('No se necesita JSON'),/formato JSON/);
 assert.throws(()=>parseAiResourceProposals(' '.repeat(200_001)),/extensa/);
 assert.equal(parseAiResourceProposals(JSON.stringify({resource_proposals:[resource()]})).length,1);
 assert.equal(parseAiResourceProposals(response(Array.from({length:60},(_,index)=>resource({description:'Insumo '+index})))).length,60);
});

test('manual preview edits preserve explicit selection and exact ARS prices without mutating input',()=>{
 const initial=parseAiResourceProposals(response([resource({price:'999',code:'FAKE'}),resource({description:'Arena',unit:'m³'}),resource({description:'Piedra',unit:'m³'})]));
 const edited=initial.map((row,index)=>({...row,selected:index!==2,price:['9.007.199.254.740.993,01','0',''][index],id:'must-not-pass',code:'must-not-pass'}));
 const rows=reviewAiResourceRows(edited);
 assert.deepEqual(rows.map(row=>row.price),['9007199254740993.01','0',null]);
 assert.deepEqual(rows.map(row=>row.selected),[true,true,false]);
 assert.ok(rows.every(row=>row.errors.length===0&&row.code===''&&!('id' in row)));
 assert.deepEqual(rows[0].warnings,initial[0].warnings);
 assert.equal(edited[0].price,'9.007.199.254.740.993,01');assert.equal(edited[0].code,'must-not-pass');
});

test('manual invalid prices are retained for correction and revalidated when fixed',()=>{
 const values=['-1','inventado','79228162514264337593543950336','0.'+'1'.repeat(29)];
 const invalid=reviewAiResourceRows(values.map((price,index)=>({...resource({description:'Insumo '+index}),price,selected:true})));
 assert.deepEqual(invalid.map(row=>row.price),values);
 assert.ok(invalid.every(row=>row.errors.some(error=>/precio/i.test(error))&&row.selected));
 const fixed=reviewAiResourceRows(invalid.map(row=>({...row,price:'1.234,56'})));
 assert.ok(fixed.every(row=>row.price==='1234.56'&&row.errors.length===0&&row.selected));
});

test('revalidation sees catalog changes and selected-only duplicate checks can discard an earlier proposal',()=>{
 assert.deepEqual(reviewAiResourceRows([]),[]);
 const initial=parseAiResourceProposals(response([resource(),resource({description:'cemento bolsa 50 kg'})]));
 assert.match(initial[1].errors.join(' '),/repetido/);
 const selected=reviewAiResourceRows([{...initial[1],selected:true}]);
 assert.deepEqual(selected[0].errors,[]);assert.equal(selected[0].selected,true);
 const catalog=[{code:'NEW-1',description:'cemento bolsa 50 kg',kind:'material',unit:'bolsa'}];
 assert.match(reviewAiResourceRows(selected,catalog)[0].errors.join(' '),/ya existe/);
 const noUnit=reviewAiResourceRows([{...selected[0],unit:'',price:null}]);
 assert.equal(noUnit[0].unit,'');assert.match(noUnit[0].errors.join(' '),/Unidad obligatoria/);
});
