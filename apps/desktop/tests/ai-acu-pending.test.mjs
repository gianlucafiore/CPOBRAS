import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rebasePendingAcuRows} from '../src/services/ai-acu-pending.js';
import {acuBatch,acuTotals} from '../src/services/ai-acu.js';

const projectLine=id=>({
 id,description:'Fabricación de estructura',unit:'kg',quantity:'900',unit_cost:'0',
 section_id:'section-real',analysis_id:null,components:[],takeoffs:[]
});
const resource={id:'mat-real',description:'Caño de acero',unit:'kg',kind:'material',price:'500'};
const initialSeed={id:'part-1',description:'Fabricación de estructura',unit:'kg',quantity:'900',
 is_new:true,section:'Estructura metálica',work_result:'Estructura instalada',
 expected_resources:[{id:'req-1',description:'Caño de acero',unit:'kg',kind:'material'}],
 outline_issues:[],components:[]};
function priorRow(){
 return {id:initialSeed.id,seed:structuredClone(initialSeed),selected:false,
  components:[],measurements:[],apply_measurements:false,
  section_id:null,section_title:'Estructura metálica',missing_resources:[],
  missing_resource_drafts:[{description:'Caño de acero',unit:'kg',kind:'material',action:'create'}],
  requirement_coverage:[],assumptions:[],missing_resolved:false};
}
test('structural save preserves unresolved recipe and changes seed from new to existing',()=>{
 const context={resources:[resource],lines:[projectLine('part-1')],sections:[]};
 const result=rebasePendingAcuRows({
  rows:[priorRow()],seeds:[initialSeed],targetIds:['part-1'],
  composedIds:[],context
 });
 assert.equal(result.count,1);
 assert.deepEqual(result.targetIds,['part-1']);
 assert.equal(result.rows.length,1);
 const row=result.rows[0];
 assert.equal(row.seed.is_new,false);
 assert.equal(row.seed.analysis_id,null);
 assert.equal(row.seed.section_id,'section-real');
 assert.deepEqual(row.seed.expected_resources,initialSeed.expected_resources);
 assert.equal(row.section_id,'section-real');
 assert.equal(row.section_title,'');
 assert.equal(row.missing_resource_drafts[0].description,'Caño de acero');
 assert.ok(acuTotals(row,context.resources).errors.length>0);
});
test('subsequent completed ACU updates existing line only and cannot recreate it',()=>{
 const context={resources:[resource],lines:[projectLine('part-1')],sections:[],currency:'ARS'};
 const [row]=rebasePendingAcuRows({
  rows:[priorRow()],seeds:[initialSeed],targetIds:['part-1'],context
 }).rows;
 row.components=[{resource_id:resource.id,quantity:'1',quantity_unit:'kg'}];
 row.requirement_coverage=[{requirement_id:'req-1',resource_id:resource.id}];
 row.missing_resource_drafts=[];
 row.selected=true;
 assert.deepEqual(acuTotals(row,context.resources).errors,[]);
 const batch=acuBatch({rows:[row],context,
  estimate:{id:'estimate-existing'},newEstimate:null,
  batchId:'batch-next',asOf:'2026-11-22'});
 assert.equal(batch.creates.length,0);
 assert.equal(batch.acus.length,1);
 assert.equal(batch.acus[0].line_id,'part-1');
});
test('already completed lines are omitted from follow-up and missing IDs are never guessed',()=>{
 const context={resources:[resource],lines:[projectLine('part-1')],sections:[]};
 const result=rebasePendingAcuRows({rows:[priorRow()],seeds:[initialSeed],
  targetIds:['part-1','part-missing'],composedIds:['part-1'],context});
 assert.deepEqual(result.targetIds,[]);
 assert.deepEqual(result.missingLineIds,['part-missing']);
 assert.equal(result.count,1);
});
