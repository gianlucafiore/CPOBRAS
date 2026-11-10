import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAiReply,draftFromProposal,createAiRequest,budgetScreenContext,acuChatRequest} from '../src/services/ai-assistant.js';
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

test('budget context counts every line even if the detailed list is truncated',()=>{
  const lines=Array.from({length:81},(_,i)=>({id:String(i),description:'Partida '+i+' x'.repeat(200),unit:'m³',quantity:'1',unit_cost:i<30?'0.00':'100.10'}));
  const context=budgetScreenContext({view:'workspace',estimateId:'e',selectedLineId:'80',lines},'texto visible');
  const summary=JSON.parse(context.split('\n')[1]);
  assert.equal(summary.total_partidas,81);assert.equal(summary.precio_cero,30);assert.equal(summary.precio_positivo,51);
  assert.ok(context.length<=7000);assert.match(context,/Partida seleccionada.*Partida 80/);assert.match(context,/Los conteos del resumen incluyen las 81/);
});
test('zero prices, absent prices and prices outside budget scope remain distinct',()=>{
  const state={view:'workspace',estimateId:'e',lines:[{unit_cost:'0'},{unit_cost:'-0.000'},{unit_cost:null},{unit_cost:'invalid'},{unit_cost:'0.0000000001'}],resources:[{description:'PRIVATE CATALOG'}]};
  const context=budgetScreenContext(state);
  const summary=JSON.parse(context.split('\n')[1]);
  assert.equal(summary.precio_cero,2);assert.equal(summary.precio_sin_dato,2);assert.equal(summary.precio_positivo,1);
  assert.ok(!context.includes('PRIVATE CATALOG'));
  assert.equal(budgetScreenContext({...state,view:'clients'},'visible contacts'),'visible contacts');
});


const acuLineId='10000000-0000-4000-8000-000000000001';
test('a valid ACU handoff takes priority over proposed material lines',()=>{
  const reply=parseAiReply(JSON.stringify({answer:'Prepará los ACU existentes',acu_request:{mode:'fill',brief:'Revoque de dos caras de 20 m × 3 m',line_ids:[acuLineId]},proposal_lines:[{description:'Agregar cemento',unit:'kg'}],proposal:{kind:'resource',description:'Cemento',unit:'kg'}}));
  assert.deepEqual(reply.acuRequest,{mode:'fill',brief:'Revoque de dos caras de 20 m × 3 m',lineIds:[acuLineId]});
  assert.equal(reply.proposal,null);assert.equal(reply.planRows,undefined);assert.equal(reply.changeProposals,undefined);
  assert.deepEqual(parseAiReply(JSON.stringify({answer:'Revisá',acu_request:{mode:'fill',brief:'Completar los ACU faltantes'}})).acuRequest.lineIds,[]);
  assert.equal(parseAiReply(JSON.stringify({answer:'Revisá',acu_request:{mode:'create',brief:'Crear una vivienda con ACU'}})).acuRequest.mode,'create');
});
test('invalid ACU handoffs cannot fall back to actionable line or resource cards',()=>{
  for(const request of [null,[],{mode:'delete',brief:'x'},{mode:'fill',brief:''},{mode:'fill',brief:'x'.repeat(3001)},{mode:'create',brief:'x',line_ids:[]},{mode:'fill',brief:'x',line_ids:['foreign']},{mode:'fill',brief:'x',line_ids:[acuLineId,acuLineId]},{mode:'fill',brief:'x',line_ids:Array(61).fill(acuLineId)},{mode:'fill',brief:'x',sql:'UPDATE x'}]){
    const reply=parseAiReply(JSON.stringify({answer:'Propuesta',acu_request:request,proposal_lines:[{description:'Material',unit:'kg'}],proposal:{kind:'resource',description:'Cemento',unit:'kg'}}));
    assert.equal(reply.acuRequest,undefined);assert.equal(reply.planRows,undefined);assert.equal(reply.changeProposals,undefined);assert.equal(reply.proposal,null);assert.match(reply.answer,/No se preparó ninguna acción de ACU/);
  }
});
test('direct ACU requests open preparation while informational and catalog questions do not',()=>{
  for(const q of ['Completá los ACU existentes del presupuesto','¿Podés cargar los insumos y rendimientos en todas las partidas?','Preparame los ACUs de revoque','Quiero que cargues los insumos en cada partida','Necesito que completes sus ACUs','Dimensioná los revoques de los muros'])assert.equal(acuChatRequest(q,[])?.mode,'fill');
  assert.equal(acuChatRequest('Creá 3 partidas nuevas con ACU',[])?.mode,'create');
  for(const q of ['¿Por qué no puede cargar los ACU?','¿Cuántos insumos hay?','¿Qué rendimiento tiene el revoque?','Explicame los ACU de esta pantalla','Agregá un insumo Cemento a la biblioteca','Cargá insumos en el catálogo','Creá las partidas para esta obra'])assert.equal(acuChatRequest(q,[]),null);
});
test('a short confirmation retains user geometry and criteria, not erroneous assistant material lines',()=>{
  const history=[{role:'user',content:'Muros de ladrillo de 30 cm, dos caras de revoque en 20 m por 3 m. Agregá los consumos a cada partida.'},{role:'assistant',answer:'No puedo cargar insumos directamente en las partidas. Puedo preparar una lista.',planRows:[{description:'Agregar cemento',unit:'kg'},{description:'Agregar arena',unit:'m³'}]}];
  const request=acuChatRequest('perfecto, cargalos',history);
  assert.equal(request.mode,'fill');assert.match(request.brief,/30 cm/);assert.match(request.brief,/20 m por 3 m/);assert.ok(!request.brief.includes('Agregar cemento'));assert.notEqual(request.brief,'perfecto, cargalos');
  assert.equal(acuChatRequest('sí, hacelo',history)?.mode,'fill');
  assert.equal(acuChatRequest('perfecto, cargalos',[]),null);
  assert.equal(acuChatRequest('sí, hacelo',[{role:'user',content:'Creá la lista de clientes'},{role:'assistant',answer:'Puedo crear esa lista'}]),null);
});
test('a confirmation preserves an explicit selection and create intent from a validated ACU card',()=>{
  const history=[{role:'user',content:'Revoque de 20 m por 3 m, con espesor de 2 cm.'},{role:'assistant',answer:'Podemos preparar sus ACU',acuRequest:{mode:'fill',brief:'Completar el ACU del revoque indicado',lineIds:[acuLineId]}}];
  const request=acuChatRequest('sí, hacelo',history);assert.equal(request.mode,'fill');assert.deepEqual(request.lineIds,[acuLineId]);assert.match(request.brief,/20 m por 3 m/);assert.match(request.brief,/2 cm/);
  const created=acuChatRequest('dale',[{role:'assistant',answer:'Propuesta de ACU',acuRequest:{mode:'create',brief:'Crear partidas nuevas para una obra de mampostería',lineIds:[]}}]);
  assert.equal(created.mode,'create');assert.deepEqual(created.lineIds,[]);
});
test('the latest fill request overrides an old generic request to create budget lines',()=>{
  const history=[{role:'user',content:'Creá las partidas nuevas de una vivienda.'},{role:'assistant',answer:'Lista de partidas preparada.'},{role:'user',content:'Ahora completá los ACU existentes usando rendimientos de la biblioteca.'},{role:'assistant',answer:'Puedo preparar insumos para cada partida.'}];
  const request=acuChatRequest('perfecto, cargalos',history);assert.equal(request.mode,'fill');assert.match(request.brief,/rendimientos de la biblioteca/);
  const noDuplicate=acuChatRequest('No crees partidas nuevas, completá los ACU existentes',history);assert.equal(noDuplicate.mode,'fill');
});
test('new direct criteria do not silently reuse an old targeted selection',()=>{
  const history=[{role:'assistant',answer:'Preparar ACU',acuRequest:{mode:'fill',brief:'Completar solo una partida',lineIds:[acuLineId]}}];
  const request=acuChatRequest('Completá todos los ACU faltantes',history);assert.equal(request.mode,'fill');assert.deepEqual(request.lineIds,[]);
  assert.equal(acuChatRequest('Completá los ACU con estos criterios: '+'x'.repeat(3001),[]),null);
});
