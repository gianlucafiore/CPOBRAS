import {test,expect} from '@playwright/test';

const projectId='60000000-0000-4000-8000-000000000001';
const estimateId='60000000-0000-4000-8000-000000000002';
const existingId='60000000-0000-4000-8000-000000000003';
const otherId='60000000-0000-4000-8000-000000000004';
const brickId='60000000-0000-4000-8000-000000000011';
const mortarId='60000000-0000-4000-8000-000000000012';
const woodId='60000000-0000-4000-8000-000000000013';
const sheetId='60000000-0000-4000-8000-000000000014';
const criteria='Quiero presupuestar un tabique de ladrillo común de 250 m2 con 20 ladrillos por m2 y mortero incluido';
const createBrief=criteria+'. Crear una partida nueva con su ACU, con insumos y precios reales del catálogo; conservar los 250 m2 y el consumo indicado de 20 ladrillos por m2.';

// Exercise the real chat, approval routing and ACU runner. Only IPC is mocked;
// these scenarios never contact a provider or write an actual project database.
async function approvalFixture(page,{scenario='create'}={}){
 const dialogs=[];page.on('dialog',dialog=>{dialogs.push(dialog.type());void dialog.dismiss();});
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:`
  import './style.css';import {createAiAssistant} from './components/ai-assistant.js';
  const resources=[
   {id:${JSON.stringify(brickId)},code:'MAT-LAD',description:'Ladrillo común',unit:'un',kind:'material',price:'50',price_source:'catálogo:price-brick',effective_date:'2026-11-01'},
   {id:${JSON.stringify(mortarId)},code:'MAT-MOR',description:'Mortero preparado',unit:'kg',kind:'material',price:'20',price_source:'catálogo:price-mortar',effective_date:'2026-11-01'},
   {id:${JSON.stringify(woodId)},code:'MAT-MAD',description:'Madera para obrador',unit:'m',kind:'material',price:'500',price_source:'presupuesto'},
   {id:${JSON.stringify(sheetId)},code:'MAT-CHA',description:'Chapa galvanizada',unit:'m2',kind:'material',price:'1000',price_source:'catálogo:price-sheet',effective_date:'2026-11-01'}
  ];
  const line=(id,description,quantity,components=[])=>({id,description,unit:'un',quantity,unit_cost:components.length?'1500':'0',analysis_id:components.length?'60000000-0000-4000-8000-000000000021':null,expected_recipe:components.length?JSON.stringify({components}):null,section_id:null,section:'',components,takeoffs:[],formula:null});
  const previousWood={resource_id:${JSON.stringify(woodId)},description:'Madera para obrador',quantity:'3'};
  const initialLines=${JSON.stringify(scenario)}==='append'
   ? [line(${JSON.stringify(existingId)},'Armado de obrador','5',[previousWood]),line(${JSON.stringify(otherId)},'Limpieza de terreno','100')]
   : ${JSON.stringify(scenario)}==='invalid'?[line(${JSON.stringify(existingId)},'Partida existente','10')]:[];
  const state={view:'workspace',projectId:${JSON.stringify(projectId)},estimateId:${JSON.stringify(estimateId)},projects:[{id:${JSON.stringify(projectId)},currency:'ARS'}],estimates:[{id:${JSON.stringify(estimateId)},title:'Presupuesto del tabique',currency:'ARS',issued:false}],lines:initialLines,sections:[],assignments:{},selectedLineId:initialLines[0]?.id||null,panel:'acu',search:''};
  const harness={state,calls:[],batches:[],opens:[],loads:[],modalCalls:0,ready:false};window.__createApprovalHarness=harness;
  const render=()=>{
   const app=document.querySelector('#app');app.replaceChildren();
   const heading=document.createElement('h2');heading.textContent='Presupuesto del tabique';app.append(heading);
   for(const item of state.lines){const row=document.createElement('div');row.className='line-row';row.dataset.id=item.id;row.textContent=item.description+' · '+item.quantity+' '+item.unit;app.append(row);}
  };
  const invoke=async(name,args={})=>{
   harness.calls.push({name,args:structuredClone(args)});
   if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
   if(name==='ai_cancel')return null;
   if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,total:resources.length,resources:structuredClone(resources)};
   if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
   if(name==='assisted_acu_references')return [];
   if(name==='ai_chat'){
    if(args.messages.at(-1)?.content==='Quiero crear una partida distinta pero todavía no tengo sus datos')return {text:JSON.stringify({answer:'Indicame los datos de ese nuevo trabajo.'}),input_tokens:20,output_tokens:10};
    if(args.mode==='plan')return {text:JSON.stringify({answer:'FALSO_PROVIDER_GUARDADO',proposal_lines:[{description:'Tabique de ladrillo común',unit:'m²',quantity:'250',unit_price:null,section:'Mampostería'}]}),input_tokens:40,output_tokens:40};
    if(args.mode==='acu'){
     const context=JSON.parse(args.context);
     return {text:JSON.stringify({answer:'FALSO_PROVIDER_GUARDADO',acu_proposals:context.targets.map(target=>({line_id:target.line_id,section:target.section||'Mampostería',components:${JSON.stringify(scenario)}==='append'
      ? [{resource_id:${JSON.stringify(sheetId)},quantity:'10',quantity_unit:'m2',requested_description:'Chapa galvanizada',consumption_support:'50 m2 totales divididos por 5 unidades de la partida: 10 m2 por unidad.'}]
      : [{resource_id:${JSON.stringify(brickId)},quantity:'20',quantity_unit:'un',requested_description:'Ladrillo común',consumption_support:'Dato indicado por el usuario: 20 ladrillos por cada m2.',unit_price:'999999'},{resource_id:${JSON.stringify(mortarId)},quantity:'5',quantity_unit:'kg',requested_description:'Mortero preparado',consumption_support:'Consumo estimativo de 5 kg por m2, sujeto a ajuste posterior.'}],measurements:[],assumptions:['Se conservan las cantidades del pedido y los precios locales.'],missing_resources:[]}))}),input_tokens:50,output_tokens:50};
    }
    return {text:JSON.stringify(${JSON.stringify(scenario)}==='invalid'
     ? {answer:'Se creó y guardó la partida FALSO_PROVIDER_GUARDADO.',acu_request:{mode:'create',brief:${JSON.stringify(createBrief)},line_ids:[${JSON.stringify(existingId)}]}}
     : {answer:'Puedo preparar ese tabique con su ACU y los insumos reales del catálogo.',acu_request:{mode:'create',brief:${JSON.stringify(createBrief)},line_ids:[]}}),input_tokens:30,output_tokens:30};
   }
   if(name==='apply_reviewed_budget_batch'){
    const batch=structuredClone(args.batch);harness.batches.push(batch);
    for(const created of batch.creates)state.lines.push({...line(created.id,created.description,created.quantity),unit:created.unit});
    for(const acu of batch.acus){const existing=state.lines.find(item=>item.id===acu.line_id);if(!existing)throw new Error('The approved ACU must refer to its created or existing line');existing.components=structuredClone(acu.components);existing.analysis_id='60000000-0000-4000-8000-000000000022';existing.unit_cost=${JSON.stringify(scenario)}==='append'?'11500':'1100';}
    return {updated:batch.updates.length,created:batch.creates.length,deleted:batch.deletes.length,composed:batch.acus.length};
   }
   throw new Error('Unexpected native command: '+name);
  };
  const assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{harness.modalCalls++;throw new Error('Conversational approval must not open a modal');},editable:()=>true,
   loadEstimate:async()=>{harness.loads.push(state.estimateId);render();},loadEstimates:async()=>{},
   openEstimate:async(id,selectedLineId)=>{harness.opens.push({estimateId:id,lineId:selectedLineId});state.estimateId=id;state.selectedLineId=selectedLineId||null;state.view='workspace';render();}
  });
  harness.assistant=assistant;render();harness.ready=true;
 `}));
 await page.goto('/');await page.waitForFunction(()=>window.__createApprovalHarness?.ready);
 await page.locator('.ai-launch').click();await expect(page.locator('#ai-settings')).toHaveCount(0);
 await page.locator('[name=ai-consent]').check();return {dialogs};
}
async function ask(page,question){await page.locator('#ai-prompt').fill(question);await page.locator('#ai-question button').click();}
async function counts(page){return page.evaluate(()=>({aiCalls:window.__createApprovalHarness.calls.filter(call=>call.name==='ai_chat').length,writes:window.__createApprovalHarness.batches.length}));}

for(const approval of ['apruebo directamente','sí, apruebo']){
 test(`create approval «${approval}» keeps the user's quantities, creates one real ACU and reports visibility locally`,async({page})=>{
  const {dialogs}=await approvalFixture(page);
  await ask(page,criteria);
  await expect(page.getByRole('button',{name:'Preparar listado de insumos',exact:true})).toBeVisible();
  await expect(page.locator('.ai-transcript')).toContainText('Preparar partidas nuevas con ACU');
  expect(await counts(page)).toEqual({aiCalls:1,writes:0});
  await ask(page,approval);
  await expect(page.locator('.ai-ingredient-preview')).toContainText('Ladrillo común');
  expect(await counts(page)).toEqual({aiCalls:3,writes:0});
  await ask(page,'apruebo directamente');
  await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
  await expect(page.locator('.ai-approval-status')).toContainText('1 partida nueva creada');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ai-transcript')).not.toContainText('FALSO_PROVIDER_GUARDADO');
  const result=await page.evaluate(()=>({calls:window.__createApprovalHarness.calls,batches:window.__createApprovalHarness.batches,modalCalls:window.__createApprovalHarness.modalCalls,lines:window.__createApprovalHarness.state.lines}));
  expect(result.batches).toHaveLength(1);expect(result.modalCalls).toBe(0);expect(dialogs).toEqual([]);
  const batch=result.batches[0];expect(batch.updates).toEqual([]);expect(batch.deletes).toEqual([]);
  expect(batch.creates).toHaveLength(1);expect(batch.creates[0].quantity).toBe('250');expect(batch.creates[0].unit).toBe('m²');
  expect(batch.acus).toHaveLength(1);expect(batch.acus[0].line_id).toBe(batch.creates[0].id);expect(batch.acus[0].measurements).toBeNull();
  expect(batch.acus[0].components).toEqual(expect.arrayContaining([
   expect.objectContaining({resource_id:brickId,quantity:'20',expected_resource:expect.objectContaining({id:brickId,price:'50'})}),
   expect.objectContaining({resource_id:mortarId,quantity:'5',expected_resource:expect.objectContaining({id:mortarId,price:'20'})})
  ]));
  expect(batch.acus[0].components).toHaveLength(2);
  const providerCalls=result.calls.filter(call=>call.name==='ai_chat');expect(providerCalls.map(call=>call.args.mode||'chat')).toEqual(['chat','plan','acu']);
  expect(providerCalls[1].args.messages[0].content).toContain(criteria);
  expect(JSON.parse(providerCalls[2].args.context).targets[0].quantity).toBe('250');
  expect(providerCalls[2].args.messages[0].content).toContain('20 ladrillos por m2');
  expect(result.lines).toHaveLength(1);expect(result.lines[0].id).toBe(batch.creates[0].id);

  const saved=await counts(page);
  await ask(page,'no la veo');await expect(page.locator('#ai-prompt')).toHaveValue('');
  await expect(page.getByRole('button',{name:'Ver en presupuesto',exact:true}).last()).toBeVisible();
  expect(await counts(page)).toEqual(saved);
  await expect(page.locator('.ai-transcript')).toContainText('1 partida');
  await ask(page,'apruebo directamente');await expect(page.locator('#ai-prompt')).toHaveValue('');
  expect(await counts(page)).toEqual(saved);
  await page.getByRole('button',{name:'Ver en presupuesto',exact:true}).last().click();
  const opened=await page.evaluate(()=>window.__createApprovalHarness.opens.at(-1));
  expect(opened).toEqual({estimateId,lineId:batch.creates[0].id});
  await expect(page.locator(`#app .line-row[data-id="${batch.creates[0].id}"]`)).toContainText('250 m²');
 });
}

test('a malformed create handoff cannot claim success or turn an approval into another provider call',async({page})=>{
 const {dialogs}=await approvalFixture(page,{scenario:'invalid'});
 await ask(page,criteria);
 await expect(page.locator('#ai-prompt')).toHaveValue('');
 await expect(page.locator('.ai-transcript')).not.toContainText('FALSO_PROVIDER_GUARDADO');
 await expect(page.locator('[data-ai=approve-load]')).toHaveCount(0);
 await expect(page.locator('[data-ai=review-acu-request]')).toHaveCount(0);
 const before=await counts(page);expect(before).toEqual({aiCalls:1,writes:0});
 await ask(page,'apruebo directamente');await expect(page.locator('#ai-prompt')).toHaveValue('');
 expect(await counts(page)).toEqual(before);
 const result=await page.evaluate(()=>({lines:window.__createApprovalHarness.state.lines,modalCalls:window.__createApprovalHarness.modalCalls}));
 expect(result.lines).toHaveLength(1);expect(result.lines[0].id).toBe(existingId);expect(result.modalCalls).toBe(0);
 await expect(page.getByRole('dialog')).toHaveCount(0);expect(dialogs).toEqual([]);
});

test('an unrelated request without an executable proposal cannot approve an older pending load',async({page})=>{
 await approvalFixture(page);
 await ask(page,criteria);
 await expect(page.getByRole('button',{name:'Preparar listado de insumos',exact:true})).toBeVisible();
 await ask(page,'Quiero crear una partida distinta pero todavía no tengo sus datos');
 await expect(page.locator('.ai-transcript')).toContainText('Indicame los datos de ese nuevo trabajo.');
 const before=await counts(page);expect(before).toEqual({aiCalls:2,writes:0});
 await ask(page,'apruebo directamente');await expect(page.locator('#ai-prompt')).toHaveValue('');
 expect(await counts(page)).toEqual(before);
 await expect(page.locator('.ai-usage').first()).toContainText('La propuesta anterior no se cargó');
});

test('an approved addition of sheet material targets one existing line and preserves its current composition',async({page})=>{
 const {dialogs}=await approvalFixture(page,{scenario:'append'});
 const beforeOther=await page.evaluate(()=>structuredClone(window.__createApprovalHarness.state.lines[1]));
 await ask(page,'Agregá 50 m2 de chapa a la partida Armado de obrador');
 await expect(page.locator('.ai-ingredient-preview')).toContainText('Chapa galvanizada');
 await ask(page,'apruebo directamente');
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 const result=await page.evaluate(()=>({batches:window.__createApprovalHarness.batches,calls:window.__createApprovalHarness.calls,lines:window.__createApprovalHarness.state.lines,modalCalls:window.__createApprovalHarness.modalCalls}));
 expect(result.batches).toHaveLength(1);const batch=result.batches[0];
 expect(batch.creates).toEqual([]);expect(batch.updates).toEqual([]);expect(batch.deletes).toEqual([]);expect(batch.acus).toHaveLength(1);
 expect(batch.acus[0].line_id).toBe(existingId);expect(batch.acus[0].expected.quantity).toBe('5');expect(batch.acus[0].measurements).toBeNull();
 expect(batch.acus[0].components).toEqual(expect.arrayContaining([
  expect.objectContaining({resource_id:woodId,quantity:'3'}),
  expect.objectContaining({resource_id:sheetId,quantity:'10',expected_resource:expect.objectContaining({id:sheetId,unit:'m2',price:'1000'})})
 ]));
 expect(batch.acus[0].components).toHaveLength(2);expect(result.lines[0].quantity).toBe('5');expect(result.lines[1]).toEqual(beforeOther);
 expect(result.calls.filter(call=>call.name==='ai_chat').map(call=>call.args.mode)).toEqual(['acu']);
 expect(result.modalCalls).toBe(0);expect(dialogs).toEqual([]);await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('floating AI console can be moved, resized, made transparent and restored after reload',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await approvalFixture(page);
  const frame=page.locator('#ai-console');
  const original=await frame.boundingBox();
  expect(original).not.toBeNull();
  await page.locator('[data-ai="settings"]').click();
  const slider=page.locator('[name="ai-transparency"]');
  await slider.evaluate(element=>{element.value='60';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(page.locator('[data-ai-transparency-value]')).toHaveText('60%');
  await expect(frame).toHaveCSS('background-color','rgba(17, 24, 31, 0.4)');
  await page.locator('[data-ai="settings"]').click();

  let current=await frame.boundingBox();
  await page.mouse.move(current.x+55,current.y+18);
  await page.mouse.down();
  await page.mouse.move(current.x+125,current.y-82,{steps:8});
  await page.mouse.up();
  const moved=await frame.boundingBox();
  expect(moved.x).toBeGreaterThan(current.x+40);
  expect(moved.y).toBeLessThan(current.y-70);
  current=moved;

  await page.mouse.move(current.x+3,current.y+current.height/2);
  await page.mouse.down();
  await page.mouse.move(current.x+103,current.y+current.height/2,{steps:8});
  await page.mouse.up();
  const resized=await frame.boundingBox();
  expect(resized.x).toBeGreaterThan(current.x+70);
  expect(resized.width).toBeLessThan(current.width-70);

  await page.reload();
  await page.waitForFunction(()=>window.__createApprovalHarness?.ready);
  await page.locator('.ai-launch').click();
  const restored=await page.locator('#ai-console').boundingBox();
  expect(Math.abs(restored.x-resized.x)).toBeLessThan(3);
  expect(Math.abs(restored.y-resized.y)).toBeLessThan(3);
  expect(Math.abs(restored.width-resized.width)).toBeLessThan(3);
  expect(Math.abs(restored.height-resized.height)).toBeLessThan(3);
  await page.locator('[data-ai="settings"]').click();
  await expect(page.locator('[name="ai-transparency"]')).toHaveValue('60');
  await page.locator('[data-ai="reset-window"]').click();
  await expect(page.locator('#ai-console')).not.toHaveClass(/ai-floating/);
  await expect(page.locator('#ai-console')).toHaveCSS('background-color','rgba(17, 24, 31, 0.4)');
});


test('Enter sends chat immediately and Shift+Enter only inserts a newline',async({page})=>{
  await approvalFixture(page);
  const input=page.locator('#ai-prompt');
  await input.fill('4+5');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('4+5\n');
  expect(await counts(page)).toEqual({aiCalls:0,writes:0});

  await input.fill('4+5');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.locator('.ai-transcript .ai-assistant').last()).toContainText('9');
  expect(await counts(page)).toEqual({aiCalls:0,writes:0});

  await input.fill('10+2');
  await input.press('Control+Enter');
  await expect(input).toHaveValue('');
  await expect(page.locator('.ai-transcript .ai-assistant').last()).toContainText('12');
  expect(await counts(page)).toEqual({aiCalls:0,writes:0});
});


const RESOURCE_CHAT_FIXTURE="\n  import './style.css';\n  import {createAiAssistant} from './components/ai-assistant.js';\n  const resources=[],calls=[],imports=[];\n  const state={view:'resources',projectId:null,estimateId:null,projects:[],estimates:[],\n    resources,lines:[],sections:[],database:{scope:'test-resources'},remoteProject:false};\n  const invoke=async(name,args={})=>{\n    calls.push({name,args:structuredClone(args)});\n    if(name==='ai_status')return {provider:'openai',model:'test-model',configured:true};\n    if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,resources:structuredClone(resources)};\n    if(name==='import_resources'){\n      imports.push(structuredClone(args));\n      for(const row of args.rows)resources.push({...row,id:crypto.randomUUID()});\n      return {created:args.rows.length,resource_ids:args.rows.map(()=>crypto.randomUUID())};\n    }\n    if(name==='ai_chat')return {text:JSON.stringify(args.mode==='resources'?\n      {answer:'Revisión de insumos para cercado',resource_proposals:[\n        {description:'Poste de madera 3\" x 2,2m',kind:'material',unit:'unidad'},\n        {description:'Alambre galvanizado',kind:'material',unit:'kg'}\n      ]}:{answer:'Para cercado recomiendo postes de madera y alambre galvanizado. ¿Querés agregar esos insumos?' }),\n      input_tokens:70,output_tokens:40};\n    if(name==='ai_cancel')return null;\n    throw Error('Unexpected command '+name);\n  };\n  const assistant=createAiAssistant({invoke,state,document,window,editable:()=>false,\n    loadEstimate:async()=>{},loadEstimates:async()=>{},openEstimate:async()=>{},\n    reloadCatalog:async()=>{},openModal:()=>{}});\n  window.__resourceChatHarness={state,resources,calls,imports,assistant,ready:true};\n";

test('resource chat remembers price and unit, reviews in-chat and saves only after approval',async({page})=>{
  await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:RESOURCE_CHAT_FIXTURE}));
  await page.goto('/');
  await page.waitForFunction(()=>window.__resourceChatHarness?.ready);
  await page.locator('.ai-launch').click();
  await page.locator('[name=ai-consent]').check();
  const say=async phrase=>{await page.locator('#ai-prompt').fill(phrase);await page.locator('#ai-question button').click();};
  await say('Poste de madera 3" x 2,2m , precio: 17500');
  await expect(page.locator('.ai-resource-chat-card')).toContainText('17500 ARS');
  await expect(page.locator('.ai-resource-chat-card')).toContainText('Poste de madera');
  await expect(page.locator('[data-ai=approve-resources]')).toBeDisabled();
  await say('es material, la unidad es: unidad');
  await expect(page.locator('.ai-resource-chat-card')).toContainText('17500 ARS');
  await expect(page.locator('[data-ai=approve-resources]')).toBeEnabled();
  await say('el precio es 17500');
  await expect(page.locator('.ai-resource-chat-card')).toContainText('17500 ARS');
  expect(await page.evaluate(()=>window.__resourceChatHarness.imports.length)).toBe(0);
  await say('perfecto cargalo');
  await expect(page.locator('.ai-transcript')).toContainText('Guardado confirmado');
  const stored=await page.evaluate(()=>window.__resourceChatHarness.imports);
  expect(stored).toHaveLength(1);
  expect(stored[0].rows).toEqual([{
    code:'',description:'Poste de madera 3" x 2,2m',kind:'material',unit:'unidad',price:'17500'
  }]);
  expect(await page.evaluate(()=>window.__resourceChatHarness.calls.filter(c=>c.name==='ai_chat').length)).toBe(0);

  await say('¿Hay insumos para cercado con alambrado?');
  await expect(page.locator('.ai-transcript')).toContainText('¿Querés agregar esos insumos?');
  await say('si dale');
  await expect(page.locator('.ai-resource-chat-card li')).toHaveCount(2);
  await expect(page.locator('[data-ai=approve-resources]')).toBeDisabled(); // poste ya existe
  const modes=await page.evaluate(()=>window.__resourceChatHarness.calls.filter(c=>c.name==='ai_chat').map(c=>c.args.mode||'chat'));
  // The previously enumerated suggestions are now converted locally,
  // rather than burning a second AI call to re-generate the same items.
  expect(modes).toEqual(['chat']);
  expect(await page.evaluate(()=>window.__resourceChatHarness.imports.length)).toBe(1);
});


test('complete fence list from one chat message saves exactly three correctly priced resources',async({page})=>{
  await page.route('**/src/main.js*',route=>route.fulfill({
    contentType:'application/javascript',body:RESOURCE_CHAT_FIXTURE
  }));
  await page.goto('/');
  await page.waitForFunction(()=>window.__resourceChatHarness?.ready);
  await page.locator('.ai-launch').click();
  await page.locator('[name=ai-consent]').check();
  const say=async phrase=>{await page.locator('#ai-prompt').fill(phrase);await page.locator('#ai-question button').click();};
  await say('necesitamos los insumos para cerco de tejido romboidal: Mano de obra: 50.000 x m2 Poste de 3" x 2.2m a 17.500 cada uno tejido romboidal a 1500 xm2');
  await expect(page.locator('.ai-resource-chat-card li')).toHaveCount(3);
  await expect(page.locator('.ai-resource-chat-card')).toContainText('50000 ARS');
  await expect(page.locator('.ai-resource-chat-card')).toContainText('17500 ARS');
  await expect(page.locator('.ai-resource-chat-card')).toContainText('1500 ARS');
  await expect(page.locator('[data-ai=approve-resources]')).toBeEnabled();
  expect(await page.evaluate(()=>window.__resourceChatHarness.calls.filter(c=>c.name==='ai_chat').length)).toBe(0);
  // A review is mutable: removal must not destroy the other confirmed prices.
  await say('agrega cemento por bolsa');
  await expect(page.locator('.ai-resource-chat-card li')).toHaveCount(4);
  await say('quita el insumo de cemento');
  await expect(page.locator('.ai-resource-chat-card li')).toHaveCount(3);
  await expect(page.locator('[data-ai=approve-resources]')).toBeEnabled();
  await say('bien cargalo');
  await expect(page.locator('.ai-transcript')).toContainText('Guardado confirmado');
  const result=await page.evaluate(()=>window.__resourceChatHarness.imports);
  expect(result).toHaveLength(1);
  expect(result[0].rows).toEqual([
    {code:'',description:'Mano de obra para cerco de tejido romboidal',kind:'labor',unit:'m²',price:'50000'},
    {code:'',description:'Poste de 3" x 2.2m',kind:'material',unit:'unidad',price:'17500'},
    {code:'',description:'tejido romboidal',kind:'material',unit:'m²',price:'1500'}
  ]);
});


test('resource pronoun "necesito crearlos" prepares a card after an empty catalog reply',async({page})=>{
  const fixture=RESOURCE_CHAT_FIXTURE.replace(
    'Para cercado recomiendo postes de madera y alambre galvanizado. ¿Querés agregar esos insumos?',
    'No se encontraron insumos específicos para cercado con tejido romboidal en el catálogo local. Por favor precisá más detalles.'
  );
  await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:fixture}));
  await page.goto('/');
  await page.waitForFunction(()=>window.__resourceChatHarness?.ready);
  await page.locator('.ai-launch').click();
  await page.locator('[name=ai-consent]').check();
  const say=async value=>{await page.locator('#ai-prompt').fill(value);await page.locator('#ai-question button').click();};
  await say('necesito los insumos para cercado de terreno con tejido romboildal');
  await expect(page.locator('.ai-transcript')).toContainText('No se encontraron insumos');
  await say('necesito crearlos');
  await expect(page.locator('.ai-resource-chat-card li')).toHaveCount(2);
  await expect(page.locator('.ai-resource-chat-card')).toContainText('Poste de madera');
  await expect(page.locator('.ai-resource-chat-card')).toContainText('Alambre galvanizado');
  const modes=await page.evaluate(()=>window.__resourceChatHarness.calls.filter(c=>c.name==='ai_chat').map(c=>c.args.mode||'chat'));
  expect(modes).toEqual(['chat','resources']);
  expect(await page.evaluate(()=>window.__resourceChatHarness.imports.length)).toBe(0);
});

test('resource pronoun "podes crearlos" immediately turns last enumerated advice into in-chat review',async({page})=>{
  const recommendation='Para un cercado con tejido romboidal se necesitan postes (metal o madera), tensores, alambre para amarre, tensores, bridas o precintos, y el rollo de tejido romboidal. También podría ser necesario concreto para fijar postes y herramientas.';
  const fixture=RESOURCE_CHAT_FIXTURE.replace(
    'Para cercado recomiendo postes de madera y alambre galvanizado. ¿Querés agregar esos insumos?',
    recommendation
  );
  await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:fixture}));
  await page.goto('/');
  await page.waitForFunction(()=>window.__resourceChatHarness?.ready);
  await page.locator('.ai-launch').click();
  await page.locator('[name=ai-consent]').check();
  const say=async value=>{await page.locator('#ai-prompt').fill(value);await page.locator('#ai-question button').click();};
  await say('me decís que insumos necesitamos para cercado con tejido romboidal');
  await expect(page.locator('.ai-transcript')).toContainText('se necesitan postes');
  await say('podes crearlos');
  await expect(page.locator('.ai-resource-chat-card li')).toHaveCount(5);
  await expect(page.locator('.ai-resource-chat-card')).toContainText('postes (metal o madera)');
  await expect(page.locator('.ai-resource-chat-card')).toContainText('rollo de tejido romboidal');
  await expect(page.locator('[data-ai=approve-resources]')).toBeDisabled();
  // No model reinference and absolutely no SQLite write. Ambiguities need review.
  const modes=await page.evaluate(()=>window.__resourceChatHarness.calls.filter(c=>c.name==='ai_chat').map(c=>c.args.mode||'chat'));
  expect(modes).toEqual(['chat']);
  expect(await page.evaluate(()=>window.__resourceChatHarness.imports.length)).toBe(0);
});
