import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSectionToolArgs,prepareSectionEdits} from '../src/services/ai-budget-sections.js';
import {prepareSectionBatch,recentCreatedSectionSources} from '../src/services/ai-section-operations.js';
import {parseAiReply} from '../src/services/ai-assistant.js';

const estimateId='11111111-2222-4333-8444-555555555555';
const projectId='11111111-2222-4333-8444-666666666666';
const source=i=>({
 id:'22222222-3333-4444-8555-'+String(i).padStart(12,'0'),
 description:['Movimiento de suelos','Fundaciones','Estructuras','Mampostería','Cubiertas','Revestimientos','Instalación sanitaria','Instalación eléctrica','Pinturas'][i],
 unit:'gl',quantity:'1',unit_cost:'0',analysis_id:null,components:[],takeoffs:[]
});
function state(lines=Array.from({length:9},(_,i)=>source(i)),sections=[]){
 return {projectId,estimateId,remoteProject:false,
  estimates:[{id:estimateId,title:'Presupuesto',issued:false}],
  lines,sections,assignments:{}};
}
test('natural phrases become rubro tools, never new budget lines',()=>{
 const parsed=parseAiReply(JSON.stringify({answer:'Se crearán rubros',tool_call:{
  name:'manage_sections',args:{action:'create',titles:'Fundaciones; Estructuras; Cubiertas'}}}));
 assert.equal(parsed.toolCall.name,'manage_sections');
 assert.equal(parsed.planRows,undefined);
 const plan=prepareSectionEdits(parsed.toolCall.args,state([]));
 assert.equal(plan.batch.creates.length,3);
 assert.equal(plan.batch.converts.length,0);
 assert.deepEqual(plan.batch.creates.map(x=>x.title),['Fundaciones','Estructuras','Cubiertas']);
 assert.equal(plan.batch.deletes.length,0);
});
test('last nine confirmed generic partidas can be converted in exactly one atomic batch',()=>{
 const lines=Array.from({length:9},(_,i)=>source(i));
 const approved=[
  {role:'assistant',approval:{state:'done',result:{created:9,committed:true,estimateId,lineIds:lines.map(x=>x.id)}}},
  {role:'user',content:'son rubros, no partidas'}
 ];
 const recent=recentCreatedSectionSources(approved,estimateId);
 assert.deepEqual(recent,lines.map(x=>x.id));
 const plan=prepareSectionEdits({action:'convert',source:'last_created'},state(lines),recent);
 assert.equal(plan.batch.creates.length,9);
 assert.equal(plan.batch.converts.length,9);
 assert.equal(plan.batch.deletes.length,0);
 assert.deepEqual(plan.batch.converts.map(x=>x.line_id),lines.map(x=>x.id));
 assert.equal(new Set(plan.batch.converts.map(x=>x.section_id)).size,9);
 assert.ok(plan.warnings.some(w=>/archivará/i.test(w)));
});
test('last created conversion refuses priced or measured tasks rather than deleting genuine work',()=>{
 const lines=[{...source(0),unit_cost:'50000'},source(1)];
 assert.throws(()=>prepareSectionEdits({action:'convert',source:'last_created'},state(lines),lines.map(x=>x.id)),/tiene datos/);
 assert.throws(()=>prepareSectionEdits({action:'convert',source:'last_created'},state([source(0)]),[]),/última carga/);
 assert.throws(()=>prepareSectionEdits({action:'convert',titles:'Fundaciones'},state()),/nombres claros/);
});
test('section deletion warns and retains assigned partidas and nested rubros',()=>{
 const existing={id:'33333333-4444-4555-8666-777777777777',estimate_id:estimateId,code:'01',title:'Fundaciones',position:0,parent_id:null};
 const nested={...existing,id:'33333333-4444-4555-8666-888888888888',code:'01.01',title:'Zapatas',position:1,parent_id:existing.id};
 const ctx=state([source(0)],[existing,nested]);ctx.assignments[source(0).id]=existing.id;
 const plan=prepareSectionEdits({action:'delete',target:'Fundaciones'},ctx);
 assert.deepEqual(plan.batch.deletes[0].expected_lines,1);
 assert.deepEqual(plan.batch.deletes[0].expected_children,1);
 assert.equal(plan.batch.converts.length,0);
 assert.ok(plan.warnings.some(w=>/conservan 1 partidas/.test(w)));
 assert.ok(plan.warnings.some(w=>/conservan 1 subrubros/.test(w)));
});
test('section update can rename and change code, without making a new partida',()=>{
 const section={id:'33333333-4444-4555-8666-777777777777',estimate_id:estimateId,code:'01',title:'Fundaciones',position:0,parent_id:null};
 const plan=prepareSectionEdits({action:'update',target:'Fundaciones',new_title:'Cimentaciones',new_code:'A.01'},state([],[section]));
 assert.equal(plan.batch.renames.length,1);
 assert.deepEqual(plan.batch.renames[0].expected.code,'01');
 assert.equal(plan.batch.renames[0].code,'A.01');
 assert.equal(plan.batch.renames[0].title,'Cimentaciones');
 assert.equal(plan.batch.creates.length,0);
 assert.equal(parseSectionToolArgs({action:'convert',source:'other'}),null);
});
test('refuse duplicate rubros, foreign changes and issued budgets',()=>{
 const section={id:'33333333-4444-4555-8666-777777777777',estimate_id:estimateId,code:'01',title:'Fundaciones',position:0,parent_id:null};
 assert.throws(()=>prepareSectionEdits({action:'create',titles:'Fundaciones'},state([],[section])),/ya existen|ya existe/i);
 const issued=state([]);issued.estimates[0].issued=true;
 assert.throws(()=>prepareSectionEdits({action:'create',titles:'Fundaciones'},issued),/elaboración/);
 assert.equal(parseSectionToolArgs({action:'create',titles:'Fundaciones; Fundaciones'}),null);
});
