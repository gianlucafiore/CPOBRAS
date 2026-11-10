import {test,expect} from '@playwright/test';
test('confirmed excavator productivity updates only the equipment consumption and warns on kg unit',async({page})=>{
 const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const lineId='91000000-0000-4000-8000-000000000001';
const eqId='91000000-0000-4000-8000-000000000002';
const materialId='91000000-0000-4000-8000-000000000003';
const resources=[
 {id:eqId,code:'EQ-RET',description:'Retroexcavadora x Día',kind:'equipment',unit:'kg',price:'130000',price_source:'catálogo:price-1'},
 {id:materialId,code:'MAT-A',description:'Arena',kind:'material',unit:'m³',price:'100',price_source:'catálogo:price-2'}
];
const line={id:lineId,description:'Excavación para zapatas corridas',unit:'m³',quantity:'15',unit_cost:'130000',analysis_id:'old-analysis',expected_recipe:'old-recipe',section_id:null,section:'',components:[{resource_id:eqId,quantity:'1'},{resource_id:materialId,quantity:'0.1'}],takeoffs:[],formula:null};
const state={view:'workspace',projectId:'project-1',estimateId:'estimate-1',projects:[{id:'project-1',currency:'ARS'}],estimates:[{id:'estimate-1',title:'Presupuesto de prueba',currency:'ARS',issued:false}],lines:[line],sections:[],assignments:{},selectedLineId:lineId,panel:'acu',search:''};
const harness={state,calls:[],batches:[],ready:false};window.__productivityFixture=harness;
const render=()=>{const app=document.querySelector('#app');app.replaceChildren();const h=document.createElement('h2');h.textContent='Presupuesto excavación';app.append(h);};
const invoke=async(name,args={})=>{
 harness.calls.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
 if(name==='ai_cancel')return null;
 if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,resources:structuredClone(resources)};
 if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
 if(name==='assisted_acu_references')return [];
 if(name==='ai_chat')throw new Error('A deterministic productivity correction does not require a provider statement');
 if(name==='apply_reviewed_budget_batch'){
  const batch=structuredClone(args.batch);harness.batches.push(batch);
  for(const acu of batch.acus){
   if(acu.line_id!==lineId)throw new Error('Wrong target');
   line.components=structuredClone(acu.components);line.analysis_id='updated-analysis';
  }
  return {updated:0,created:0,deleted:0,composed:batch.acus.length};
 }
 throw new Error('Unexpected native action: '+name);
};
const assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{throw new Error('Should not open modal');},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
harness.assistant=assistant;render();harness.ready=true;`;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');await page.waitForFunction(()=>window.__productivityFixture?.ready);
 await page.locator('.ai-launch').click();await page.locator('[name=ai-consent]').check();
 const ask=async question=>{await page.locator('#ai-prompt').fill(question);await page.locator('#ai-question button').click();};
 await ask('modificá el rendimiento de la retroexcavadora es de 40m3 x día de trabajo');
 await expect(page.locator('.ai-ingredient-preview')).toBeVisible();
 expect(await page.evaluate(()=>window.__productivityFixture.batches.length)).toBe(0);
 await expect(page.locator('.ai-ingredient-preview')).toContainText('0.025');
 await expect(page.locator('.ai-ingredient-preview')).toContainText('Advertencia');
 expect(await page.evaluate(()=>window.__productivityFixture.batches.length)).toBe(0);
 await ask('confirmo');
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 await expect(page.locator('.ai-approval-status')).toContainText('Advertencia');
 const result=await page.evaluate(()=>({calls:window.__productivityFixture.calls.map(call=>call.name),batches:window.__productivityFixture.batches,components:window.__productivityFixture.state.lines[0].components}));
 expect(result.calls).not.toContain('ai_chat');
 expect(result.batches).toHaveLength(1);
 expect(result.batches[0].acus).toHaveLength(1);
 expect(result.batches[0].acus[0].expected_recipe).toBe('old-recipe');
 expect(result.batches[0].acus[0].components.map(c=>c.quantity)).toEqual(['0.025','0.1']);
 expect(result.components.map(c=>c.resource_id)).toEqual(['91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000003']);
 expect(result.batches[0].acus[0].notes).toContain('kg');
});
