import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importDecimal,textPriceRows,guessColumns,sourcePrices,localMatches,matchingContext,applyAiMatches,reviewedBatch,parsePlan,changeProposals,rowsFromChanges} from '../src/services/ai-budget-import.js';
const line={id:'10000000-0000-4000-8000-000000000001',description:'Nivelación',unit:'m²',quantity:'300',unit_cost:'0',analysis_id:null,code:'01.01'};
test('numeric Excel cells preserve their decimals; text uses an explicit locale',()=>{
 assert.equal(importDecimal('17555.57','ar',true),'17555.57');
 assert.equal(importDecimal('17.555,57','ar'),'17555.57');
 assert.equal(importDecimal('1.25e-3','decimal',true),'0.00125');
 assert.throws(()=>importDecimal('17.55','ar'));
 assert.throws(()=>importDecimal('-5','decimal'));
 assert.equal(importDecimal(''),null);
});
test('pasted prices create exact matches and never infer missing prices as zero',()=>{
 const raw=textPriceRows('Descripción;Unidad;Precio unitario\nNivelación;m²;17.000,50\nSin dato;m;');
 const rows=sourcePrices(raw,guessColumns(raw),'ar','ARS');
 assert.equal(rows[0].unit_price,'17000.50');assert.match(rows[1].error,/vacío/);
 const matches=localMatches(rows,[line]);assert.equal(matches[0].target,line.id);assert.equal(matches[0].selected,true);
 assert.equal(localMatches(rows,[line,{...line,id:'other'}])[0].selected,false);
});
test('AI may suggest only known correspondence IDs, never replace source prices',()=>{
 const rows=localMatches([{row_id:'r1',description:'Nivelar el terreno',unit:'m²',unit_price:'5.25',error:''}],[line]);
 const context=matchingContext(rows,[line]);
 const matched=applyAiMatches(JSON.stringify({price_matches:[{row_id:'r1',line_id:line.id,unit_price:'999'}]}),rows,context);
 assert.equal(matched[0].unit_price,'5.25');assert.equal(matched[0].selected,false);
 const rejected=applyAiMatches(JSON.stringify({price_matches:[{row_id:'r1',line_id:'foreign'}]}),rows,context);assert.equal(rejected[0].target,'');
});
test('reviewed payloads reject duplicate targets and empty replacement prices',()=>{
 const row={row_id:'1',target:line.id,selected:true,unit_price:'10',description:'Nivelación',unit:'m²',error:''};
 const estimate={id:'e',currency:'ARS'};
 assert.throws(()=>reviewedBatch([row,{...row}],[line],estimate,'b','ARS'),/más de una/);
 assert.throws(()=>reviewedBatch([{...row,unit_price:''}],[line],estimate,'b','ARS'),/vacío/);
 assert.throws(()=>reviewedBatch([row],[line],estimate,'b','USD'),/moneda/);
 const batch=reviewedBatch([row],[line],estimate,'b','ARS');assert.equal(batch.updates[0].expected.quantity,'300');assert.equal(batch.updates[0].unit_price,'10');
});
test('work proposals keep unknown quantities/prices unset until explicit creation review',()=>{
 const rows=parsePlan(JSON.stringify({proposal_lines:[{description:'Replanteo',unit:'gl',quantity:null,unit_price:null,section:'Preliminares'}]}));
 assert.equal(rows[0].quantity,null);assert.equal(rows[0].selected,false);
 rows[0].selected=true;const batch=reviewedBatch(rows,[],{id:'e',currency:'ARS'},'b','ARS');assert.equal(batch.creates[0].quantity,'0');assert.equal(batch.creates[0].unit_price,'0');
 assert.throws(()=>parsePlan(JSON.stringify({proposal_lines:[{description:'x',unit:'m',quantity:'-1'}]})));
});
test('edits and deletes retain an optimistic snapshot, and unknown IDs are rejected',()=>{
 const proposals=changeProposals(JSON.stringify({proposal_changes:[{line_id:line.id,action:'delete'}]}));
 const rows=rowsFromChanges(proposals,[line]);assert.equal(rows[0].selected,false);rows[0].selected=true;
 const batch=reviewedBatch(rows,[line],{id:'e',currency:'ARS'},'b','ARS');assert.equal(batch.deletes[0].line_id,line.id);assert.equal(batch.updates.length,0);
 assert.throws(()=>rowsFromChanges([{...proposals[0],line_id:'foreign'}],[line]));
 const edit=rowsFromChanges([{line_id:line.id,action:'edit',description:'Nivelación nueva',quantity:'350'}],[line]);edit[0].selected=true;
 const updated=reviewedBatch(edit,[line],{id:'e',currency:'ARS'},'b','ARS');assert.equal(updated.updates[0].description,'Nivelación nueva');assert.equal(updated.updates[0].quantity,'350');
});

test('square and cubic units are distinct, and mismatched-code suggestions stay unselected',()=>{
 const rows=localMatches([{row_id:'r1',code:line.code,description:line.description,unit:'m³',unit_price:'100',error:''}],[line]);
 assert.equal(rows[0].selected,false);assert.match(rows[0].reason,/unidad distinta/);
});
