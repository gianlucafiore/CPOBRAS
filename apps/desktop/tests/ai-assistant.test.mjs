import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAiReply,draftFromProposal,createAiRequest} from '../src/services/ai-assistant.js';
test('unstructured responses remain text; only whitelisted proposals become drafts',()=>{
  assert.deepEqual(parseAiReply('<script>bad()</script>'),{answer:'<script>bad()</script>',proposal:null});
  const reply=parseAiReply(JSON.stringify({answer:'Revisá este borrador',proposal:{kind:'line',description:'Excavación',unit:'m³',quantity:'15.25',unit_price:'30000',id:'existing-id',execute:'delete',sectionId:'secret'}}));
  assert.deepEqual(draftFromProposal(reply.proposal),{kind:'line',record:{description:'Excavación',unit:'m³',quantity:'15.25',unit_cost:'30000'}});
  assert.equal('id' in reply.proposal,false);
});
test('rejects money movements, negative values, locale ambiguity and invalid resource kinds',()=>{
  const valid={kind:'resource',description:'Cemento',unit:'kg'};
  for(const extra of [{kind:'payment'},{unit_price:'-1'},{quantity:'1,500'},{resource_type:'unknown'},{quantity:'1e50'},{unit:'x'.repeat(31)}]){
    assert.equal(parseAiReply(JSON.stringify({answer:'x',proposal:{...valid,...extra}})).proposal,null);
  }
  assert.throws(()=>draftFromProposal({kind:'payment'}));
});
test('missing prices are omitted rather than invented; resource drafts have no code or ID',()=>{
  assert.deepEqual(draftFromProposal({kind:'resource',description:'Ayudante',unit:'h',resource_type:'labor'}),{kind:'resource',record:{description:'Ayudante',unit:'h',kind:'labor'}});
});

function watchdogOptions(){
  let callback;
  return {options:{requestId:'test-request',setTimer:fn=>{callback=fn;return 1;},clearTimer:()=>{}},expire:()=>callback()};
}
test('UI watchdog settles even when chat and cancellation IPC never return',async()=>{
  const calls=[],clock=watchdogOptions();
  const request=createAiRequest((name,args)=>{calls.push([name,args]);return new Promise(()=>{});},{messages:[],context:''},clock.options);
  const settled=assert.rejects(request.promise,/no respondió a tiempo/);
  await Promise.resolve();clock.expire();await settled;await Promise.resolve();
  assert.deepEqual(calls.map(c=>c[0]),['ai_chat','ai_cancel']);
  assert.equal(calls[0][1].requestId,calls[1][1].requestId);
});
test('cancelled queries ignore late replies and never automatically retry',async()=>{
  let reply;const calls=[],clock=watchdogOptions();
  const request=createAiRequest((name)=>{calls.push(name);return name==='ai_chat'?new Promise(resolve=>{reply=resolve;}):Promise.resolve();},{},clock.options);
  const settled=assert.rejects(request.promise,/cancelada/);
  await Promise.resolve();request.cancel();await settled;reply({text:'late'});await Promise.resolve();
  assert.deepEqual(calls,['ai_chat','ai_cancel']);
});
test('cancelling immediately prevents dispatch; native errors release the watchdog',async()=>{
  const calls=[],clock=watchdogOptions();
  const request=createAiRequest(name=>{calls.push(name);},{},clock.options);
  const settled=assert.rejects(request.promise,/cancelada/);request.cancel();await settled;
  assert.deepEqual(calls,[]);
  const failed=createAiRequest(()=>Promise.reject(new Error('clave rechazada')),{},watchdogOptions().options);
  await assert.rejects(failed.promise,/clave rechazada/);
});
