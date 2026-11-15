import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationAcuRequest,conversationStore,structuredConversationContext} from '../src/services/ai-conversation-context.js';
import {contextualAcuLine} from '../src/services/ai-assistant.js';
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
 const key=[...entries.keys()][0],payload=JSON.parse(entries.get(key));
 payload.intent.approval=true;payload.intent.preview={id:'unsafe'};
 entries.set(key,JSON.stringify(payload));
 assert.equal(store.read().intent.approval,undefined);
 assert.equal(store.read().intent.preview,undefined);
 payload.updated=Date.now()-86400001;entries.set(key,JSON.stringify(payload));
 assert.equal(store.read(),null);
 store.clear();assert.equal(store.read(),null);
});

test('negations and questions never start preparation',()=>{
 for(const text of ['no generar ACU de la partida seleccionada','¿generar ACU de la partida seleccionada?']){
  assert.equal(conversationAcuRequest(text,state,null),null);
 }
});

test('esa partida follows the conversational referent after selection changes',()=>{
 assert.equal(contextualAcuLine('completá esa partida',{selectedLineId:'line-2',focusLineId:'one',lines:state.lines}).id,'one');
 assert.equal(contextualAcuLine('completá la partida seleccionada',{selectedLineId:'line-2',focusLineId:'one',lines:state.lines}).id,'line-2');
});

test('database conversations stay separate even when project and budget IDs match', () => {
 const entries = new Map();
 const storage = {getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value)};
 const original = conversationStore(storage, 'p', 'e');
 const copy = conversationStore(storage, 'p', 'e', 'another-database');
 original.write([{role:'user',content:'Conversación original'}], null);
 assert.equal(copy.read(), null);
 copy.write([{role:'user',content:'Conversación de la copia'}], null);
 assert.equal(original.read().messages[0].content, 'Conversación original');
 assert.equal(copy.read().messages[0].content, 'Conversación de la copia');
});

import {libraryAcuViewHelp} from '../src/services/ai-library-conversation.js';

test('ACU library screen questions are read-only help without local intent classification',()=>{
  for(const question of ['para que sirve esta vista?','¿Para qué sirve esta pantalla?','¿Qué puedo hacer en esta vista?','explicame esta sección','que es la biblioteca de acu']){
    const answer=libraryAcuViewHelp(question);
    assert.equal(typeof answer,'string',question);
    assert.match(answer,/ACU/);
    assert.match(answer,/reutilizable/);
  }
  for(const question of ['agregá yeso húmedo a este ACU','aprobá y cargá','¿qué contiene el ACU seleccionado?','para que sirve este yeso','cuanto cuesta el cemento']){
    assert.equal(libraryAcuViewHelp(question),null,question);
  }
});
