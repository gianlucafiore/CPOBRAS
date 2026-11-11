import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AI_TOOL_CONTRACTS,budgetReviewIntent,aiDomainContext} from '../src/services/ai-domain-context.js';
import {parseBudgetToolCall} from '../src/services/ai-budget-tools.js';
import {reviewSectionContext,reviewedSectionSuggestions,reviewPreviewRows} from '../src/services/ai-budget-review.js';

const line={id:'10000000-0000-4000-8000-000000000001',description:'Excavación para fundaciones',unit:'m³',quantity:'12',unit_cost:'2500',analysis_id:null,section_id:null};
const section={id:'10000000-0000-4000-8000-000000000002',title:'Fundaciones',code:'01',parent_id:null};
const state={projectId:'p',estimateId:'e',lines:[line],sections:[section],assignments:{},view:'workspace'};

test('natural language budget-wide review uses one registered operation',()=>{
 const q='Revisá este presupuesto, organizá las partidas en sus rubros correspondientes, completá los ACU con los precios de mi biblioteca y decime qué falta.';
 assert.equal(budgetReviewIntent(q),true);
 assert.equal(budgetReviewIntent('Buscá insumos para esta partida'),false);
 assert.equal(AI_TOOL_CONTRACTS.review_budget.kind,'reviewed_write');
 assert.deepEqual(parseBudgetToolCall({name:'review_budget',args:{brief:q}}),{name:'review_budget',args:{brief:q}});
 assert.equal(parseBudgetToolCall({name:'unsafe_sql',args:{query:'DELETE FROM estimates'}}),null);
 const context=aiDomainContext(state,q);
 assert.match(context,/rubros/);
 assert.match(context,/review_budget/);
 assert.match(context,/"sin_acu":1/);
 assert.doesNotMatch(context,/DELETE FROM/);
});
test('section mapping can only target locally supplied IDs',()=>{
 const context=JSON.parse(reviewSectionContext([line],[section]));
 assert.equal(context.task,'classify_budget_sections');
 assert.equal(context.sections[0].id,section.id);
 assert.equal(context.lines[0].id,line.id);
 const response=JSON.stringify({section_moves:[{line_id:line.id,section_id:section.id,confidence:'high',reason:'Trabajo de fundaciones'}]});
 const prepared=reviewedSectionSuggestions(response,[line],[section]);
 assert.equal(prepared.moves.length,1);
 assert.equal(prepared.moves[0].expected.unit_cost,'2500');
 assert.equal(prepared.moves[0].expected_section,null);
 assert.equal(prepared.moves[0].section_id,section.id);
 assert.deepEqual(reviewPreviewRows(prepared.moves,[section],[line]).map(r=>r.to),['Fundaciones']);
});
test('ambiguous, unknown or repeated section suggestions are never executed',()=>{
 const unknown='20000000-0000-4000-8000-000000000009';
 const proposals={section_moves:[
  {line_id:line.id,section_id:unknown,confidence:'high'},
  {line_id:line.id,section_id:section.id,confidence:'high'},
  {line_id:unknown,section_id:section.id,confidence:'high'}
 ]};
 const output=reviewedSectionSuggestions(JSON.stringify(proposals),[line],[section]);
 assert.equal(output.moves.length,0);
 assert.ok(output.pending.length>=2);
 const uncertain=reviewedSectionSuggestions(JSON.stringify({section_moves:[{line_id:line.id,section_id:section.id,confidence:'uncertain'}]}),[line],[section]);
 assert.equal(uncertain.moves.length,0);
 assert.ok(uncertain.pending.some(s=>/Sin correspondencia/.test(s)));
 assert.throws(()=>reviewedSectionSuggestions(JSON.stringify({section_moves:'wrong'}),[line],[section]));
});
test('review classification rejects oversized context',()=>{
 const oversized=Array.from({length:61},(_,i)=>({...line,id:'line-'+i}));
 assert.throws(()=>reviewSectionContext(oversized,[section]),/60 partidas/);
});
