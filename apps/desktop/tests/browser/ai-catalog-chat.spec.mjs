import {test,expect} from '@playwright/test';

const lineId='40000000-0000-4000-8000-000000000001';
const toiletId='40000000-0000-4000-8000-000000000002';
const laborId='40000000-0000-4000-8000-000000000003';
const basinId='40000000-0000-4000-8000-000000000004';

// Real chat and ACU orchestration with native IPC isolated from any provider or DB.
async function catalogFixture(page,{handoff=false}={}){
 const dialogs=[];page.on('dialog',dialog=>{dialogs.push(dialog.type());void dialog.dismiss();});
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:`
  import './style.css';import {createAiAssistant} from './components/ai-assistant.js';
  const resources=[
   {id:${JSON.stringify(toiletId)},code:'SAN-01',description:'Inodoro sanitario con mochila',unit:'un',kind:'material',price:'120000',currency:'ARS',price_source:'catálogo:price-toilet',effective_date:'2026-11-01'},
   {id:${JSON.stringify(laborId)},code:'MO-SAN-01',description:'Mano de obra instalación de sanitario',unit:'un',kind:'labor',price:'25000',currency:'ARS',price_source:'catálogo:price-labor',effective_date:'2026-11-02'},
   {id:${JSON.stringify(basinId)},code:'SAN-02',description:'Bacha sanitaria',unit:'un',kind:'material',price:null,currency:'ARS',price_source:'sin precio',effective_date:null}
  ];
  const line={id:${JSON.stringify(lineId)},description:'Instalación de inodoro',unit:'un',quantity:'2',unit_cost:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',components:[],takeoffs:[],formula:null};
  const state={view:'workspace',projectId:'project-1',estimateId:'estimate-1',projects:[{id:'project-1',currency:'ARS'}],estimates:[{id:'estimate-1',title:'Presupuesto sanitario',currency:'ARS',issued:false}],lines:[line],sections:[],assignments:{},selectedLineId:line.id,panel:'acu',search:''};
  const harness={state,calls:[],batches:[],evidence:[],modalCalls:0,ready:false};window.__catalogHarness=harness;
  const render=()=>{document.querySelector('#app').textContent='Presupuesto sanitario · Instalación de inodoro · 2 un';};
  const invoke=async(name,args={})=>{
   harness.calls.push({name,args:structuredClone(args)});
   if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
   if(name==='ai_cancel')return null;
   if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,resources:structuredClone(resources)};
   if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
   if(name==='assisted_acu_references')return [];
   if(name==='ai_chat'){
    if(args.mode==='acu')return {text:JSON.stringify({answer:'ACU con los insumos reales.',acu_proposals:[{line_id:line.id,components:[{resource_id:${JSON.stringify(toiletId)},quantity:'1'},{resource_id:${JSON.stringify(laborId)},quantity:'1'}],measurements:[],assumptions:[],missing_resources:[]}]}),input_tokens:30,output_tokens:30};
    const marker='CATÁLOGO LOCAL CONSULTADO AHORA POR CPOBRAS (datos reales de solo lectura):\\n';
    const start=args.context.indexOf(marker);if(start<0)throw new Error('The general chat must receive current native catalog evidence');
    const evidence=JSON.parse(args.context.slice(start+marker.length));harness.evidence.push(evidence);
    const rows=[...evidence.matches,...evidence.related];
    const answer=${handoff}
     ? {answer:'Para cargarlo tenés que abrir cada partida y completar el formulario.',acu_request:{mode:'fill',brief:'Completar la instalación de inodoro existente con el artefacto y su mano de obra reales del catálogo. Conservar la cantidad de 2 unidades y los metrados.',line_ids:[line.id]},proposal_lines:[{description:'Agregar material',unit:'un'}]}
     : {answer:rows.map(row=>row.description+' · '+row.kind+' · '+row.unit+' · '+(row.price===null?'Sin precio':row.price+' '+row.currency)).join('\\n')};
    return {text:JSON.stringify(answer),input_tokens:30,output_tokens:30};
   }
   if(name==='apply_reviewed_budget_batch'){
    const batch=structuredClone(args.batch);harness.batches.push(batch);line.components=structuredClone(batch.acus[0].components);line.analysis_id='private-sanitary';line.unit_cost='145000';
    return {updated:0,created:batch.creates.length,deleted:0,composed:batch.acus.length};
   }
   throw new Error('Unexpected native command: '+name);
  };
  const assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{harness.modalCalls++;throw new Error('Conversational approval must not open a form');},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async(id,selectedLineId)=>{state.estimateId=id;state.selectedLineId=selectedLineId||line.id;render();}});
  harness.assistant=assistant;render();harness.ready=true;
 `}));
 await page.goto('/');await page.waitForFunction(()=>window.__catalogHarness?.ready);
 await page.locator('.ai-launch').click();await expect(page.locator('#ai-settings')).toHaveCount(0);
 await page.locator('[name=ai-consent]').check();return {dialogs};
}
async function ask(page,question){await page.locator('#ai-prompt').fill(question);await page.locator('#ai-question button').click();}

test('general sanitary questions receive real material and labor prices, units, sources and missing-price evidence without writes',async({page})=>{
 await catalogFixture(page);
 await ask(page,'¿Tenés cargados precios de sanitarios?');
 await expect(page.locator('.ai-transcript')).toContainText('120000 ARS');
 await expect(page.locator('.ai-transcript')).toContainText('25000 ARS');
 await expect(page.locator('.ai-transcript')).toContainText('Bacha sanitaria · material · un · Sin precio');
 const result=await page.evaluate(()=>({calls:window.__catalogHarness.calls,evidence:window.__catalogHarness.evidence,batches:window.__catalogHarness.batches}));
 expect(result.calls.filter(call=>call.name==='ai_catalog_context')).toHaveLength(1);
 expect(result.calls.findIndex(call=>call.name==='ai_catalog_context')).toBeLessThan(result.calls.findIndex(call=>call.name==='ai_chat'));
 const evidence=result.evidence[0],rows=[...evidence.matches,...evidence.related];
 expect(evidence.access).toBe('read_only');expect(evidence.currency).toBe('ARS');
 expect(rows).toEqual(expect.arrayContaining([
  expect.objectContaining({id:toiletId,unit:'un',kind:'material',price:'120000',currency:'ARS',price_source:'catálogo:price-toilet',effective_date:'2026-11-01'}),
  expect.objectContaining({id:laborId,unit:'un',kind:'labor',price:'25000',currency:'ARS',price_source:'catálogo:price-labor'}),
  expect.objectContaining({id:basinId,kind:'material',price:null})
 ]));
 expect(result.batches).toEqual([]);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('yes executes the pending ACU once without another card or form and legacy component metadata does not block valid prices',async({page})=>{
 const {dialogs}=await catalogFixture(page,{handoff:true});
 await ask(page,'¿Qué información necesitás para presupuestar la instalación de un inodoro sanitario?');
 await expect(page.getByRole('button',{name:'Preparar listado de insumos',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.__catalogHarness.batches)).toHaveLength(0);
 await ask(page,'sí');
 await expect(page.locator('.ai-ingredient-preview')).toContainText('Inodoro');
 expect(await page.evaluate(()=>window.__catalogHarness.batches.length)).toBe(0);
 await ask(page,'sí');
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.ai-assistant')).toHaveCount(1);
 for(const action of ['approve-load','review-acu-request','review-plan','review-acu-plan','draft'])await expect(page.locator(`[data-ai="${action}"]`)).toHaveCount(0);
 await expect(page.locator('.ai-transcript')).not.toContainText('tenés que abrir cada partida');
 const result=await page.evaluate(()=>({calls:window.__catalogHarness.calls,batches:window.__catalogHarness.batches,modalCalls:window.__catalogHarness.modalCalls}));
 expect(result.calls.filter(call=>call.name==='ai_chat')).toHaveLength(2);
 expect(result.batches).toHaveLength(1);expect(result.batches[0].creates).toEqual([]);
 expect(result.batches[0].acus[0].line_id).toBe(lineId);expect(result.batches[0].acus[0].measurements).toBeNull();
 expect(result.batches[0].acus[0].components.map(component=>({id:component.resource_id,quantity:component.quantity,price:component.expected_resource.price}))).toEqual([{id:toiletId,quantity:'1',price:'120000'},{id:laborId,quantity:'1',price:'25000'}]);
 expect(result.modalCalls).toBe(0);expect(dialogs).toEqual([]);
 await ask(page,'sí');await expect(page.locator('#ai-prompt')).toHaveValue('');
 const after=await page.evaluate(()=>({calls:window.__catalogHarness.calls.length,batches:window.__catalogHarness.batches.length}));
 expect(after).toEqual({calls:result.calls.length,batches:1});
});
