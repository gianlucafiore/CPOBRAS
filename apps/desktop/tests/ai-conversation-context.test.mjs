import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationAcuRequest,conversationStore,structuredConversationContext} from '../src/services/ai-conversation-context.js';
const state={projectId:'p',estimateId:'e',panel:'budget',selectedLineId:'one',lines:Array.from({length:81},(_,i)=>({id:i?'line-'+i:'one'}))};
test('single selected ACU retains criteria and destination through retries and selection changes',()=>{
 let intent=conversationAcuRequest('generar ACU de la partida seleccionada',state,null);
 assert.deepEqual(intent.lineIds,['one']);
 intent=conversationAcuRequest('usá monocapa, hidrófugo y mano de obra',state,intent);
 assert.match(intent.brief,/monocapa/);
 for(const text of ['generalo','bueno cargalos','reintenta']){
  const next=conversationAcuRequest(text,{...state,selectedLineId:'line-2'},intent);
  assert.deepEqual(next.lineIds,['one']);
 }
 assert.equal(structuredConversationContext({...state,selectedLineId:'line-2'},intent).destinationChanged,true);
 assert.ok(conversationAcuRequest('generalo',{...state,lines:[]},intent).error);
});
test('storage isolates budgets and restores no executable approval',()=>{
 const entries=new Map(),storage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
 const store=conversationStore(storage,'p','e');
 store.write([{role:'assistant',content:'Propuesta',approval:{state:'approved'},preview:{id:'unsafe'}}],{mode:'fill',lineIds:['one'],brief:'ACU',approval:true});
 const saved=store.read();
 assert.deepEqual(saved.messages,[{role:'assistant',content:'Propuesta'}]);
 assert.equal(saved.intent.approval,undefined);
 assert.equal(conversationStore(storage,'p','other').read(),null);
 store.clear();assert.equal(store.read(),null);
});
