import {test,expect} from '@playwright/test';
const fixture=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const scenario=__SCENARIO__;
const lineId='95000000-0000-4000-8000-000000000001';
const resources=[
 {id:'tile',description:'Porcelanato de baño',kind:'material',unit:'m2',code:'MAT-1',price:'15000'},
 {id:'labor',description:'Colocación de porcelanato',kind:'labor',unit:'m2',code:'MO-1',price:'25000'},
 {id:'glue',description:'Adhesivo para porcelanato',kind:'material',unit:'bolsa',code:'MAT-2',price:'17000'}
];
const line={id:lineId,description:'Revestimiento de baños',unit:'m2',quantity:'35',unit_cost:'40000',analysis_id:'previous-analysis',expected_recipe:'previous-recipe',section_id:null,section:'',components:[{resource_id:'tile',quantity:'1'},{resource_id:'labor',quantity:'1'}],takeoffs:[],formula:null};
const state={view:'workspace',projectId:'project',estimateId:'estimate',selectedLineId:lineId,panel:'acu',search:'',
 projects:[{id:'project',currency:'ARS'}],estimates:[{id:'estimate',title:'Presupuesto inicial',currency:'ARS',issued:false}],
 lines:[line],sections:[],assignments:{}};
const harness={state,reads:[],writes:[],ready:false};window.__budgetPrepHarness=harness;
const render=()=>{document.querySelector('#app').textContent='Presupuesto inicial';};
const invoke=async(name,args={})=>{
 harness.reads.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'mock-model'};
 if(name==='ai_cancel')return null;
 if(name==='ai_catalog_context')return {currency:'ARS',as_of:'2026-11-10',total:resources.length,resources:structuredClone(resources)};
 if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
 if(name==='assisted_acu_references')return [];
 if(name==='ai_chat'){
  const question=args.messages.at(-1).content;
  if(question.includes('Presupuestame'))return {text:JSON.stringify({answer:'Armo partidas y ACU',tool_call:{name:'prepare_budget',args:{brief:'Presupuestar vivienda de 120 m2 construcción tradicional, terminación media'}}})};
  if(question.includes('Agregá adhesivo'))return {text:JSON.stringify({answer:'Busco insumos',tool_call:{name:'prepare_acu',args:{brief:'Agregar adhesivo al revestimiento de baños existente',scope:'selected'}}})};
  if(args.mode==='plan'){
   return {text:JSON.stringify({answer:'Plan por rubros',proposal_lines:[{description:'Piso de vivienda',unit:'m2',quantity:'120',unit_price:null,section:'Pisos'}]})};
  }
  if(args.mode==='acu'){
   const ctx=JSON.parse(args.context),target=ctx.targets[0];
   return {text:JSON.stringify({answer:'Receta propuesta',acu_proposals:[{line_id:target.line_id,components:[{resource_id:scenario==='budget'?'tile':'glue',quantity:scenario==='budget'?'1':'0.2',quantity_unit:scenario==='budget'?'m2':'bolsa',requested_description:scenario==='budget'?'Porcelanato de baño':'Adhesivo para porcelanato',consumption_support:'Consumo estimado para la partida'}],measurements:[],missing_resources:[]} ]})};
  }
  throw Error('Unexpected model request');
 }
 if(name==='apply_reviewed_budget_batch'){
  harness.writes.push(structuredClone(args.batch));
  const batch=args.batch;
  for(const acu of batch.acus){
   if(acu.line_id===lineId)line.components=structuredClone(acu.components);
  }
  return {composed:batch.acus.length,created:batch.creates.length,updated:0,deleted:0};
 }
 throw Error('Unexpected IPC '+name);
};
const assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{throw Error('No extra form')},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
harness.assistant=assistant;render();harness.ready=true;`;
async function begin(page,scenario){
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:fixture.replace('__SCENARIO__',JSON.stringify(scenario))}));
 await page.goto('/');await page.waitForFunction(()=>window.__budgetPrepHarness?.ready);
 await page.locator('.ai-launch').click();await page.locator('[name=ai-consent]').check();
}
async function ask(page,text){await page.locator('#ai-prompt').fill(text);await page.locator('#ai-question button').click();}

test('full housing budget request prepares an ACU and a new line without a separate prepare click',async({page})=>{
 await begin(page,'budget');
 await ask(page,'Presupuestame una vivienda de 120 m2 de construcción tradicional, terminación media');
 const preview=page.locator('.ai-ingredient-preview');
 await expect(preview).toContainText('Piso de vivienda');
 await expect(preview).toContainText('Porcelanato de baño');
 expect(await page.evaluate(()=>window.__budgetPrepHarness.writes.length)).toBe(0);
 await preview.getByRole('button',{name:'Sí, aprobar y cargar esta lista'}).click();
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 const data=await page.evaluate(()=>({writes:window.__budgetPrepHarness.writes,existing:window.__budgetPrepHarness.state.lines[0].components}));
 expect(data.writes).toHaveLength(1);
 expect(data.writes[0].creates).toHaveLength(1);
 expect(data.writes[0].acus).toHaveLength(1);
 expect(data.writes[0].creates[0].quantity).toBe('120');
 expect(data.existing.map(x=>x.resource_id)).toEqual(['tile','labor']);
});
test('model prepares materials into conversationally selected ACU without overwriting labor',async({page})=>{
 await begin(page,'acu');
 await ask(page,'Agregá adhesivo para porcelanato a esta partida seleccionada');
 const preview=page.locator('.ai-ingredient-preview');
 await expect(preview).toContainText('Adhesivo para porcelanato');
 await expect(preview).toContainText('Se conservan 2 insumos existentes');
 expect(await page.evaluate(()=>window.__budgetPrepHarness.writes.length)).toBe(0);
 await preview.getByRole('button',{name:'Sí, aprobar y cargar esta lista'}).click();
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 const data=await page.evaluate(()=>({writes:window.__budgetPrepHarness.writes,components:window.__budgetPrepHarness.state.lines[0].components}));
 expect(data.writes).toHaveLength(1);
 expect(data.writes[0].creates).toEqual([]);
 expect(data.components.map(x=>x.resource_id)).toEqual(['tile','labor','glue']);
});