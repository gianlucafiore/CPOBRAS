import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAiReply,draftFromProposal,lineProposalFromClarification,lineProposalFromDirectRequest,simpleArithmeticAnswer,answerForDisplay,createAiRequest,budgetScreenContext,acuChatRequest,resolvedPendingApproval,isApprovalReply,materialAdditionFollowup,materialAdditionConfirmation,selectedAcuRequest,affirmativeMissingMaterialRequest,contextualAcuLine,availableCatalogFollowup} from '../src/services/ai-assistant.js';
test('unstructured responses remain text; only whitelisted proposals become drafts',()=>{
  assert.deepEqual(parseAiReply('<script>bad()</script>'),{answer:'<script>bad()</script>',proposal:null});
  const reply=parseAiReply(JSON.stringify({answer:'Revisá este borrador',proposal:{kind:'line',description:'Excavación',unit:'m³',quantity:'15.25',unit_price:'30000',id:'existing-id',execute:'delete',sectionId:'secret'}}));
  assert.deepEqual(draftFromProposal(reply.proposal),{kind:'line',record:{description:'Excavación',unit:'m³',quantity:'15.25',unit_cost:'30000'}});
  assert.equal('id' in reply.proposal,false);
});
test('Bonsai single-quoted tool calls are parsed and validated instead of printed',()=>{
  const raw="{'tool_call': {'name': 'describe_capabilities', 'args': {'module': 'all'}}}";
  const parsed=parseAiReply(raw);
  assert.deepEqual(parsed.toolCall,{name:'describe_capabilities',args:{module:'all'}});
  assert.equal(parsed.proposal,null);
  assert.equal(parsed.answer,'Solicitud de consulta interpretada.');
  assert.ok(!parsed.answer.includes('tool_call'));

  const withAnswer=parseAiReply("{'answer': 'Consulto la capacidad del programa', 'tool_call': {'name': 'describe_capabilities', 'args': {'module': 'all'}}}");
  assert.deepEqual(withAnswer.toolCall,parsed.toolCall);
  assert.equal(withAnswer.answer,'Consulto la capacidad del programa');
  const fenced=parseAiReply("```python\n{'tool_call': {'name': 'describe_capabilities', 'args': {'module': 'all'}}}\n```");
  assert.deepEqual(fenced.toolCall,parsed.toolCall);

  // The conversion never evaluates expressions, and only whitelisted tools survive.
  for(const unsafe of [
    "{'tool_call': {'name': 'delete_database', 'args': {}}}",
    "{'tool_call': {'name': 'describe_capabilities', 'args': {'module': 'unknown'}}}",
    "{'tool_call': {'name': 'describe_capabilities', 'args': {'module': 'all'}}}; process.exit(1)",
    "{'tool_call': {'name': 'describe_capabilities', 'args': {'module': 'all'}}, 'answer': (function(){throw 1})()}",
  ]){
    assert.equal(parseAiReply(unsafe).toolCall,undefined,unsafe);
  }
  assert.deepEqual(parseAiReply('Hola, puedo ayudarte.'),{answer:'Hola, puedo ayudarte.',proposal:null});
  assert.deepEqual(parseAiReply("{'proposal': {'kind':'line','description':'Falso'}}"),{answer:"{'proposal': {'kind':'line','description':'Falso'}}",proposal:null});
  assert.deepEqual(parseAiReply('{"tool_call":{"name":"describe_capabilities","args":{"module":"all"}}}').toolCall,parsed.toolCall);
});

test('creates an in-chat review card from the exact masonry clarification',()=>{
  const history=[{role:'user',content:'podés cargarme una partida de mampostería'},
    {role:'assistant',answer:'Necesito que me des más detalles para poder cargar la partida de mampostería. Para hacer esto, necesito saber: 1. La descripción específica del trabajo. 2. La unidad de medida. Una vez que me des esta información, puedo proponer la línea para tu presupuesto.'}];
  const draft=lineProposalFromClarification('mampostería de ladrillo hueco, en m2',history);
  assert.deepEqual(draft,{kind:'line',description:'mampostería de ladrillo hueco',unit:'m²'});
  assert.equal('quantity' in draft,false);
  assert.equal('unit_price' in draft,false);
  assert.equal(lineProposalFromClarification('mampostería de ladrillo hueco',history),null);
  assert.equal(lineProposalFromClarification('mampostería de ladrillo hueco, en m2',history.concat({role:'assistant',answer:'ACU creado',approval:{committed:true}})),null);
  assert.equal(lineProposalFromClarification('mampostería de ladrillo hueco, en m2',[{role:'assistant',answer:'Revisá este rubro',proposal:{kind:'line'}}]),null);
});
test('offers a single sanitary installation line without inventing price or quantity',()=>{
  const parsed=lineProposalFromDirectRequest('crear partida con instalación de sanitarios indoro y bidet');
  assert.deepEqual(parsed,{kind:'line',description:'Instalación de sanitarios: inodoro y bidet',unit:'conjunto'});
  assert.equal('quantity' in parsed,false);
  assert.equal('unit_price' in parsed,false);
  for(const text of ['borrar partida con instalación de sanitarios inodoro y bidet',
    'crear partida con instalación de sanitarios inodoro',
    'instalación de sanitarios inodoro y bidet',
    'creá partida de mampostería de 18 cm']){
    assert.equal(lineProposalFromDirectRequest(text),null,text);
  }
});
test('basic arithmetic and answer-only JSON are shown without an LLM call',()=>{
  assert.equal(simpleArithmeticAnswer('4+85?'),'89');
  assert.equal(simpleArithmeticAnswer('10-2'),'8');
  assert.equal(simpleArithmeticAnswer('4*2,5'),'10');
  assert.equal(simpleArithmeticAnswer('5/2'),'2.5');
  assert.equal(simpleArithmeticAnswer('3/0'),'No se puede dividir por cero.');
  assert.equal(simpleArithmeticAnswer('1;drop table'),null);
  assert.equal(answerForDisplay('{"answer":"Aquí tienes una ficha"}'),'Aquí tienes una ficha');
  assert.equal(answerForDisplay(JSON.stringify({answer:'La propuesta',tool_call:{name:'manage_sections'}})).includes('tool_call'),true);
  assert.equal(answerForDisplay('Texto normal'),'Texto normal');
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
  for(const request of [null,[],{mode:'delete',brief:'x'},{mode:'fill',brief:''},{mode:'fill',brief:'x'.repeat(3001)},{mode:'create',brief:'x',line_ids:[acuLineId]},{mode:'fill',brief:'x',line_ids:null},{mode:'fill',brief:'x',line_ids:['foreign']},{mode:'fill',brief:'x',line_ids:[acuLineId,acuLineId]},{mode:'fill',brief:'x',line_ids:Array(61).fill(acuLineId)},{mode:'fill',brief:'x',sql:'UPDATE x'}]){
    const reply=parseAiReply(JSON.stringify({answer:'Propuesta',acu_request:request,proposal_lines:[{description:'Material',unit:'kg'}],proposal:{kind:'resource',description:'Cemento',unit:'kg'}}));
    assert.equal(reply.acuRequest,undefined);assert.equal(reply.planRows,undefined);assert.equal(reply.changeProposals,undefined);assert.equal(reply.proposal,null);assert.match(reply.answer,/No se preparó ninguna acción de ACU/);assert.equal(typeof reply.actionError,'string');
  }
});
test('new ACU targets normalize empty or null existing-line lists without accepting actual existing IDs',()=>{
 for(const request of [{mode:'create',brief:'Crear tabique con ACU'},{mode:'create',brief:'Crear tabique con ACU',line_ids:[]},{mode:'create',brief:'Crear tabique con ACU',line_ids:null}]){
  const parsed=parseAiReply(JSON.stringify({answer:'Propuesta para revisar',acu_request:request}));
  assert.deepEqual(parsed.acuRequest,{mode:'create',brief:'Crear tabique con ACU',lineIds:[]});assert.equal(parsed.actionError,undefined);
 }
 const invalid=parseAiReply(JSON.stringify({answer:'Ya creé la partida y guardé todos los datos.',acu_request:{mode:'create',brief:'Crear tabique',line_ids:[acuLineId]},proposal_lines:[{description:'Agregar cemento',unit:'kg'}]}));
 assert.equal(invalid.acuRequest,undefined);assert.equal(invalid.planRows,undefined);assert.equal(invalid.proposal,null);
 assert.equal(invalid.answer,'No se preparó ninguna acción de ACU. '+invalid.actionError);
 assert.ok(!invalid.answer.includes('Ya creé'));
});
test('direct ACU requests open preparation while informational and catalog questions do not',()=>{
  for(const q of ['Completá los ACU existentes del presupuesto','¿Podés cargar los insumos y rendimientos en todas las partidas?','Preparame los ACUs de revoque','Quiero que cargues los insumos en cada partida','Necesito que completes sus ACUs','Dimensioná los revoques de los muros','Armá las partidas existentes con sus ACU vacíos','Prepará las partidas existentes con ACU vacío y cargá sus insumos'])assert.equal(acuChatRequest(q,[])?.mode,'fill',q);
  assert.equal(acuChatRequest('Creá 3 partidas nuevas con ACU',[])?.mode,'create');
  assert.equal(acuChatRequest('Creá una partida con ACU de revoque',[])?.mode,'create');
  assert.equal(acuChatRequest('Creá partidas nuevas con ACU tomando como referencia las partidas existentes',[])?.mode,'create');
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

const pendingAcu={role:'assistant',answer:'Podés aprobar este pedido.',acuRequest:{mode:'fill',brief:'Completar el ACU del revoque existente, conservando su cantidad.',lineIds:[acuLineId]}};
const pendingPlan={role:'assistant',answer:'Estas son las partidas propuestas.',planRows:[{description:'Limpieza inicial',unit:'m²',quantity:'20',unit_price:null,target:'new'}]};
const pendingLine={role:'assistant',answer:'Esta es la partida propuesta.',proposal:{kind:'line',description:'Replanteo',unit:'m²',quantity:'30'}};
const pendingPair=message=>[{role:'user',content:'Prepará la propuesta de esta obra.'},message];
test('a different new request cannot inherit construction criteria from an older pending proposal',()=>{
 const history=[{role:'user',content:'Tabique de ladrillo común de 250 m2 con 20 ladrillos por m2 y mortero.'},pendingAcu];
 const question='Quiero crear una partida distinta pero todavía no tengo sus datos';
 assert.equal(acuChatRequest(question,history),null);
 assert.equal(acuChatRequest('apruebo directamente',[...history,{role:'user',content:question},{role:'assistant',answer:'Indicame los datos del nuevo trabajo.'}]),null);
});
test('an explicit conversational approval resolves only the latest pending ACU, plan or line card',()=>{
 for(const message of [pendingAcu,pendingPlan,pendingLine]){
  for(const question of ['sí','SI.','Sí, por favor','sí, aprobar y cargar','si apruebo','apruebo directamente','sí, apruebo directamente','sí, aprobar y cargar directamente','Apruebo','Aprobalo','aprobar','cargalos','Perfecto, cargalos','dale, aplicalo','¡Sí, cargalos!','De acuerdo'])assert.equal(resolvedPendingApproval(question,pendingPair(message)),1,question);
 }
 const earlier=[{role:'user',content:'Otro pedido anterior.'},{role:'assistant',answer:'Respuesta anterior.'},...pendingPair(pendingAcu)];
 assert.equal(resolvedPendingApproval('sí',earlier),3);
});

test('an unambiguous approval like "sí aprobado cargalos" executes only the latest pending card',()=>{
 for(const approval of ['si aprobado cargalos','Sí, aprobado, cargalos','sí aprobado y cargalos','perfecto confirmado']){
  assert.equal(isApprovalReply(approval),true,approval);
  assert.equal(resolvedPendingApproval(approval,pendingPair(pendingAcu)),1,approval);
  assert.equal(resolvedPendingApproval(approval,pendingPair({...pendingAcu,approval:{state:'done',result:{committed:true}}})),null);
 }
 for(const text of ['sí aprobado cargalos si es el correcto','si aprobado cargalos pero cambiá las cantidades','no, aprobado cargalos']){
  assert.equal(isApprovalReply(text),false,text);
 }
});
test('a missing-fixtures correction targets the last locally saved ACU without reusing unrelated conversations',()=>{
 const id=acuLineId,second='10000000-0000-4000-8000-000000000022';
 const lines=[{id,description:'Instalación de sanitarios: 1 inodoro y 1 bidet con mano de obra'}, {id:second,description:'Pintura'}];
 const saved={approval:{state:'done',result:{committed:true,lineIds:[id]}},originalQuestion:'Preparar instalación de sanitarios'};
 const previous=[{role:'user',content:'los dos línea Mónaco'},{role:'assistant',answer:'Ya tengo los materiales; confirmá.'},{role:'user',content:'si aprobado'},{role:'assistant',answer:'Carga terminada.',approval:saved.approval}];
 const request=materialAdditionFollowup('no se cargaron los dos artefactos, por favor cargalos',previous,{selectedLineId:id,lines,lastAction:saved});
 assert.deepEqual({mode:request.mode,lineIds:request.lineIds,operation:request.operation},{mode:'fill',lineIds:[id],operation:'append'});
 assert.match(request.brief,/línea Mónaco/);
 assert.match(request.brief,/no se cargaron los dos artefactos/);
 assert.equal(request.brief.includes('Ya tengo los materiales'),false);
 assert.equal(materialAdditionFollowup('no se cargaron los dos artefactos, por favor cargalos',previous,{selectedLineId:second,lines,lastAction:saved}),null);
 assert.equal(materialAdditionFollowup('no se cargaron los dos artefactos, por favor cargalos',previous,{selectedLineId:id,lines,lastAction:null}),null);
 assert.equal(materialAdditionFollowup('No cargues los artefactos a esta partida seleccionada',[],{selectedLineId:id,lines}),null);
 assert.equal(materialAdditionFollowup('¿Cuánto cuestan los artefactos de esta partida seleccionada?',[],{selectedLineId:id,lines}),null);
 const explicit=materialAdditionFollowup('Agregá un inodoro Mónaco a esta partida seleccionada',[],{selectedLineId:id,lines});
 assert.equal(explicit.operation,'append');assert.deepEqual(explicit.lineIds,[id]);
});

test('conditions, questions, negatives and revised instructions cannot approve a pending action',()=>{
 for(const question of ['',null,true,'¿Sí?','¿Podés cargarlo?','si tiene todos los materiales, cargalos','si no falta nada','siempre','siempre cargalos','no apruebo','no apruebo directamente','apruebo directamente si están todos los materiales','sí, aprobar y cargar directamente si no falta nada','sí, apruebo directamente pero cambiá el precio','sí directamente','no, cargalos después','sí, pero cambiar las cantidades','sí, cargalos con precio 100','aprobá solo la primera partida','sí, antes mostrame los precios','perfecto'])assert.equal(resolvedPendingApproval(question,pendingPair(pendingAcu)),null,String(question));
});
test('consumed local approvals cannot be reused or become another ACU confirmation card',()=>{
 for(const approval of [{state:'running'},{state:'done',result:{committed:true}},{state:'stopped'},{state:'cancelled'},null,undefined]){
  const messages=pendingPair({...pendingAcu,approval});
  for(const question of ['sí','perfecto, cargalos','cargalos']){
   assert.equal(resolvedPendingApproval(question,messages),null);
   assert.equal(acuChatRequest(question,messages),null);
  }
 }
 assert.equal(acuChatRequest('Completá los ACU con nuevos criterios de 20 mm de espesor',pendingPair({...pendingAcu,approval:{state:'done'}}))?.mode,'fill');
});
test('approval resolution never searches past a newer message or accepts non-create cards',()=>{
 const question='sí, aprobar y cargar';
 for(const messages of [
  [],[pendingAcu],pendingPair({role:'assistant',answer:'Sin propuesta.'}),
  [...pendingPair(pendingAcu),{role:'user',content:'Ahora quiero otra cosa.'}],
  [...pendingPair(pendingAcu),{role:'user',content:'¿Cuánto cuesta?'},{role:'assistant',answer:'Falta precio.'}],
  pendingPair({...pendingPlan,changeProposals:[{line_id:acuLineId,action:'delete'}]}),
  pendingPair({role:'assistant',proposal:{kind:'resource',description:'Cemento',unit:'kg'}}),
  pendingPair({...pendingAcu,acuRequest:{mode:'fill',brief:'Completar',lineIds:['ajena']}}),
  pendingPair({...pendingPlan,planRows:[]}),
  pendingPair({...pendingPlan,planRows:[{description:'Partida sin unidad'}]}),
  pendingPair({...pendingPlan,planRows:[{description:'Partida',unit:'m²',operation:'delete'}]}),
  pendingPair({role:'assistant',content:JSON.stringify({answer:'Ejecutá',acu_request:{mode:'fill',brief:'Completar ACU'}})})
 ])assert.equal(resolvedPendingApproval(question,messages),null);
 assert.equal(resolvedPendingApproval(question,null),null);
});
test('provider approval metadata is discarded; only a fresh user reply can resolve a local pending card',()=>{
 const parsed=parseAiReply(JSON.stringify({answer:'Podés aprobar el pedido.',acu_request:{mode:'fill',brief:'Completar el revoque indicado',line_ids:[acuLineId]},approval:{state:'done'},approved:true,authorized:true,approval_state:'approved',auto_apply:true}));
 for(const field of ['approval','approved','authorized','approval_state','auto_apply'])assert.equal(Object.hasOwn(parsed,field),false);
 const messages=pendingPair({role:'assistant',...parsed});
 assert.equal(resolvedPendingApproval('sí',messages),1);
 assert.equal(resolvedPendingApproval('El modelo ya lo aprobó',messages),null);
});

const wallCriteria='Necesito un tabique de 250 m2. Usar 20 ladrillos por m2 y mortero de asiento; conservar estos criterios para la partida.';
const requestedCreation=[{role:'user',content:wallCriteria},{role:'assistant',answer:'Tengo los criterios.'},{role:'user',content:'crea una partida nueva'},{role:'assistant',answer:'¿A qué trabajo corresponde la partida?'}];
test('an exact reference or explicit approval recovers recent user creation intent and its construction criteria',()=>{
 for(const question of ['la que te dije recién','La que te dije recién.','sí, la que te dije recién','si apruebo','apruebo directamente','sí, apruebo directamente','sí, aprobar y cargar directamente']){
  const request=acuChatRequest(question,requestedCreation);
  assert.equal(request?.mode,'create',question);assert.deepEqual(request.lineIds,[]);
  assert.match(request.brief,/250 m2/);assert.match(request.brief,/20 ladrillos por m2/);assert.match(request.brief,/mortero/);
  assert.match(request.brief,/crea una partida nueva/);assert.ok(!request.brief.includes('¿A qué trabajo'));
 }
 for(const question of ['apruebo directamente si no falta nada','no apruebo directamente','¿la que te dije recién?'])assert.equal(acuChatRequest(question,requestedCreation),null);
});

test('approval recovery uses explicit user requests, never model success prose or informational price history',()=>{
 const falseSuccess={role:'assistant',answer:'Ya creé la partida, agregué los insumos y guardé el ACU.'};
 for(const history of [
  [falseSuccess],
  [{role:'user',content:'¿Cuánto cuesta un tabique de 250 m2, con 20 ladrillos por m2 y mortero?'},falseSuccess],
  [{role:'user',content:'Precio del ACU de revoque'},{role:'assistant',answer:'Puedo preparar el ACU y cargarlo.'}],
  [{role:'user',content:'Creá la lista de clientes'},{role:'assistant',answer:'Puedo preparar sus ACU.'}],
  [{role:'user',content:'crea una partida nueva'},{role:'assistant',answer:'Puedo armar un tabique con mortero.'}],
  [...requestedCreation,{role:'user',content:'Ahora quiero consultar el precio del cemento.'},{role:'assistant',answer:'Puedo preparar la partida.'}],
 ])for(const question of ['apruebo directamente','la que te dije recién','sí','cargalos'])assert.equal(acuChatRequest(question,history),null,question);
 const consumed=requestedCreation.map((message,index)=>index===requestedCreation.length-1?{...message,approval:{state:'done',result:{committed:true}}}:message);
 for(const question of ['apruebo directamente','la que te dije recién','sí','cargalos'])assert.equal(acuChatRequest(question,consumed),null);
});

test('a named material added to a budget line routes to composition and survives explicit approval without a valid card',()=>{
 const original='Agregá 50 m2 de chapa a la partida Armado de obrador.';
 for(const question of [original,'Quiero que agregues 50 m2 de chapa en la partida Armado de obrador','Asigná chapa del catálogo a la partida Armado de obrador']){
  const request=acuChatRequest(question,[]);assert.equal(request?.mode,'fill');assert.deepEqual(request.lineIds,[]);assert.match(request.brief,/chapa/);
 }
 const history=[{role:'user',content:original},{role:'assistant',answer:'La chapa puede prepararse para esa partida.'}];
 for(const question of ['apruebo directamente','sí, apruebo directamente','sí, aprobar y cargar directamente']){
  assert.equal(isApprovalReply(question),true);
  const request=acuChatRequest(question,history);assert.equal(request?.mode,'fill');assert.deepEqual(request.lineIds,[]);
  assert.match(request.brief,/50 m2/);assert.match(request.brief,/Armado de obrador/);
 }
 for(const question of ['¿Cuánto cuesta agregar chapa a la partida Armado de obrador?','Agregá chapa a la biblioteca','Cargá chapa en el catálogo para usarla en la partida','La chapa es para la partida Armado de obrador'])assert.equal(acuChatRequest(question,[]),null,question);
});

test('an explicit new-line request immediately reuses pertinent user construction criteria',()=>{
 const history=requestedCreation.slice(0,2);
 for(const question of ['crea una partida nueva','Creá la partida nueva']){
  const request=acuChatRequest(question,history);assert.equal(request?.mode,'create');
  assert.match(request.brief,/250 m2/);assert.match(request.brief,/20 ladrillos por m2/);assert.match(request.brief,/mortero/);
  assert.ok(request.brief.includes(question));assert.deepEqual(request.lineIds,[]);
 }
 const technical=[{role:'user',content:'Calculá los consumos y rendimientos del tabique.'},{role:'assistant',answer:'Criterios recibidos.'}];
 assert.equal(acuChatRequest('Creá una partida nueva',technical)?.mode,'create');
});

test('a generic new-line request does not reuse price-only, unrelated or consumed construction context',()=>{
 for(const history of [
  [],
  [{role:'user',content:'¿Cuánto cuesta el tabique de 250 m2?'},{role:'assistant',answer:'Tiene ese precio.'}],
  [{role:'user',content:'Tabique de 250 m2 a precio unitario 100.'},{role:'assistant',answer:'Datos de precio recibidos.'}],
  [...requestedCreation.slice(0,2),{role:'user',content:'¿Qué sanitarios hay en el catálogo?'},{role:'assistant',answer:'Lista de precios.'}],
  [...requestedCreation.slice(0,2),{role:'user',content:'Ahora hablamos de clientes y facturas.'},{role:'assistant',answer:'De acuerdo.'}],
  [{role:'user',content:wallCriteria},{role:'assistant',answer:'Guardado.',approval:{state:'done',result:{committed:true}}}],
 ])assert.equal(acuChatRequest('Creá una partida nueva',history),null);
});

test('direct material additions use only their current target and do not inherit previous work criteria',()=>{
 const current='Agregá 50 m2 de chapa a la partida Armado de obrador.';
 const previous=[{role:'user',content:wallCriteria},{role:'assistant',answer:'Criterios recibidos.'}];
 assert.equal(acuChatRequest(current,previous)?.brief,current);
 const consumed=[...previous.slice(0,1),{role:'assistant',answer:'Tabique guardado.',approval:{state:'done',result:{committed:true}}}];
 assert.equal(acuChatRequest(current,consumed)?.brief,current);
 const approvalHistory=[...consumed,{role:'user',content:current},{role:'assistant',answer:'Adición lista para preparar.'}];
 const recovered=acuChatRequest('apruebo directamente',approvalHistory);
 assert.equal(recovered?.mode,'fill');assert.equal(recovered.brief,current);assert.ok(!recovered.brief.includes('tabique'));
});


test('sí por favor after a model-only offer recovers a real pending addition card, not an unverified write',()=>{
 const line={id:acuLineId,description:'Instalación de sanitarios: 1 inodoro y 1 bidet con mano de obra',components:[{resource_id:'labor-1'}]};
 const saved={approval:{state:'done',result:{committed:true,lineIds:[acuLineId]}}};
 const history=[
  {role:'assistant',answer:'Carga terminada: 1 ACU cargado.',approval:saved.approval},
  {role:'user',content:'los dos línea Mónaco'},
  {role:'assistant',answer:'Confirmame los dos modelos.'},
  {role:'user',content:'no se cargaron los dos artefactos, por favor cargalos'},
  {role:'assistant',answer:'Puedo preparar los materiales de ambos sanitarios para esta partida.'},
 ];
 const context={selectedLineId:acuLineId,lines:[line],lastAction:saved};
 const request=materialAdditionConfirmation('sí, por favor',history,context);
 assert.equal(isApprovalReply('sí, por favor'),true);
 assert.deepEqual({mode:request?.mode,operation:request?.operation,lineIds:request?.lineIds},{mode:'fill',operation:'append',lineIds:[acuLineId]});
 assert.match(request.brief,/línea Mónaco/);
 assert.match(request.brief,/dos artefactos/);
 assert.equal(materialAdditionConfirmation('si por favor',history,{...context,selectedLineId:'other'}),null);
 assert.equal(materialAdditionConfirmation('si por favor',history,{...context,lastAction:null}),null);
 assert.equal(materialAdditionConfirmation('si por favor',[{role:'assistant',answer:'Puedo agregar esos insumos.'}],context),null);
 assert.equal(materialAdditionConfirmation('si por favor',[...history,{role:'user',content:'¿Cuánto cuesta el cemento?'},{role:'assistant',answer:'Puedo buscar ese precio.'}],context),null);
 const directHistory=[{role:'user',content:'Agregá un inodoro a esta partida seleccionada'},{role:'assistant',answer:'Puedo preparar ese recurso.'}];
 assert.deepEqual(materialAdditionConfirmation('si por favor',directHistory,{...context,lastAction:null})?.lineIds,[acuLineId]);
});

test('natural selected-partida requests target exactly one existing line without replacing its ACU',()=>{
 const line={id:acuLineId,description:'Revestimiento de baños',unit:'m²',quantity:'35',components:[]};
 const requests=[
  'completar la partida seleccionada con los insumos necesarios',
  'cargar los insumos necesarios, porcelanato, pastina',
  'bueno agregá todo eso sin las últimas opciones, para la partida seleccionada'
 ];
 for(const question of requests){
  const result=selectedAcuRequest(question,line,[{role:'assistant',answer:'Un baño requiere porcelanato, adhesivo, pastina y mano de obra; opcionales membranas e imprimaciones.'}]);
  assert.deepEqual(result?.lineIds,[acuLineId]);
  assert.equal(result?.operation,'append');
  assert.equal(result?.mode,'fill');
 }
 const prior=selectedAcuRequest(requests[2],line,[{role:'assistant',answer:'Porcelanato, adhesivo, pastina y mano de obra; membranas opcionales.'}]);
 assert.match(prior?.brief,/excluidas/i);
 assert.match(prior?.brief,/porcelanato/i);
 assert.equal(selectedAcuRequest('completar todas las partidas',line),null);
 assert.equal(selectedAcuRequest('agregá porcelanato a la biblioteca',line),null);
 assert.equal(selectedAcuRequest('crear partida de baños 35m2',line),null);
 assert.equal(selectedAcuRequest('No cargues materiales',line),null);
 assert.equal(selectedAcuRequest('cargar insumos',null),null);
});

test('sí agregalos is a single-line append based on named missing materials, not an ACU replacement',()=>{
 const line={id:acuLineId,description:'Revestimiento de baños',components:[{resource_id:'tile',quantity:'1'},{resource_id:'labor',quantity:'1'}]};
 const messages=[
  {role:'user',content:'y qué me falta?'},
  {role:'assistant',answer:'El catálogo local tiene porcelanatos y colocación, pero faltan adhesivos y pastinas; especificá si querés buscarlos.'}
 ];
 const request=affirmativeMissingMaterialRequest('si agregalos',messages,line);
 assert.equal(request?.mode,'fill');
 assert.equal(request?.operation,'append');
 assert.deepEqual(request?.lineIds,[acuLineId]);
 assert.match(request.brief,/adhesivo/);
 assert.match(request.brief,/pastina/);
 assert.match(request.brief,/conserva/i);
 assert.equal(affirmativeMissingMaterialRequest('si agregalos',messages,null),null);
 assert.equal(affirmativeMissingMaterialRequest('si agregalos',[{role:'assistant',answer:'Podés agregar insumos.'}],line),null);
 assert.equal(affirmativeMissingMaterialRequest('si agregalos',[{role:'assistant',answer:'Faltan pastina.',approval:{state:'done'}}],line),null);
 assert.equal(affirmativeMissingMaterialRequest('si sacalos',messages,line),null);
});

test('conversational target remains fixed until the user explicitly refers to a newly selected line',()=>{
 const lines=[{id:acuLineId,description:'Revestimiento de baños'},{id:'other',description:'Excavación'}];
 assert.equal(contextualAcuLine('y qué me falta?',{selectedLineId:'other',focusLineId:acuLineId,lines}).id,acuLineId);
 assert.equal(contextualAcuLine('agregá los disponibles',{selectedLineId:'other',focusLineId:acuLineId,lines}).id,acuLineId);
 assert.equal(contextualAcuLine('a esta partida seleccionada',{selectedLineId:'other',focusLineId:acuLineId,lines}).id,'other');
 assert.equal(contextualAcuLine('qué falta?',{selectedLineId:'other',focusLineId:'deleted-line',lines}).id,'other');
});
test('short natural replies reuse the current library advice, not every empty budget line',()=>{
 const advice={line_id:acuLineId,available:[{category:'adhesivo de colocación',candidates:[{description:'Adhesivo Klaucol',id:'glue'}]}],not_found:['pastina para juntas']};
 for(const question of ['si agregalos','agregá los disponibles','cargá los que encontraste','dale sumalos']){
  const request=availableCatalogFollowup(question,advice);
  assert.equal(request?.mode,'fill',question);
  assert.equal(request?.operation,'append',question);
  assert.deepEqual(request?.lineIds,[acuLineId],question);
  assert.match(request.brief,/Adhesivo Klaucol/);
  assert.match(request.brief,/pastina para juntas/);
 }
 assert.equal(availableCatalogFollowup('no los agregues',advice),null);
 assert.equal(availableCatalogFollowup('agregá porcelanato a esta partida',advice),null);
 assert.equal(availableCatalogFollowup('agregá todo menos el adhesivo',advice),null);
 assert.equal(availableCatalogFollowup('si agregalos',{...advice,available:[]}),null);
});
