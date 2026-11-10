import test from 'node:test';
import assert from 'node:assert/strict';
import {foldCatalogText,indexCatalog,catalogQuery,parseCatalogQuery,buildCatalogContext} from '../src/services/ai-catalog-context.js';

const resource=(id,description,extra={})=>({id,code:'INS-'+id,description,unit:'un',kind:'material',price:'100.00',currency:'ARS',price_source:'catálogo:precio-'+id,effective_date:'2026-11-01',...extra});
const context=(question,resources,extra={})=>JSON.parse(buildCatalogContext({question,resources,currency:'ARS',asOf:'2026-11-10',...extra}));

test('catalog search folds accents and explicit plurals without changing real names or presentations',()=>{
 const rows=[resource('1','Grifería monocomando cocina',{unit:'juego'}),resource('2','Panel sándwich 50 mm',{unit:'m²'}),resource('3','Caño de agua',{unit:'m'})];
 assert.equal(foldCatalogText('GRIFERÍA · m²'),'griferia m2');
 assert.deepEqual(context('¿Qué griferías tengo y cuánto cuestan?',rows).matches.map(row=>row.id),['1']);
 assert.deepEqual(context('Precios de paneles',rows).matches.map(row=>row.id),['2']);
 assert.equal(context('griferias',rows).matches[0].description,'Grifería monocomando cocina');
 assert.equal(context('paneles',rows).matches[0].unit,'m²');
 assert.equal(indexCatalog(rows)[0].resource,rows[0]);
 assert.equal(rows[0].description,'Grifería monocomando cocina');
});

test('sanitary domain candidates are related evidence, separate from literal matches',()=>{
 const rows=[resource('1','Artefacto sanitario genérico'),resource('2','Inodoro corto'),resource('3','Bidé tres agujeros'),resource('4','Lavatorio de apoyo'),resource('5','Grifería monocomando'),resource('6','Bañera'),resource('7','Ducha'),resource('8','Bacha'),resource('9','Cisterna'),resource('10','Pileta'),resource('11','Cemento')];
 const result=context('Mostrame los precios de los insumos sanitarios',rows);
 assert.deepEqual(result.matches.map(row=>row.id),['1']);
 assert.deepEqual(result.related.map(row=>row.id),['2','3','4','5','6','7','8','9','10']);
 assert.ok(result.related.every(row=>row.matched_by==='sanitary_domain'));
 assert.deepEqual(result.query.domains,['sanitary']);
 assert.equal(result.counts.matched,1);assert.equal(result.counts.related,9);assert.equal(result.counts.total,11);
 assert.ok(!result.matches.some(row=>row.description==='Cemento'));
 assert.match(result.evidence_rules.join(' '),/nunca sustitutos confirmados/);
 const singular=context('Instalación sanitaria',rows);
 assert.deepEqual(singular.related.map(row=>row.id),result.related.map(row=>row.id));
});

test('only recent user context expands a follow-up; assistant suggestions never invent search evidence',()=>{
 const resources=[resource('1','Inodoro'),resource('2','Cemento'),resource('3','Arena')];
 const messages=[{role:'user',content:'Necesito sanitarios para el baño.'},{role:'assistant',content:'Comprá cemento y arena inventados.'}];
 const query=catalogQuery('¿Y cuánto cuestan?',messages);
 assert.equal(query.history_used,true);assert.deepEqual(query.domains,['sanitary']);
 assert.ok(!query.terms.includes('cemento'));assert.ok(!query.terms.includes('arena'));
 const result=context('¿Y cuánto cuestan?',resources,{messages});
 assert.deepEqual(result.related.map(row=>row.id),['1']);assert.equal(result.matches.length,0);
 const old=[{role:'user',content:'Necesito sanitarios'},...Array.from({length:8},()=>({role:'assistant',content:'Tema posterior'}))];
 assert.deepEqual(catalogQuery('Precio del cemento',old).domains,[]);
 assert.deepEqual(context('Precio del cemento',resources,{messages:old}).matches.map(row=>row.id),['2']);
});

test('codes match exactly with case and punctuation, without confusing prefixes or nearby codes',()=>{
 const rows=[resource('1','Producto A',{code:'INS-01'}),resource('2','Producto B',{code:'INS-010'}),resource('3','Producto C',{code:'INS01'}),resource('4','Producto D',{code:'1'}),resource('5','Producto E',{code:'CAL-APAGADA'})];
 const result=context('¿Qué precio tiene ins-01?',rows);
 assert.deepEqual(result.matches.map(row=>row.id),['1']);assert.equal(result.matches[0].matched_by,'exact_code');
 assert.deepEqual(context('El código 1',rows).matches.map(row=>row.id),['4']);
 assert.deepEqual(context('Precio de CAL-APAGADA',rows).matches.map(row=>row.id),['5']);
 assert.deepEqual(context('Código INS01',rows).matches.map(row=>row.id),['3']);
 assert.equal(context('INS-0100',rows).matches.length,0);
});

test('exact prices, zero, missing values and different currencies remain distinct without conversion',()=>{
 const rows=[resource('1','Inodoro',{price:'9007199254740993.01'}),resource('2','Lavatorio',{price:'0'}),resource('3','Bacha',{price:null}),resource('4','Ducha',{price:'20',currency:'USD'}),resource('5','Bidé',{price:9007199254740992})];
 const result=context('Precios sanitarios',rows);
 assert.equal(result.counts.priced,3);assert.equal(result.counts.missing_price,2);
 assert.equal(result.counts.related_priced,3);assert.equal(result.counts.related_missing_price,2);
 assert.equal(result.related.find(row=>row.id==='1').price,'9007199254740993.01');
 assert.equal(result.related.find(row=>row.id==='2').price,'0');
 assert.equal(result.related.find(row=>row.id==='3').price,null);
 assert.equal(result.related.find(row=>row.id==='4').currency,'USD');assert.equal(result.related.find(row=>row.id==='4').price,'20');
 assert.equal(result.related.find(row=>row.id==='5').price,null);
 assert.equal(result.related[0].effective_date,'2026-11-01');assert.equal(result.related[0].price_source,'catálogo:precio-1');
 assert.equal(result.access,'read_only');assert.equal(result.as_of,'2026-11-10');
});

test('the 80-result limit preserves full counts and marks partial evidence',()=>{
 const rows=Array.from({length:105},(_,index)=>resource(String(index),'Inodoro modelo '+index,{price:index%2?'20':null}));
 const serialized=buildCatalogContext({question:'Precio inodoros',resources:rows,currency:'ARS'}),result=JSON.parse(serialized);
 assert.equal(result.matches.length,80);assert.equal(result.related.length,0);
 assert.equal(result.counts.total,105);assert.equal(result.counts.matched,105);assert.equal(result.counts.returned,80);
 assert.equal(result.counts.matched_priced,52);assert.equal(result.counts.matched_missing_price,53);
 assert.equal(result.truncated,true);assert.equal(result.limits.result_limit_reached,true);
 assert.ok(new TextEncoder().encode(serialized).length<=24000);
 assert.match(result.evidence_rules.join(' '),/no afirmar que un insumo no existe/);
});

test('the byte budget omits whole records without trimming descriptions, units or exact prices',()=>{
 const rows=Array.from({length:70},(_,index)=>resource(String(index),'Inodoro '+('🧱'.repeat(300))+index,{unit:'Presentación original',price:'9007199254740993.01',price_source:'Fuente real '.repeat(30)}));
 const serialized=buildCatalogContext({question:'inodoro',resources:rows,currency:'ARS'}),result=JSON.parse(serialized);
 assert.ok(new TextEncoder().encode(serialized).length<=24000);
 assert.ok(result.matches.length<70);assert.equal(result.truncated,true);assert.equal(result.limits.byte_limit_reached,true);
 assert.equal(result.counts.matched,70);
 for(const row of result.matches){
  assert.equal(row.description,rows.find(original=>original.id===row.id).description);
  assert.equal(row.unit,'Presentación original');assert.equal(row.price,'9007199254740993.01');assert.ok(!row.description.includes('\uFFFD'));
 }
});

test('unknown queries invent neither catalog records nor equivalences and generic listings are marked as samples',()=>{
 const rows=[resource('1','Cemento Portland bolsa 25kg')];
 const result=context('Precio del inodoro inexistente',rows);
 assert.equal(result.matches.length,0);assert.equal(result.related.length,0);assert.equal(result.counts.total,1);
 assert.equal(result.truncated,false);assert.match(result.evidence_rules.join(' '),/tampoco prueba inexistencia/);
 const generic=context('¿Qué insumos tengo?',rows);
 assert.equal(generic.matches[0].matched_by,'catalog_sample');
 assert.equal(generic.matches[0].description,'Cemento Portland bolsa 25kg');
 assert.ok(!('unit_price' in generic.matches[0]));
 const empty=context('sanitarios',[]);
 assert.equal(empty.counts.total,0);assert.deepEqual(empty.matches,[]);assert.deepEqual(empty.related,[]);
});

test('bounded query metadata cannot exceed the context budget or import actions from records',()=>{
 const malicious=resource('1','Inodoro',{execute:'delete',sql:'DROP TABLE resources',password:'SECRET'});
 const question=Array.from({length:100},(_,index)=>'TERM'+index+'-'+'A'.repeat(100)).join(' ');
 const serialized=buildCatalogContext({question,resources:[malicious],messages:[{role:'assistant',content:'sanitarios'}],currency:'ARS'});
 assert.ok(new TextEncoder().encode(serialized).length<=24000);
 assert.equal(JSON.parse(serialized).truncated,true);
 assert.ok(!serialized.includes('DROP TABLE'));assert.ok(!serialized.includes('SECRET'));
 assert.equal(catalogQuery('inodoro',[{role:'assistant',content:'sanitarios'}]).domains.length,0);
 assert.throws(()=>indexCatalog({}),/lista/);
});

test('catalog refinement accepts only bounded read-only search fields and preserves literal codes',()=>{
 const query=parseCatalogQuery(JSON.stringify({answer:'Busco los recursos reales.',catalog_query:{terms:[' Perfil metálico ','Griferías'],codes:['INS-01','1']}}));
 assert.equal(query,'Perfil metálico; Griferías; código INS-01; código 1');
 const rows=[resource('1','Sin coincidencia de descripción',{code:'INS-01'}),resource('2','Sin coincidencia de descripción',{code:'1'}),resource('3','Grifería monocomando')];
 const result=context(query,rows);
 assert.deepEqual(new Set(result.matches.map(row=>row.id)),new Set(['1','2','3']));
 assert.ok(result.matches.slice(0,2).every(row=>row.matched_by==='exact_code'));
 assert.equal(parseCatalogQuery('```json\n'+JSON.stringify({catalog_query:{query:'Inodoros blancos y bidets'}})+'\n```'),'Inodoros blancos y bidets');
 assert.equal(parseCatalogQuery(JSON.stringify({catalog_query:{terms:['arena','arena'],codes:[]}})),'arena');
 assert.equal(parseCatalogQuery(JSON.stringify({catalog_query:{terms:['a'.repeat(80)],codes:['C'.repeat(100)]}})),'a'.repeat(80)+'; código '+'C'.repeat(100));
 assert.equal(parseCatalogQuery(JSON.stringify({catalog_query:{query:'a'.repeat(500)}})),'a'.repeat(500));
});

test('ordinary chat, markdown and JSON without an explicit catalog request never trigger refinement',()=>{
 for(const answer of ['El cemento tiene precio cero.','**Recursos reales**\n- Inodoro: sin precio','La palabra catalog_query pertenece al formato interno.',JSON.stringify({answer:'Sin búsqueda',proposal_lines:[]}),JSON.stringify({answer:'Respuesta regular de partidas grandes',proposal_lines:Array.from({length:60},()=>({description:'x'.repeat(600)}))}),JSON.stringify({query:'campo no reservado'}),'x'.repeat(40_000),'null','[]']){
  assert.equal(parseCatalogQuery(answer),null);
 }
 assert.equal(parseCatalogQuery(null),null);
 assert.throws(()=>parseCatalogQuery('{"catalog_query":'),/incompleta|formato/);
});

test('malformed or command-bearing refinements cannot become searches or arbitrary tool calls',()=>{
 const bad=[
  null,[],{},'arena',{terms:'arena'},{codes:'INS-01'},{terms:['']},{terms:[null]},{terms:[15]},
  {terms:Array(11).fill('arena')},{codes:Array(11).fill('INS-01')},{terms:['a'.repeat(81)]},{codes:['C'.repeat(101)]},
  {query:''},{query:'a'.repeat(501)},{query:'arena',terms:[]},{query:'arena',codes:[]},
  {terms:['arena'],sql:'SELECT * FROM resources'},{terms:['arena'],execute:'delete'},
  {query:'DELETE FROM resources'},{query:'SELECT price FROM resources'},
  {terms:['DROP TABLE resources']},{codes:['PRAGMA table_info(resources)']},{terms:['arena\u0000cemento']},
 ];
 for(const catalog_query of bad)assert.throws(()=>parseCatalogQuery(JSON.stringify({answer:'Búsqueda',catalog_query})));
 assert.throws(()=>parseCatalogQuery(JSON.stringify({catalog_query:{terms:['arena']},tools:[{name:'delete'}]})),/solo admite/);
 assert.throws(()=>parseCatalogQuery(JSON.stringify({catalog_query:{terms:['arena']},answer:null})),/solo admite/);
 assert.throws(()=>parseCatalogQuery(JSON.stringify({catalog_query:{query:'🧱'.repeat(9000)}})),/32 KB/);
});

test('bathroom phrases expand sanitary candidates while literal resource names remain direct matches',()=>{
 const rows=[resource('1','Baño'),resource('2','Inodoro'),resource('3','Bacha'),resource('4','Arena')];
 for(const question of ['Artefactos de baño','Insumos para un baño','Grifería para baño','baño']){
  const result=context(question,rows);
  assert.deepEqual(result.query.domains,['sanitary']);
  assert.ok(result.matches.some(row=>row.id==='1'));
  assert.deepEqual(result.related.map(row=>row.id),['2','3']);
 }
 const named=context('Precio del material de nombre Baño',rows);
 assert.deepEqual(named.query.domains,[]);assert.deepEqual(named.matches.map(row=>row.id),['1']);assert.deepEqual(named.related,[]);
 assert.deepEqual(catalogQuery('¿Y los precios?',[{role:'user',content:'Necesito artefactos de baño.'}]).domains,['sanitary']);
 assert.deepEqual(catalogQuery('Precio arena',[{role:'assistant',content:'Artefactos de baño'}]).domains,[]);
});

test('natural-language names find close catalog candidates without treating them as equivalent',()=>{
 const rows=[
  resource('1','Adhesivo cementicio para porcelanato',{unit:'bolsa',price:'250'}),
  resource('2','Cemento Portland',{unit:'kg'}),
  resource('3','Caño de polipropileno',{unit:'m'}),
  resource('4','Ladrillo cerámico hueco 12x18x33',{unit:'un'}),
  resource('5','Ladrillo cerámico hueco 18x18x33',{unit:'un'}),
  resource('6','Mano de obra de colocación de inodoro',{kind:'labor',unit:'un'}),
  resource('7','Inodoro corto blanco',{unit:'un'}),
 ];
 const adhesive=context('¿Tenés pegamento para colocar porcelanato?',rows);
 assert.deepEqual(adhesive.matches.map(row=>row.id),['1']);
 assert.equal(adhesive.matches[0].description,'Adhesivo cementicio para porcelanato');
 const onlySynonym=context('Buscá pegamento',rows);
 assert.deepEqual(onlySynonym.related.map(row=>row.id),['1']);
 assert.equal(onlySynonym.related[0].matched_by,'semantic_related');
 assert.match(onlySynonym.evidence_rules.join(' '),/no equivalencias|nunca sustitutos|Comparar material/);
 const pipes=context('Busco tubería',rows);
 assert.deepEqual(pipes.related.map(row=>row.id),['3']);
 assert.equal(context('Busco caño',rows).matches[0].id,'3');
 const brick=context('Ladrillo hueco de 12 cm',rows);
 assert.deepEqual(brick.matches.slice(0,2).map(row=>row.id),['4','5']);
 const typo=context('Ladrillo ceramico hueco porcelanatto',rows);
 assert.equal(typo.matches[0].description.startsWith('Ladrillo cerámico'),true);
 const labor=context('Precio de la mano de obra de colocación de inodoro',rows);
 assert.equal(labor.matches[0].id,'6');
 const material=context('Precio del material inodoro',rows);
 assert.equal(material.matches[0].id,'7');
 assert.equal(context('Precio de materiales para instalación de inodoro',rows).matches[0].id,'7');
 assert.deepEqual(context('Busco cobre',rows).related,[]);
 assert.deepEqual(context('Busco cobre',rows).matches,[]);
});
