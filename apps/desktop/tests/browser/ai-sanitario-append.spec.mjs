import {test,expect} from '@playwright/test';

// Full chat -> preparation -> approval -> budget-batch test.
// The AI response and native bridge are mocked; no project DB or API is touched.
async function openFixture(page,scenario){
 const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const mode=__SCENARIO__;
const lineId='90000000-0000-4000-8000-000000000001';
const laborInodoro='90000000-0000-4000-8000-000000000002';
const laborBidet='90000000-0000-4000-8000-000000000003';
const materialInodoro='90000000-0000-4000-8000-000000000004';
const materialBidet='90000000-0000-4000-8000-000000000005';
const resources=[
 {id:laborInodoro,code:'MO-I',description:'Colocación de inodoro con depósito',kind:'labor',unit:'un',price:'120'},
 {id:laborBidet,code:'MO-B',description:'Colocación de bidet con grifería',kind:'labor',unit:'un',price:'140'},
 {id:materialInodoro,code:'SAN-I',description:'Inodoro con depósito línea Mónaco',kind:'material',unit:'un',price:'500'},
 {id:materialBidet,code:'SAN-B',description:'Bidé Mónaco con grifería',kind:'material',unit:'un',price:'450'}
];
const line={id:lineId,description:'Instalación de sanitarios: 1 inodoro y 1 bidet con mano de obra',unit:'un',quantity:'1',unit_cost:'260',analysis_id:'existing-analysis',expected_recipe:'original-recipe',section_id:null,section:'',components:[{resource_id:laborInodoro,quantity:'1'},{resource_id:laborBidet,quantity:'1'}],takeoffs:[],formula:null};
const state={view:'workspace',projectId:'project-1',estimateId:'estimate-1',projects:[{id:'project-1',currency:'ARS'}],estimates:[{id:'estimate-1',title:'Presupuesto de prueba',currency:'ARS',issued:false}],lines:[line],sections:[],assignments:{},selectedLineId:lineId,panel:'acu',search:''};
const harness={state,calls:[],batches:[],ready:false};window.__sanitaryFixture=harness;
const render=()=>{const app=document.querySelector('#app');app.replaceChildren();const title=document.createElement('h2');title.textContent='ACU sanitarios';app.append(title);};
const invoke=async(name,args={})=>{
 harness.calls.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
 if(name==='ai_cancel')return null;
 if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,resources:structuredClone(resources)};
 if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
 if(name==='assisted_acu_references')return [];
 if(name==='ai_chat'){
  if(args.mode!=='acu')throw new Error('The selected addition must not become a normal chat reply or a new budget line');
  const context=JSON.parse(args.context);
  if(context.operation!=='append'||context.targets.length!==1||context.targets[0].line_id!==lineId)throw new Error('Missing append operation or wrong target');
  const additions=[materialInodoro,...(mode==='complete'?[materialBidet]:[])].map(id=>{
   const resource=resources.find(r=>r.id===id);
   return {resource_id:id,quantity:'1',quantity_unit:'un',requested_description:resource.description,consumption_support:'Un artefacto para una instalación'};
  });
  return {text:JSON.stringify({answer:'Propuesta para revisar',acu_proposals:[{line_id:lineId,components:additions,measurements:[],assumptions:[],missing_resources:[]}]}),input_tokens:80,output_tokens:80};
 }
 if(name==='apply_reviewed_budget_batch'){
  const batch=structuredClone(args.batch);harness.batches.push(batch);
  for(const acu of batch.acus){
   const existing=state.lines.find(item=>item.id===acu.line_id);if(!existing)throw new Error('Foreign ACU target');
   existing.components=structuredClone(acu.components);existing.analysis_id='updated-analysis';
  }
  return {updated:batch.updates.length,created:batch.creates.length,deleted:batch.deletes.length,composed:batch.acus.length};
 }
 throw new Error('Unexpected native action: '+name);
};
const assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{throw new Error('Approval should not open a manual form');},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
harness.assistant=assistant;render();harness.ready=true;`;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source.replace('__SCENARIO__',JSON.stringify(scenario))}));
 await page.goto('/');await page.waitForFunction(()=>window.__sanitaryFixture?.ready);
 await page.locator('.ai-launch').click();
 await expect(page.locator('#ai-settings')).toHaveCount(0);
 await page.locator('[name=ai-consent]').check();
}
async function ask(page,question){
 await page.locator('#ai-prompt').fill(question);
 await page.locator('#ai-question button').click();
}
const request='Agregá el inodoro línea Mónaco y el bidet línea Mónaco a esta partida seleccionada';

test('direct approval adds both Mónaco fixtures without removing existing labor',async({page})=>{
 await openFixture(page,'complete');
 await ask(page,request);
 await expect(page.getByRole('button',{name:'Sí, aprobar y cargar',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.__sanitaryFixture.batches.length)).toBe(0);
 await ask(page,'sí aprobado cargalos');
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 const result=await page.evaluate(()=>({batches:window.__sanitaryFixture.batches,components:window.__sanitaryFixture.state.lines[0].components}));
 expect(result.batches).toHaveLength(1);
 expect(result.batches[0].creates).toEqual([]);
 expect(result.batches[0].acus).toHaveLength(1);
 expect(result.components.map(c=>c.resource_id)).toEqual([
  '90000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000003',
  '90000000-0000-4000-8000-000000000004',
  '90000000-0000-4000-8000-000000000005'
 ]);
});

test('missing bidet remains pending and cannot re-save labor-only ACU',async({page})=>{
 await openFixture(page,'missing');
 await ask(page,request);
 await expect(page.getByRole('button',{name:'Sí, aprobar y cargar',exact:true})).toBeVisible();
 await ask(page,'sí aprobado cargalos');
 await expect(page.locator('.ai-approval-status')).toContainText('No hay un guardado confirmado');
 await expect(page.locator('.ai-pending-reasons')).toContainText('bidet');
 const result=await page.evaluate(()=>({writes:window.__sanitaryFixture.batches.length,components:window.__sanitaryFixture.state.lines[0].components}));
 expect(result.writes).toBe(0);
 expect(result.components.map(c=>c.resource_id)).toEqual(['90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000003']);
});