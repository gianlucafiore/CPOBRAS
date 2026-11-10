import {test,expect} from '@playwright/test';

test('natural chat calls typed read-only tools for quantities, audits, comparisons and catalog, without writes',async({page})=>{
 const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const projectId='94000000-0000-4000-8000-000000000001';
const currentId='94000000-0000-4000-8000-000000000002';
const olderId='94000000-0000-4000-8000-000000000003';
const otherId='94000000-0000-4000-8000-000000000004';
const state={
 view:'workspace',projectId,estimateId:currentId,selectedLineId:null,panel:'summary',search:'',
 projects:[{id:projectId,currency:'ARS'}],
 estimates:[{id:currentId,title:'Actual',currency:'ARS',issued:false},{id:olderId,title:'Revisión 1',currency:'ARS',issued:false},{id:otherId,title:'Revisión 2',currency:'ARS',issued:true}],
 sections:[],assignments:{},lines:[
  {id:'line-1',description:'Replanteo',unit:'m²',quantity:'120',unit_cost:'0',analysis_id:null,components:[],takeoffs:[],formula:null},
  {id:'line-2',description:'Porcelanato',unit:'m²',quantity:'35',unit_cost:'20000',analysis_id:'analysis',components:[{resource_id:'tile',quantity:'1'}],takeoffs:[],formula:null}
 ]
};
const resources=[
 {id:'tile',code:'T-1',description:'Porcelanato 60x60',unit:'m²',kind:'material',price:'14000',price_source:'catálogo',effective_date:'2026-11-01'},
 {id:'glue',code:'A-1',description:'Adhesivo para porcelanato',unit:'bolsa',kind:'material',price:'17000',price_source:'catálogo',effective_date:'2025-05-01'}
];
const harness={state,calls:[],ready:false};window.__toolsHarness=harness;
const render=()=>{document.getElementById('app').textContent='Presupuesto actual';};
const invoke=async(name,args={})=>{
 harness.calls.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
 if(name==='ai_cancel')return null;
 if(name==='ai_catalog_context')return {currency:'ARS',as_of:'2026-11-10',total:resources.length,resources:structuredClone(resources)};
 if(name==='list_project_estimates')return structuredClone(state.estimates);
 if(name==='compare_estimates')return {baseline_id:args.baselineId,revised_id:args.revisedId,baseline_total:'800000',revised_total:'900000',difference:'100000',lines:[{description:'Porcelanato',baseline_cost:'500000',revised_cost:'600000',difference:'100000'}]};
 if(name==='ai_chat'){
  const message=args.messages.at(-1).content.toLowerCase();
  if(message.includes('zapatas'))return {text:JSON.stringify({answer:'Computo geométrico',tool_call:{name:'calculate_takeoff',args:{shape:'rectangular_prism',dimension_unit:'cm',count:'12',length:'80',width:'80',height:'50',description:'zapatas'}}}),input_tokens:50,output_tokens:20};
  if(message.includes('audita'))return {text:JSON.stringify({answer:'Reviso el presupuesto',tool_call:{name:'audit_budget',args:{}}}),input_tokens:40,output_tokens:12};
  if(message.includes('compar'))return {text:JSON.stringify({answer:'Comparo versiones',tool_call:{name:'compare_estimates',args:{}}}),input_tokens:40,output_tokens:12};
  if(message.includes('busca'))return {text:JSON.stringify({answer:'Busco en la biblioteca',tool_call:{name:'search_catalog',args:{query:'adhesivo para porcelanato'}}}),input_tokens:40,output_tokens:12};
  if(message.includes('presupuestame'))return {text:JSON.stringify({answer:'Plan inicial por rubros',proposal_lines:[{description:'Contrapiso de vivienda',unit:'m2',quantity:'120',unit_price:null,section:'Pisos'},{description:'Hormigón para zapatas',unit:'m3',quantity:null,unit_price:null,section:'Estructura'}]}),input_tokens:40,output_tokens:80};
  return {text:JSON.stringify({answer:'Sin herramientas para ese pedido'}),input_tokens:40,output_tokens:12};
 }
 throw new Error('Unexpected native command: '+name);
};
const ai=createAiAssistant({invoke,state,document,window,openModal:()=>{throw new Error('No modal')},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
harness.ai=ai;render();harness.ready=true;`;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');
 await page.waitForFunction(()=>window.__toolsHarness?.ready);
 await page.locator('.ai-launch').click();
 await page.locator('[name=ai-consent]').check();
 const ask=async question=>{
  await page.locator('#ai-prompt').fill(question);
  await page.locator('#ai-question button').click();
 };
 await ask('Calculá cuánto hormigón necesito para 12 zapatas de 80 x 80 x 50 cm');
 await expect(page.locator('.ai-transcript')).toContainText('3,84 m³');
 await ask('Audita todo este presupuesto');
 await expect(page.locator('.ai-transcript')).toContainText('Auditoría');
 await expect(page.locator('.ai-transcript')).toContainText('Replanteo');
 await ask('Compará este presupuesto con los anteriores');
 await expect(page.locator('.ai-transcript')).toContainText('Revisión 1');
 await expect(page.locator('.ai-transcript')).toContainText('Revisión 2');
 await ask('Buscá adhesivo para porcelanato en mi biblioteca');
 await expect(page.locator('.ai-transcript')).toContainText('Adhesivo para porcelanato');
 const calls=await page.evaluate(()=>window.__toolsHarness.calls.map(item=>item.name));
 expect(calls.filter(name=>name==='compare_estimates')).toHaveLength(2);
 expect(calls).toContain('list_project_estimates');
 expect(calls).not.toContain('apply_reviewed_budget_batch');
 expect(calls).not.toContain('save_takeoff');
 expect(calls).not.toContain('create_estimate');
});

test('budgeting a 120 m2 house yields a reviewable draft without invented prices or writes',async({page})=>{
 const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const projectId='94000000-0000-4000-8000-000000000001';
const currentId='94000000-0000-4000-8000-000000000002';
const olderId='94000000-0000-4000-8000-000000000003';
const otherId='94000000-0000-4000-8000-000000000004';
const state={
 view:'workspace',projectId,estimateId:currentId,selectedLineId:null,panel:'summary',search:'',
 projects:[{id:projectId,currency:'ARS'}],
 estimates:[{id:currentId,title:'Actual',currency:'ARS',issued:false},{id:olderId,title:'Revisión 1',currency:'ARS',issued:false},{id:otherId,title:'Revisión 2',currency:'ARS',issued:true}],
 sections:[],assignments:{},lines:[
  {id:'line-1',description:'Replanteo',unit:'m²',quantity:'120',unit_cost:'0',analysis_id:null,components:[],takeoffs:[],formula:null},
  {id:'line-2',description:'Porcelanato',unit:'m²',quantity:'35',unit_cost:'20000',analysis_id:'analysis',components:[{resource_id:'tile',quantity:'1'}],takeoffs:[],formula:null}
 ]
};
const resources=[
 {id:'tile',code:'T-1',description:'Porcelanato 60x60',unit:'m²',kind:'material',price:'14000',price_source:'catálogo',effective_date:'2026-11-01'},
 {id:'glue',code:'A-1',description:'Adhesivo para porcelanato',unit:'bolsa',kind:'material',price:'17000',price_source:'catálogo',effective_date:'2025-05-01'}
];
const harness={state,calls:[],ready:false};window.__toolsHarness=harness;
const render=()=>{document.getElementById('app').textContent='Presupuesto actual';};
const invoke=async(name,args={})=>{
 harness.calls.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
 if(name==='ai_cancel')return null;
 if(name==='ai_catalog_context')return {currency:'ARS',as_of:'2026-11-10',total:resources.length,resources:structuredClone(resources)};
 if(name==='list_project_estimates')return structuredClone(state.estimates);
 if(name==='compare_estimates')return {baseline_id:args.baselineId,revised_id:args.revisedId,baseline_total:'800000',revised_total:'900000',difference:'100000',lines:[{description:'Porcelanato',baseline_cost:'500000',revised_cost:'600000',difference:'100000'}]};
 if(name==='ai_chat'){
  const message=args.messages.at(-1).content.toLowerCase();
  if(message.includes('zapatas'))return {text:JSON.stringify({answer:'Computo geométrico',tool_call:{name:'calculate_takeoff',args:{shape:'rectangular_prism',dimension_unit:'cm',count:'12',length:'80',width:'80',height:'50',description:'zapatas'}}}),input_tokens:50,output_tokens:20};
  if(message.includes('audita'))return {text:JSON.stringify({answer:'Reviso el presupuesto',tool_call:{name:'audit_budget',args:{}}}),input_tokens:40,output_tokens:12};
  if(message.includes('compar'))return {text:JSON.stringify({answer:'Comparo versiones',tool_call:{name:'compare_estimates',args:{}}}),input_tokens:40,output_tokens:12};
  if(message.includes('busca'))return {text:JSON.stringify({answer:'Busco en la biblioteca',tool_call:{name:'search_catalog',args:{query:'adhesivo para porcelanato'}}}),input_tokens:40,output_tokens:12};
  if(message.includes('presupuestame'))return {text:JSON.stringify({answer:'Plan inicial por rubros',proposal_lines:[{description:'Contrapiso de vivienda',unit:'m2',quantity:'120',unit_price:null,section:'Pisos'},{description:'Hormigón para zapatas',unit:'m3',quantity:null,unit_price:null,section:'Estructura'}]}),input_tokens:40,output_tokens:80};
  return {text:JSON.stringify({answer:'Sin herramientas para ese pedido'}),input_tokens:40,output_tokens:12};
 }
 throw new Error('Unexpected native command: '+name);
};
const ai=createAiAssistant({invoke,state,document,window,openModal:()=>{throw new Error('No modal')},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
harness.ai=ai;render();harness.ready=true;`;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');
 await page.waitForFunction(()=>window.__toolsHarness?.ready);
 await page.locator('.ai-launch').click();
 await page.locator('[name=ai-consent]').check();
 await page.locator('#ai-prompt').fill('Presupuestame una vivienda de 120 m² de construcción tradicional, terminación media');
 await page.locator('#ai-question button').click();
 await expect(page.locator('.ai-transcript')).toContainText('Contrapiso de vivienda');
 await expect(page.locator('.ai-transcript')).toContainText('Hormigón para zapatas');
 await expect(page.getByRole('button',{name:'Sí, aprobar y crear partidas'})).toBeVisible();
 const calls=await page.evaluate(()=>window.__toolsHarness.calls.map(item=>item.name));
 expect(calls).not.toContain('apply_reviewed_budget_batch');
});