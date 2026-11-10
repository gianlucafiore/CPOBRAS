import {test,expect} from '@playwright/test';
test('selected bathroom ACU with 509 resources shows exact ingredient preview and never touches six other lines',async({page})=>{
 const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const selectedId='92000000-0000-4000-8000-000000000001';
const otherId='92000000-0000-4000-8000-000000000002';
const ids=['tile','grout','glue','labor'];
const original=[
 {id:'tile',code:'MAT-01',description:'Porcelanato para baños 60x60',kind:'material',unit:'m²',price:'100'},
 {id:'grout',code:'MAT-02',description:'Pastina para juntas',kind:'material',unit:'kg',price:'20'},
 {id:'glue',code:'MAT-03',description:'Adhesivo cementicio para porcelanato',kind:'material',unit:'kg',price:'15'},
 {id:'labor',code:'MO-01',description:'Colocación de porcelanato',kind:'labor',unit:'m²',price:'50'}
];
const fillers=Array.from({length:505},(_,i)=>({id:'filler-'+i,code:'I-'+i,description:'Insumo diverso '+i,kind:'material',unit:'kg',price:'10'}));
const resources=[...fillers,...original];
const line=(id,description)=>({id,description,unit:'m²',quantity:'35',unit_cost:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',components:[],takeoffs:[],formula:null});
const state={view:'workspace',projectId:'project-1',estimateId:'estimate-1',projects:[{id:'project-1',currency:'ARS'}],estimates:[{id:'estimate-1',title:'Presupuesto inicial',currency:'ARS',issued:false}],lines:[line(selectedId,'Revestimiento de baños'),line(otherId,'Limpieza de terreno')],sections:[],assignments:{},selectedLineId:selectedId,panel:'acu',search:''};
const harness={state,calls:[],batches:[],ready:false};window.__selectedFixture=harness;
const render=()=>{const app=document.querySelector('#app');app.replaceChildren();app.textContent='Revestimiento de baños';};
const invoke=async(name,args={})=>{
 harness.calls.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
 if(name==='ai_cancel')return null;
 if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,resources:structuredClone(resources)};
 if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
 if(name==='assisted_acu_references')return [];
 if(name==='ai_chat'){
  if(args.mode!=='acu')throw new Error('Selected ACU completion must not become a general answer');
  const prompt=JSON.parse(args.context);
  if(prompt.targets.length!==1||prompt.targets[0].line_id!==selectedId||prompt.operation!=='append')throw new Error('Wrong scope or operation');
  if(prompt.resources.length>90||prompt.catalog_total!==509)throw new Error('Unbounded provider context');
  if(ids.some(id=>!prompt.resources.some(r=>r.resource_id===id)))throw new Error('Catalog ranking omitted requested material');
  return {text:JSON.stringify({answer:'Lista del ACU',acu_proposals:[{line_id:selectedId,components:ids.map(id=>({resource_id:id,quantity:id==='tile'||id==='labor'?'1':'0.2',quantity_unit:original.find(r=>r.id===id).unit,requested_description:original.find(r=>r.id===id).description,consumption_support:'Estimación de consumo por m².'})),measurements:[],missing_resources:[]}]}),input_tokens:100,output_tokens:100};
 }
 if(name==='apply_reviewed_budget_batch'){
  const batch=structuredClone(args.batch);harness.batches.push(batch);
  if(batch.acus.length!==1||batch.acus[0].line_id!==selectedId)throw new Error('Wrong saved scope');
  state.lines[0].components=structuredClone(batch.acus[0].components);return {composed:1,created:0,deleted:0,updated:0};
 }
 throw new Error('Unexpected command: '+name);
};
const assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{throw new Error('Must not open modal');},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
harness.assistant=assistant;render();harness.ready=true;`;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');await page.waitForFunction(()=>window.__selectedFixture?.ready);
 await page.locator('.ai-launch').click();await page.locator('[name=ai-consent]').check();
 const ask=async value=>{await page.locator('#ai-prompt').fill(value);await page.locator('#ai-question button').click();};
 await ask('completar la partida seleccionada con los insumos necesarios, porcelanato, pastina, adhesivo y mano de obra');
 await expect(page.getByRole('button',{name:'Preparar listado de insumos'})).toBeVisible();
 await page.getByRole('button',{name:'Preparar listado de insumos'}).click();
 await expect(page.locator('.ai-ingredient-preview')).toContainText('Porcelanato para baños');
 await expect(page.locator('.ai-ingredient-preview')).toContainText('Pastina');
 await expect(page.locator('.ai-ingredient-preview')).toContainText('Adhesivo');
 await expect(page.locator('.ai-ingredient-preview')).toContainText('Colocación');
 expect(await page.evaluate(()=>window.__selectedFixture.batches.length)).toBe(0);
 await page.getByRole('button',{name:'Sí, aprobar y cargar esta lista'}).click();
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 const result=await page.evaluate(()=>({batch:window.__selectedFixture.batches[0],lines:window.__selectedFixture.state.lines}));
 expect(result.batch.acus).toHaveLength(1);
 expect(result.batch.acus[0].expected.quantity).toBe('35');
 expect(result.lines[1].components).toEqual([]);
 expect(result.lines[0].components.map(c=>c.resource_id)).toEqual(['tile','grout','glue','labor']);
});
