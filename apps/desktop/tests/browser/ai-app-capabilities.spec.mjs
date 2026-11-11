import {test,expect} from '@playwright/test';

test('chat discovers modules, plans a multi-module workflow and reads purchasing without writing',async({page})=>{
 const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const state={
 view:'workspace',projectId:'project-1',estimateId:'estimate-1',selectedLineId:null,search:'',panel:'budget',
 projects:[{id:'project-1',currency:'ARS'}],estimates:[{id:'estimate-1',issued:false,currency:'ARS',title:'Presupuesto'}],
 lines:[],sections:[],assignments:{}
};
const harness={state,calls:[],ready:false};window.__appMapHarness=harness;
const invoke=async(name,args={})=>{
 harness.calls.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture'};
 if(name==='ai_catalog_context')return {currency:'ARS',resources:[],as_of:'2026-11-10'};
 if(name==='ai_cancel')return null;
 if(name==='list_quotation_requests')return [{id:'q1',title:'Necesidad de cemento',status:'draft'}];
 if(name==='list_supplier_orders')return [{id:'o1',title:'Orden de cemento',status:'pending'}];
 if(name==='ai_chat'){
  const question=args.messages.at(-1).content.toLowerCase();
  if(question.includes('modulo')||question.includes('módulo'))return {text:JSON.stringify({answer:'Catálogo de funciones',tool_call:{name:'describe_capabilities',args:{module:'procurement'}}})};
  if(question.includes('plan'))return {text:JSON.stringify({answer:'Secuencia de obra',tool_call:{name:'plan_workflow',args:{goal:'Preparar compras de materiales y órdenes de compra'}}})};
  if(question.includes('ordenes')||question.includes('órdenes'))return {text:JSON.stringify({answer:'Consulto compras',tool_call:{name:'inspect_module',args:{module:'procurement'}}})};
  return {text:JSON.stringify({answer:'No ejecuté cambios.'})};
 }
 throw Error('Acción no autorizada: '+name);
};
harness.ai=createAiAssistant({invoke,state,document,window,openModal:()=>{throw Error('No modal')},editable:()=>true,loadEstimate:async()=>{},loadEstimates:async()=>{},openEstimate:async()=>{}});
document.querySelector('#app').textContent='Obra de prueba';harness.ready=true;`;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');
 await page.waitForFunction(()=>window.__appMapHarness?.ready);
 await page.locator('.ai-launch').click();
 await page.locator('[name=ai-consent]').check();
 const ask=async question=>{
  await page.locator('#ai-prompt').fill(question);
  await page.locator('#ai-question button').click();
 };
 await ask('Qué operaciones tiene el módulo de compras');
 await expect(page.locator('.ai-transcript')).toContainText('Materiales, compras y cotizaciones');
 await ask('Podés planificar compras de materiales para la obra');
 await expect(page.locator('.ai-transcript')).toContainText('Consultar el presupuesto');
 await expect(page.locator('.ai-transcript')).toContainText('acopio');
 await ask('Cuántas órdenes de compra tengo pendientes');
 await expect(page.locator('.ai-transcript')).toContainText('pedidos_de_materiales: 1');
 const calls=await page.evaluate(()=>window.__appMapHarness.calls);
 expect(calls.map(c=>c.name)).toContain('list_quotation_requests');
 expect(calls.map(c=>c.name)).toContain('list_supplier_orders');
 expect(calls.every(c=>!['create_quotation_request','award_quotation','save_quote_response','post_operation','restore_backup'].includes(c.name))).toBe(true);
});
