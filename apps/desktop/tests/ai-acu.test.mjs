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
test('non-positive consumption, malformed decimals and invalid target IDs are still rejected',()=>{
 for(const quantity of ['0','-1','1.234,50',0.25]){
  const bad=JSON.parse(text);bad.acu_proposals[0].components[0].quantity=quantity;
  assert.throws(()=>parseAcuProposals(JSON.stringify(bad),[seed],[resource]));
 }
 const bad=JSON.parse(text);bad.acu_proposals[0].line_id='unknown-target';
 assert.throws(()=>parseAcuProposals(JSON.stringify(bad),[seed],[resource]),/partida ajena/);
 bad.acu_proposals=[JSON.parse(text).acu_proposals[0],JSON.parse(text).acu_proposals[0]];
 assert.throws(()=>parseAcuProposals(JSON.stringify(bad),[seed],[resource]),/partida ajena.*repetida/);
});
test('unknown and repeated resources preserve the preview without making invalid recipes saveable',()=>{
 const unknownSeed={...seed,id:'10000000-0000-4000-8000-000000000003',description:'Revoque a completar'};
 const repeatedSeed={...seed,id:'10000000-0000-4000-8000-000000000004',description:'Revoque con repetidos'};
 const proposals=[
  JSON.parse(text).acu_proposals[0],
  {line_id:unknownSeed.id,components:[{resource_id:'unknown',description:'Cal hidratada',quantity:'0.75'}]},
  {line_id:repeatedSeed.id,components:[{resource_id:resource.id,quantity:'0.25'},{resource_id:resource.id,quantity:'0.5'}]}
 ];
 const rows=parseAcuProposals(JSON.stringify({acu_proposals:proposals}),[seed,unknownSeed,repeatedSeed],[resource]);
 assert.equal(rows.length,3);assert.ok(rows.every(row=>!row.selected));
 assert.equal(acuTotals(rows[0],[resource]).unit_cost,'5.00');
 assert.deepEqual(rows[1].components,[{resource_id:'',quantity:'0.75',description:'Cal hidratada'}]);
 assert.ok(rows[1].assumptions.some(note=>note.includes('Elegí un insumo real')));
 assert.equal(acuTotals(rows[1],[resource]).unit_cost,null);
 assert.ok(acuTotals(rows[1],[resource]).errors.includes('Hay un insumo no disponible'));
 assert.deepEqual(rows[2].components,[{resource_id:resource.id,quantity:'0.25'},{resource_id:resource.id,quantity:'0.5'}]);
 assert.ok(rows[2].assumptions.some(note=>note.includes('sin sumarlos')));
 assert.equal(acuTotals(rows[2],[resource]).unit_cost,null);
 assert.ok(acuTotals(rows[2],[resource]).errors.some(error=>error.startsWith('Insumo repetido:')));
 const args={rows,context:{resources:[resource],currency:'ARS'},estimate:{id:'e'},newEstimate:null,batchId:'batch',asOf:'2026-11-10'};
 for(const row of rows.slice(1)){
  row.selected=true;assert.throws(()=>acuBatch(args),/insumo no disponible|Insumo repetido/);row.selected=false;
 }
 rows[0].selected=true;
 const batch=acuBatch(args);assert.equal(batch.acus.length,1);assert.equal(batch.acus[0].line_id,seed.id);assert.equal(batch.creates.length,0);
 rows[1].selected=true;assert.throws(()=>acuBatch(args),/insumo no disponible/);
 rows[1].components[0].resource_id=resource.id;
 assert.equal(acuBatch(args).acus.length,2);
});
test('unknown resource hints use description, code or raw ID and are bounded for manual matching',()=>{
 const value=JSON.parse(text);
 value.acu_proposals[0].components=[
  {resource_id:'unknown-1',resource_code:'CAL-01',description:' Cal hidratada ',quantity:'1'},
  {resource_id:'unknown-2',resource_code:'ARENA-01',quantity:'2'},
  {resource_id:'unknown-3',quantity:'3'},
  {resource_id:'unknown-4',description:'x'.repeat(800),quantity:'4'}
 ];
 const row=parseAcuProposals(JSON.stringify(value),[seed],[resource])[0];
 assert.deepEqual(row.components.map(component=>component.resource_id),['','','','']);
 assert.deepEqual(row.components.map(component=>component.description),['Cal hidratada','ARENA-01','unknown-3','x'.repeat(500)]);
 assert.equal(acuTotals(row,[resource]).unit_cost,null);
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


test('provider notes can be text or descriptive objects without rejecting valid recipes',()=>{
 const value=JSON.parse(text);
 value.acu_proposals[0].assumptions='Rendimiento estimado con jornada de 8 horas.\nVerificar espesor de revoque.';
 value.acu_proposals[0].missing_resources={mano_de_obra:{descripcion:'Oficial albañil',detalle:'Falta definir jornal'},mortero:{descripcion:'Cal',cantidad:null}};
 const row=parseAcuProposals(JSON.stringify(value),[seed],[resource])[0];
 assert.ok(row.assumptions.some(note=>note.includes('jornada de 8 horas')));
 assert.ok(row.missing_resources.some(note=>note.includes('Oficial albañil')));
 assert.ok(row.missing_resources.some(note=>note.includes('Falta definir jornal')));
 assert.ok(row.missing_resources.some(note=>note.includes('cantidad: sin detalle')));
 assert.ok(acuTotals(row,[resource]).errors.some(error=>error.includes('faltantes')));
 assert.equal(row.selected,false);
});
test('mixed note arrays retain descriptions and pending data as plain text',()=>{
 const value=JSON.parse(text);
 value.acu_proposals[0].assumptions=[{origen:'Receta de referencia',jornada_horas:8},'Verificar consumo',{desperdicio_incluido:false}];
 value.acu_proposals[0].missing_resources=['Falta arena',{material:{nombre:'Cemento',nota:'Sin precio'}},null,{cemento:{}}];
 const row=parseAcuProposals(JSON.stringify(value),[seed],[resource])[0];
 assert.ok(row.assumptions.some(note=>note.includes('jornada_horas: 8')));
 assert.ok(row.assumptions.some(note=>note.includes('desperdicio_incluido: no')));
 assert.ok(row.missing_resources.some(note=>note.includes('Falta arena')));
 assert.ok(row.missing_resources.some(note=>note.includes('Sin precio')));
 assert.ok(row.missing_resources.some(note=>note.includes('sin descripción')));
 assert.ok(row.missing_resources.some(note=>note.includes('cemento: sin detalle')));
 assert.ok(!row.missing_resources.some(note=>note.includes('[object Object]')));
 const markup='<img src=x onerror=alert(1)>';
 value.acu_proposals[0].assumptions=markup;
 assert.ok(parseAcuProposals(JSON.stringify(value),[seed],[resource])[0].assumptions.includes(markup));
});
test('long or numerous notes are bounded without making the proposal or IPC notes invalid',()=>{
 const value=JSON.parse(text),long='Verificar ladrillo y espesor. '.repeat(300);
 value.acu_proposals[0].assumptions=[long,...Array.from({length:50},(_,index)=>'Hipótesis '+index)];
 value.acu_proposals[0].missing_resources=Array.from({length:60},(_,index)=>({material:'Insumo '+index,detalle:'Pendiente de elegir y verificar consumo'}));
 const row=parseAcuProposals(JSON.stringify(value),[seed],[resource])[0],bytes=notes=>new TextEncoder().encode(notes.join('\n')).length;
 assert.ok(bytes(row.assumptions)<4500);
 assert.ok(bytes(row.missing_resources)<=4000);
 assert.ok(row.assumptions.some(note=>note.includes('Notas recortadas')));
 assert.ok(row.missing_resources.some(note=>note.includes('más datos pendientes')));
 assert.equal(acuTotals(row,[resource]).unit_cost,null);
 row.missing_resolved=true;row.selected=true;
 const batch=acuBatch({rows:[row],context:{resources:[resource],currency:'ARS'},estimate:{id:'e'},newEstimate:null,batchId:'batch',asOf:'2026-11-10'});
 assert.ok(new TextEncoder().encode(batch.acus[0].notes).length<=6000);
});
test('UTF-8 limits do not break Unicode and deeply nested pending notes stay pending',()=>{
 const value=JSON.parse(text);
 value.acu_proposals[0].assumptions='🧱'.repeat(3000);
 let nested={descripcion:'Falta precio'};for(let depth=0;depth<20;depth++)nested={detalle:nested};
 value.acu_proposals[0].missing_resources=nested;
 const row=parseAcuProposals(JSON.stringify(value),[seed],[resource])[0];
 assert.ok(!row.assumptions.join('\n').includes('\uFFFD'));
 assert.ok(new TextEncoder().encode(row.assumptions.join('\n')).length<4500);
 assert.ok(row.missing_resources.length>0);
 assert.ok(acuTotals(row,[resource]).errors.length>0);
});
