import {test,expect} from '@playwright/test';
const yeso='a0000000-0000-4000-8000-000000000001',mo='a0000000-0000-4000-8000-000000000002';
async function setup(page,{plain=false}={}){
 await page.route('**/src/main.js*',r=>r.fulfill({contentType:'application/javascript',body:'import "./style.css";document.querySelector("#app").textContent="Biblioteca de ACU";'}));
 await page.goto('/');
 await page.evaluate(async({yeso,mo,plain})=>{
  const {createAiAssistant}=await import('/src/components/ai-assistant.js');
  const resources=[
   {id:yeso,code:'INS-YE',description:'Yeso para aplicación húmeda',unit:'kg',price:'950',currency:'ARS',kind:'material'},
   {id:mo,code:'MO-YES',description:'Mano de obra de aplicación de yeso',unit:'jornal',price:'72000',currency:'ARS',kind:'labor'}
  ];
  const state={view:'analyses',projectId:null,estimateId:null,selectedLineId:null,sections:[],lines:[],assignments:{},projects:[],estimates:[],analyses:[],resources};
  const calls=[],writes=[],harness={state,calls,writes,ready:false};window.__standalone=harness;
  const invoke=async(name,args={})=>{
   calls.push({name,args:structuredClone(args)});
   if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture'};
   if(name==='ai_cancel')return null;
   if(name==='ai_catalog_context')return {currency:'ARS',as_of:'2026-11-12',resources:structuredClone(resources)};
   if(name==='ai_chat'){
    if(args.mode!=='acu'||JSON.parse(args.context).task!=='standalone_acu')throw Error('Wrong AI task');
    return {text:plain?'Preparé ACU para aplicación de yeso, listo para revisión.':JSON.stringify({
     answer:'Composición preparada',standalone_acu:{description:'Aplicación de yeso por vía húmeda',unit:'m²',
      components:[{resource_id:yeso,quantity:'4.5',quantity_unit:'kg',consumption_support:'Estimación por m²'},
       {resource_id:mo,quantity:'0.08',quantity_unit:'jornal',consumption_support:'Rendimiento estimado'}],
      assumptions:['Confirmar espesor de yeso'],missing_resources:[]}}),input_tokens:100,output_tokens:120};
   }
   if(name==='create_analysis'){
    writes.push(structuredClone(args));
    const saved={id:'a0000000-0000-4000-8000-000000000007',code:'ACU-0001',description:args.description,unit:args.unit,unit_cost:'10000'};
    state.analyses.push(saved);return saved;
   }
   if(name==='list_analyses')return structuredClone(state.analyses);
   throw Error('Unknown command '+name);
  };
  harness.ai=createAiAssistant({invoke,state,document,window,openModal:()=>{throw Error('No modal allowed')},editable:()=>true,
   loadEstimate:async()=>{},loadEstimates:async()=>{},openEstimate:async()=>{},
   reloadCatalog:async()=>{state.analyses=await invoke('list_analyses')},
   render:()=>{document.querySelector('#app').textContent=state.analyses.map(x=>x.code).join(';')}});
  harness.ready=true;
 },{yeso,mo,plain});
 await page.waitForFunction(()=>window.__standalone?.ready);
 await page.locator('.ai-launch').click();
 await page.locator('[name=ai-consent]').check();
}
async function ask(page,q){await page.locator('#ai-prompt').fill(q);await page.locator('#ai-question button').click();}
test('crear ACU independiente de yeso genera propuesta, no partida y un único guardado autorizado',async({page})=>{
 await setup(page);
 await ask(page,'Necesito crear un ACU de aplicación de yeso por vía húmeda');
 const preview=page.locator('.ai-ingredient-preview').last();
 await expect(preview).toContainText('Yeso para aplicación húmeda');
 await expect(preview).toContainText('Mano de obra de aplicación de yeso');
 await expect(preview).toContainText('Confirmar espesor de yeso');
 expect(await page.evaluate(()=>window.__standalone.writes)).toHaveLength(0);
 await ask(page,'bueno cargalos');
 await expect(page.locator('.ai-approval-status')).toContainText('ACU guardado en la biblioteca');
 const result=await page.evaluate(()=>({writes:window.__standalone.writes,state:window.__standalone.state,calls:window.__standalone.calls.map(c=>c.name)}));
 expect(result.writes).toHaveLength(1);
 expect(result.writes[0].code).toBe('');
 expect(result.writes[0].components.map(c=>c.unitPrice)).toEqual(['950','72000']);
 expect(result.state.lines).toHaveLength(0);
 expect(result.state.analyses).toHaveLength(1);
 expect(result.calls).not.toContain('apply_reviewed_budget_batch');
 await expect(page.locator('#app')).toHaveText('ACU-0001');
});
test('una respuesta verbal no se convierte en falsa propuesta ni guardado',async({page})=>{
 await setup(page,{plain:true});
 await ask(page,'Necesito crear un ACU de aplicación de yeso por vía húmeda');
 await expect(page.locator('.ai-error')).toContainText('no preparó una composición');
 expect(await page.evaluate(()=>window.__standalone.writes)).toHaveLength(0);
 await expect(page.locator('[data-ai=approve-standalone]')).toHaveCount(0);
});
test('encabezado de ACU fijo y menú único de acciones',async({page})=>{
 await page.route('**/src/main.js*',r=>r.fulfill({contentType:'application/javascript',body:'import "./style.css";document.querySelector("#app").textContent="Vista de ACU";'}));
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {createModalRenderer}=await import('/src/components/modal.js');
  const {entityActions}=await import('/src/components/entity-actions.js');
  const state={clients:[],personClients:[],sections:[],resources:[],acuComponents:Array.from({length:25},()=>({resourceId:'',quantity:'1',unitPrice:'1'})),
   modal:{kind:'analysis',record:{description:'Zapatas corridas de H°A° sin encofrado',unit:'m³',code:'ACU-0001'}}};
  const renderer=createModalRenderer({state,currentProject:()=>null,currentEstimate:()=>null,currentLine:()=>null,editable:()=>true,locked:()=>false});
  document.body.insertAdjacentHTML('beforeend',renderer());
  const sticky=document.querySelector('.acu-editor-sticky'),scroll=document.querySelector('.dialog-body[data-kind=analysis]');
  scroll.scrollTop=scroll.scrollHeight;
  const menu=document.createElement('div');menu.innerHTML=entityActions('analysis','id-1','Zapatas');
  const actions=[...menu.querySelectorAll('[data-action]')].map(b=>b.dataset.action);
  return {sticky:!!sticky,position:getComputedStyle(sticky).position,actions,scrollY:scroll.scrollTop};
 });
 expect(result.sticky).toBe(true);
 expect(result.position).toBe('sticky');
 expect(result.actions).toEqual(['entity-menu','edit-analysis','modal-reprice','duplicate-analysis','entity-archive']);
 expect(result.scrollY).toBeGreaterThan(0);
});
