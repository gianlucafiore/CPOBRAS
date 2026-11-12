import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationIntent,isConversationApproval,isConversationCancel,proposalPrompt,parseConversationProposal,describeConversationProposal} from '../src/services/ai-conversation-workflows.js';

const id='11111111-1111-4111-8111-111111111111';
const catalog={resources:[{id,code:'MAT-1',description:'Cemento Portland',unit:'bolsa',kind:'material',price:'12500',active:true}]};
const acu=(overrides={})=>({description:'Contrapiso',unit:'m²',components:[{resource_id:id,quantity:'0.35',quantity_unit:'bolsa'}],assumptions:['Consumo estimado por m²'],missing_resources:[],...overrides});
const asAcu=(rows)=>JSON.stringify({answer:'Esta es la propuesta, pendiente de aprobación.',generic_acu_proposals:rows});
const resource=(rows)=>JSON.stringify({answer:'Propuesta de insumos pendiente.',resource_proposals:rows});

test('routes only explicit creation in correct screens',()=>{
 assert.equal(conversationIntent('analyses','Creá un ACU de contrapiso'),'generic_acu');
 assert.equal(conversationIntent('projects','Necesito un ACU genérico de revoque'),'generic_acu');
 assert.equal(conversationIntent('resources','Agregá insumos a la biblioteca'),'resources');
 assert.equal(conversationIntent('workspace','Agregá insumos a la partida'),null);
 assert.equal(conversationIntent('resources','¿Cuánto cuesta el cemento?'),null);
 assert.equal(conversationIntent('analyses','¿Cómo se calcula el ACU?'),null);
});
test('approval and cancellation require unambiguous user text',()=>{
 for(const phrase of ['sí','apruebo','acepto','confirmo','aprobá y cargá','Sí, guardalos','hacelo'])
   assert.equal(isConversationApproval(phrase),true,phrase);
 for(const phrase of ['no lo cargues','¿Me lo aprobás?','perfecto, pero cambiá el insumo','cancelar propuesta'])
   assert.equal(isConversationApproval(phrase),false,phrase);
 assert.equal(isConversationCancel('cancelar propuesta'),true);
 assert.equal(isConversationCancel('no lo cargues'),true);
});
test('generic ACU uses only real catalog ids, exact units and prices from native data',()=>{
 const proposal=parseConversationProposal('generic_acu',asAcu([acu()]),catalog,[]);
 assert.equal(proposal.kind,'generic_acu');
 assert.deepEqual(proposal.errors,[]);
 assert.deepEqual(proposal.rows[0].components,[{resource_id:id,quantity:'0.35',unit_price:'12500',description:'Cemento Portland',unit:'bolsa'}]);
 assert.match(describeConversationProposal(proposal),/0\.35 bolsa/);
});
test('unknown catalog ids and invented unit conversion remain uncommittable',()=>{
 for(const row of [acu({components:[{resource_id:'fabricado',quantity:'3',quantity_unit:'kg'}]}),acu({components:[{resource_id:id,quantity:'15',quantity_unit:'kg'}]}),acu({components:[{resource_id:id,quantity:'0',quantity_unit:'bolsa'}]})]){
  const proposal=parseConversationProposal('generic_acu',asAcu([row]),catalog);
  assert.ok(proposal.errors.length>0);
 }
 const noPrice=parseConversationProposal('generic_acu',asAcu([acu()]),{resources:[{...catalog.resources[0],price:null}]});
 assert.ok(noPrice.errors.some(error=>/sin precio/i.test(error)));
});
test('generic ACU cannot slip in duplicates, revisions or unsupported payloads',()=>{
 assert.throws(()=>parseConversationProposal('generic_acu',asAcu([acu(),acu()]),catalog),/repetido/i);
 assert.throws(()=>parseConversationProposal('generic_acu',asAcu(Array.from({length:6},(_,i)=>acu({description:'Partida '+i}))),catalog),/1 y 5/);
 const exists=parseConversationProposal('generic_acu',asAcu([acu()]),catalog,[{description:'contrapiso',unit:'m²'}]);
 assert.ok(exists.errors.some(error=>/ya existe/i.test(error)));
 assert.throws(()=>parseConversationProposal('generic_acu','{broken json',catalog),/JSON/);
});
test('resource drafts strip model prices and existing identifiers',()=>{
 const draft=parseConversationProposal('resources',resource([{description:'Arena fina',kind:'material',unit:'m³',price:'900000',code:'FAKE',id:'FAKE'}]),null,[]);
 assert.equal(draft.rows[0].price,null);
 assert.equal(draft.rows[0].description,'Arena fina');
 assert.equal('id' in draft.rows[0],false);
 assert.deepEqual(draft.errors,[]);
 assert.match(proposalPrompt('resources','agrega arena',{previous:'valores'}),/no guardar|no ejecutar/i);
});
