import {test,expect} from '@playwright/test';

const firstLineId='30000000-0000-4000-8000-000000000001';
const secondLineId='30000000-0000-4000-8000-000000000002';
const mortarId='30000000-0000-4000-8000-000000000003';
const blockId='30000000-0000-4000-8000-000000000004';
const bagId='30000000-0000-4000-8000-000000000005';
const approvedPrompt='Completá los ACU de las partidas existentes con los insumos y rendimientos necesarios. Conservá sus cantidades y metrados. Para revoques usar 15 mm de espesor; no sustituir ladrillos cerámicos por bloques de cemento.';

// The real chat, ACU workbench and approved-plan runner are exercised together.
// Only native IPC is replaced: no provider, real database or project is used.
async function approvedFixture(page,{invalid='missing',deferred=false,kind='acu',unified=false}={}){
 const dialogs=[];
 page.on('dialog',dialog=>{dialogs.push(dialog.type());void dialog.dismiss();});
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:`
  import './style.css';
  import {createAiAssistant} from './components/ai-assistant.js';
  const resources=[
   {id:${JSON.stringify(mortarId)},code:'MAT-001',description:'Mortero',unit:'kg',kind:'material',price:'20',price_source:'catálogo:mortar-price'},
   {id:${JSON.stringify(blockId)},code:'MAT-002',description:'Bloque de cemento 20x20x40',unit:'un',kind:'material',price:'100',price_source:'catálogo:block-price'},
   {id:${JSON.stringify(bagId)},code:'MAT-003',description:'Cemento Portland x25kg',unit:'bolsa',kind:'material',price:'2500',price_source:'catálogo:bag-price'},
  ];
  const line=(id,description,quantity)=>({id,description,unit:'m²',quantity,unit_cost:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',components:[],takeoffs:[{id:'takeoff-'+id,note:'Medición existente',factor:'1',length:'6',width:'1',height:'7',sign:1}],formula:null});
  const state={view:'workspace',projectId:'project-1',estimateId:'estimate-1',projects:[{id:'project-1',currency:'ARS'}],estimates:[{id:'estimate-1',title:'Presupuesto de aprobación',currency:'ARS',issued:false}],lines:[line(${JSON.stringify(firstLineId)},'Revoque grueso','42'),line(${JSON.stringify(secondLineId)},${JSON.stringify(invalid==='material'?'Mampostería de ladrillo cerámico 12x30x18':'Revoque fino')},'73.50')],sections:[],assignments:{},selectedLineId:${JSON.stringify(firstLineId)},panel:'summary',search:'filtro anterior'};
  if(${unified})for(let i=2;i<81;i++)state.lines.push(line('extra-'+i,'Otra partida '+i,'1'));
  let failOnce=${unified};
  const harness={state,calls:[],batches:[],loads:[],modalCalls:0,release:null,aiResolved:false,ready:false};window.__approvedHarness=harness;
  harness.initialLines=structuredClone(state.lines);
  const renderBudget=()=>{const app=document.querySelector('#app');app.replaceChildren();for(const item of state.lines){const row=document.createElement('div');row.dataset.lineId=item.id;row.textContent=item.description+' · '+item.quantity+' '+item.unit;app.append(row);}};
  const component=(resource_id,quantity,quantity_unit,requested_description)=>({resource_id,quantity,quantity_unit,requested_description,consumption_support:'Estimación explícita por m² de partida, con espesor de 15 mm y desperdicio incluido.'});
  const invoke=async(name,args={})=>{
   harness.calls.push({name,args:structuredClone(args)});
   if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
   if(name==='ai_cancel')return null;
   if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,resources:structuredClone(resources)};
   if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
   if(name==='assisted_acu_references')return [];
   if(name==='ai_chat'){
    if(${JSON.stringify(kind)}==='plan'){
     if(args.mode==='acu')throw new Error('A generic line proposal must not generate ACU');
     return {text:JSON.stringify({answer:'Dos partidas nuevas para agregar.',proposal_lines:[{description:'Limpieza inicial',unit:'m²',quantity:'20',unit_price:'123.45',section:'Preliminares'},{description:'Replanteo inicial',unit:'m²',quantity:null,unit_price:null,section:'Preliminares'}]}),input_tokens:30,output_tokens:30};
    }
    if(args.mode!=='acu')throw new Error('A direct ACU request must not call chat before approval');
    if(failOnce){failOnce=false;throw Error('No se pudo establecer la conexión HTTPS');}
    const context=JSON.parse(args.context);
    const proposals=context.targets.map(target=>{
     let components=[component(${JSON.stringify(mortarId)},'0.25','kg','Mortero')],missing_resources=[];
     if(target.line_id===${JSON.stringify(secondLineId)}){
      if(${JSON.stringify(invalid)}==='missing')missing_resources=['Falta identificar una cal compatible.'];
      if(${JSON.stringify(invalid)}==='material')components=[component(${JSON.stringify(blockId)},'12','un','Ladrillo cerámico hueco 12x30x18')];
      if(${JSON.stringify(invalid)}==='unit')components=[{...component(${JSON.stringify(bagId)},'15','bolsa','Cemento Portland x25kg'),source_quantity:'15',source_unit:'kg'}];
      if(${JSON.stringify(invalid)}==='legacy')components=[{resource_id:${JSON.stringify(mortarId)},quantity:'0.25'}];
     }
     return {line_id:target.line_id,components,measurements:[{note:'No aplicar esta sugerencia de medición',factor:'2',length:'99',width:'1',height:'99',sign:1}],assumptions:['Consumo orientativo para esta solicitud.'],missing_resources};
    });
    const result={text:JSON.stringify({answer:'Propuestas para la solicitud aprobada.',acu_proposals:proposals}),input_tokens:40,output_tokens:40};
    if(${deferred})return new Promise(resolve=>{harness.release=()=>{harness.release=null;harness.aiResolved=true;resolve(result);};});
    harness.aiResolved=true;return result;
   }
   if(name==='apply_reviewed_budget_batch'){
    const batch=structuredClone(args.batch);harness.batches.push(batch);
    for(const acu of batch.acus||[]){const item=state.lines.find(item=>item.id===acu.line_id);if(!item)throw new Error('Unexpected target');item.components=structuredClone(acu.components);item.unit_cost='5.00';item.analysis_id='private-'+item.id;}
    for(const created of batch.creates)state.lines.push({...created,unit_cost:created.unit_price,components:[],takeoffs:[],analysis_id:null});
    return {updated:batch.updates.length,created:batch.creates.length,deleted:batch.deletes.length,composed:(batch.acus||[]).length};
   }
   throw new Error('Unexpected native command: '+name);
  };
  const loadEstimate=async()=>{harness.loads.push({selectedLineId:state.selectedLineId,panel:state.panel,search:state.search});renderBudget();};
  harness.assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{harness.modalCalls++;throw new Error('Approval must not open a form');},editable:()=>true,loadEstimate,loadEstimates:async()=>{},openEstimate:async(id,lineId)=>{state.estimateId=id;if(lineId)state.selectedLineId=lineId;await loadEstimate();}});
  renderBudget();harness.ready=true;
 `}));
 await page.goto('/');
 await page.waitForFunction(()=>window.__approvedHarness?.ready);
 await page.locator('[data-ai=toggle]').click();
 await page.locator('[name=ai-consent]').check();
 return {dialogs};
}

async function ask(page,question){
 await page.locator('#ai-prompt').fill(question);
 await page.locator('#ai-question button').click();
}

for(const invalid of ['missing','material','unit']){
 test(`chat approval saves compatible ACU once and keeps ${invalid} proposals pending`,async({page})=>{
  const {dialogs}=await approvedFixture(page,{invalid});
  await ask(page,approvedPrompt);
  const approve=page.getByRole('button',{name:'Sí, aprobar y cargar esta lista',exact:true});
  await expect(approve).toBeVisible();
  await expect(page.getByRole('button',{name:'Revisar antes de cargar',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__approvedHarness.batches.length)).toBe(0);
  expect(await page.evaluate(()=>window.__approvedHarness.batches)).toHaveLength(0);

  await expect(page.locator('.ai-ingredient-preview')).toContainText('Mortero');
  expect(await page.evaluate(()=>window.__approvedHarness.batches.length)).toBe(0);
  await approve.click();
  await expect(page.locator('.ai-approval-status')).toContainText(/1 ACU.*1 pendiente/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(approve).toHaveCount(0);
  const result=await page.evaluate(()=>({batches:window.__approvedHarness.batches,lines:window.__approvedHarness.state.lines,initial:window.__approvedHarness.initialLines,calls:window.__approvedHarness.calls,modalCalls:window.__approvedHarness.modalCalls}));
  expect(result.batches).toHaveLength(1);
  const batch=result.batches[0];
  expect(batch.creates).toEqual([]);expect(batch.updates).toEqual([]);expect(batch.deletes).toEqual([]);
  expect(batch.acus).toHaveLength(1);expect(batch.acus[0].line_id).toBe(firstLineId);
  expect(batch.acus[0].expected.quantity).toBe('42');expect(batch.acus[0].measurements).toBeNull();
  expect(batch.acus[0].expected_takeoffs).toEqual(result.initial[0].takeoffs);
  expect(batch.acus[0].components[0].quantity).toBe('0.25');
  expect(batch.acus[0].components[0].expected_resource.price).toBe('20');
  expect(result.lines.map(line=>line.quantity)).toEqual(['42','73.50']);
  expect(result.lines.map(line=>line.takeoffs)).toEqual(result.initial.map(line=>line.takeoffs));
  expect(result.lines[1].components).toEqual([]);
  expect(result.calls.filter(call=>call.name==='ai_chat')).toHaveLength(1);
  expect(result.modalCalls).toBe(0);expect(dialogs).toEqual([]);

  await page.getByRole('button',{name:'Ver pendientes',exact:true}).click();
  const pending=page.locator(`[data-acu-proposal="${secondLineId}"]`);
  await expect(pending).toBeVisible();
  await pending.locator('summary').first().click();
  if(invalid==='missing')await expect(pending.locator('[data-acu-errors]')).toContainText('faltantes');
  if(invalid==='material')await expect(pending.locator('[data-acu-errors]')).toContainText('Material incompatible');
  if(invalid==='unit')await expect(pending.locator('[data-acu-errors]')).toContainText('Consumo de origen incompatible');
  expect(await page.evaluate(()=>window.__approvedHarness.batches)).toHaveLength(1);
 });
}

test('stopping before the provider reply prevents a write even when the late reply arrives',async({page})=>{
 const {dialogs}=await approvedFixture(page,{deferred:true});
 await ask(page,approvedPrompt);
 await page.waitForFunction(()=>typeof window.__approvedHarness.release==='function');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__approvedHarness.batches)).toHaveLength(0);
 await page.getByRole('button',{name:'Detener carga',exact:true}).click();
 await expect(page.locator('.ai-approval-status')).toContainText(/detenida|detuvo|cancel/i);
 expect(await page.evaluate(()=>window.__approvedHarness.batches)).toHaveLength(0);
 await page.evaluate(()=>window.__approvedHarness.release());
 await page.waitForFunction(()=>window.__approvedHarness.aiResolved);
 await expect(page.locator('#ai-question button')).toBeEnabled();
 const after=await page.evaluate(()=>({batches:window.__approvedHarness.batches,lines:window.__approvedHarness.state.lines,initial:window.__approvedHarness.initialLines,calls:window.__approvedHarness.calls}));
 expect(after.batches).toHaveLength(0);expect(after.lines).toEqual(after.initial);
 expect(after.calls.some(call=>call.name==='ai_cancel')).toBe(true);
 expect(dialogs).toEqual([]);
});

for(const closeMethod of ['close button','Escape']){
 test(`closing the chat with ${closeMethod} revokes the pending approval and ignores a late reply after reopening`,async({page})=>{
  const {dialogs}=await approvedFixture(page,{deferred:true});
  await ask(page,approvedPrompt);
   await page.waitForFunction(()=>typeof window.__approvedHarness.release==='function');
  expect(await page.evaluate(()=>window.__approvedHarness.batches)).toHaveLength(0);

  const close=page.locator('#ai-console [data-ai=toggle]');
  if(closeMethod==='Escape')await close.press('Escape');
  else await close.click();
  await expect(page.locator('#ai-console')).toHaveCount(0);
  await page.evaluate(()=>window.__approvedHarness.release());
  await page.waitForFunction(()=>window.__approvedHarness.aiResolved);
  await page.locator('.ai-launch').click();

  await expect(page.locator('#ai-console')).toBeVisible();
  await expect(page.locator('.ai-approval-status')).toContainText(/detenida|detuvo|cancel/i);
  await expect(page.locator('#ai-question button')).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const result=await page.evaluate(()=>({batches:window.__approvedHarness.batches,lines:window.__approvedHarness.state.lines,initial:window.__approvedHarness.initialLines,calls:window.__approvedHarness.calls}));
  expect(result.batches).toHaveLength(0);
  expect(result.lines).toEqual(result.initial);
  expect(result.calls.some(call=>call.name==='ai_cancel')).toBe(true);
  expect(result.calls.filter(call=>call.name==='ai_chat')).toHaveLength(1);
  expect(dialogs).toEqual([]);
 });
}

test('approving a generic line proposal creates only those lines without another AI request or ACU dialog',async({page})=>{
 const {dialogs}=await approvedFixture(page,{kind:'plan'});
 await ask(page,'Creá dos partidas de limpieza y replanteo para esta obra.');
 const approve=page.getByRole('button',{name:'Sí, aprobar y crear partidas',exact:true});
 await expect(approve).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__approvedHarness.batches)).toHaveLength(0);
 expect(await page.evaluate(()=>window.__approvedHarness.calls.filter(call=>call.name==='ai_chat').length)).toBe(1);
 await approve.click();
 await expect(page.locator('.ai-approval-status')).toContainText(/2 partidas nuevas (?:creadas|guardadas)/);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(approve).toHaveCount(0);
 const result=await page.evaluate(()=>({batches:window.__approvedHarness.batches,calls:window.__approvedHarness.calls,lines:window.__approvedHarness.state.lines,initial:window.__approvedHarness.initialLines,modalCalls:window.__approvedHarness.modalCalls}));
 expect(result.batches).toHaveLength(1);
 expect(result.batches[0].creates).toEqual([
  expect.objectContaining({description:'Limpieza inicial',unit:'m²',quantity:'20',unit_price:'123.45',section:'Preliminares'}),
  expect.objectContaining({description:'Replanteo inicial',unit:'m²',quantity:'0',unit_price:'0',section:'Preliminares'}),
 ]);
 expect(result.batches[0].updates).toEqual([]);expect(result.batches[0].deletes).toEqual([]);
 expect(result.batches[0].acus??[]).toEqual([]);
 expect(result.calls.filter(call=>call.name==='ai_chat')).toHaveLength(1);
 expect(result.lines.slice(0,2)).toEqual(result.initial);
 expect(result.modalCalls).toBe(0);expect(dialogs).toEqual([]);
});

test('unified conversation retries HTTPS for one of 81 lines and saves only after preview approval',async({page})=>{
 await approvedFixture(page,{unified:true});
 await ask(page,'generar ACU de la partida seleccionada');
 await expect(page.locator('.ai-transcript')).toContainText('HTTPS');
 expect(await page.evaluate(()=>window.__approvedHarness.batches.length)).toBe(0);
 await page.evaluate(()=>{const h=window.__approvedHarness;h.state.selectedLineId=h.state.lines[1].id;h.state.panel='budget';h.assistant.syncContext();});
 await ask(page,'usá monocapa, hidrófugo y mano de obra');
 await expect(page.getByRole('button',{name:'Sí, aprobar y cargar esta lista',exact:true})).toBeVisible();
 await ask(page,'generalo');
 await expect(page.getByRole('button',{name:'Sí, aprobar y cargar esta lista',exact:true}).last()).toBeVisible();
 expect(await page.evaluate(()=>window.__approvedHarness.batches.length)).toBe(0);
 await ask(page,'bueno cargalos');
 await expect.poll(()=>page.evaluate(()=>window.__approvedHarness.batches.length)).toBe(1);
 const result=await page.evaluate(()=>({batches:window.__approvedHarness.batches,calls:window.__approvedHarness.calls}));
 expect(result.batches[0].acus.map(a=>a.line_id)).toEqual([firstLineId]);
 for(const call of result.calls.filter(c=>c.name==='ai_chat'&&c.args.mode==='acu')){
  expect(JSON.parse(call.args.context).targets.map(t=>t.line_id)).toEqual([firstLineId]);
 }
 await expect(page.locator('.ai-transcript')).not.toContainText('81 pendientes');
});
