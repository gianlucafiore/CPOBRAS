import {test,expect} from '@playwright/test';

// Runs the real chat, ACU workbench, preview and approval against deterministic
// native IPC fixtures. It does not use a real budget or AI provider.
test('one natural-language request classifies rubros, prepares valid ACU, lists pending and saves once',async({page})=>{
 const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const lineA='97000000-0000-4000-8000-000000000001';
const lineB='97000000-0000-4000-8000-000000000002';
const sectionA='97000000-0000-4000-8000-000000000003';
const sectionB='97000000-0000-4000-8000-000000000004';
const mortar='97000000-0000-4000-8000-000000000005';
const lines=[
 {id:lineA,description:'Revoque grueso interior',unit:'m²',quantity:'36',unit_cost:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',components:[],takeoffs:[],formula:null},
 {id:lineB,description:'Mampostería de ladrillo especial',unit:'m²',quantity:'80',unit_cost:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',components:[],takeoffs:[],formula:null}
];
const sections=[
 {id:sectionA,title:'Revoques',code:'01',parent_id:null},
 {id:sectionB,title:'Mamposterías',code:'02',parent_id:null}
];
const resources=[{id:mortar,description:'Mortero preparado para revoque',code:'MAT-01',kind:'material',unit:'kg',price:'20',price_source:'catálogo:1'}];
const state={view:'workspace',projectId:'project',estimateId:'estimate',selectedLineId:null,panel:'budget',search:'',
 projects:[{id:'project',currency:'ARS'}],estimates:[{id:'estimate',title:'Presupuesto de prueba',currency:'ARS',issued:false}],
 sections,lines,assignments:{}};
const harness={state,reads:[],writes:[],ready:false,modalCalls:0};window.__reviewHarness=harness;
const render=()=>{document.querySelector('#app').textContent='Presupuesto de prueba';};
const invoke=async(name,args={})=>{
 harness.reads.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture'};
 if(name==='ai_cancel')return null;
 if(name==='assisted_acu_references')return [];
 if(name==='assisted_acu_context')return {currency:'ARS',sections:structuredClone(sections),lines:structuredClone(lines),resources:structuredClone(resources)};
 if(name==='ai_chat'){
  if(args.mode==='manage'){
   const ctx=JSON.parse(args.context);
   if(ctx.task!=='classify_budget_sections')throw Error('Unexpected classification request');
   return {text:JSON.stringify({answer:'Clasificación de rubros propuesta',section_moves:ctx.lines.map(row=>({line_id:row.id,section_id:row.description.includes('Revoque')?sectionA:sectionB,confidence:'high',reason:'Correspondencia por oficio'}))})};
  }
  if(args.mode==='acu'){
   const ctx=JSON.parse(args.context);
   return {text:JSON.stringify({answer:'ACU revisados',acu_proposals:ctx.targets.map(row=>({
    line_id:row.line_id,
    components:row.description.includes('Revoque')?[{resource_id:mortar,quantity:'0.25',source_quantity:0.25,source_unit:'kg',quantity_unit:'kg',requested_description:'Mortero de revoque',consumption_support:'Consumo estimado por m²'}]:[],
    missing_resources:row.description.includes('Mampostería')?['Falta ladrillo especial con unidad y precio']:[],
    measurements:[]
   }))})};
  }
  throw Error('Unexpected model mode '+args.mode);
 }
 if(name==='apply_reviewed_budget_batch'){
  harness.writes.push(structuredClone(args.batch));
  for(const moved of args.batch.section_moves||[]){const line=state.lines.find(l=>l.id===moved.line_id);line.section_id=moved.section_id;}
  for(const acu of args.batch.acus){const line=state.lines.find(l=>l.id===acu.line_id);line.section_id=acu.section_id;line.analysis_id='analysis-'+line.id;}
  return {created:0,updated:0,deleted:0,composed:args.batch.acus.length,moved_sections:(args.batch.section_moves||[]).length};
 }
 throw Error('Unexpected native request '+name);
};
harness.assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{harness.modalCalls++;throw Error('No additional modal')},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
render();harness.ready=true;`;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');
 await page.waitForFunction(()=>window.__reviewHarness?.ready);
 await page.locator('.ai-launch').click();
 await page.locator('[name=ai-consent]').check();
 await page.locator('#ai-prompt').fill('Revisá este presupuesto, organizá las partidas en sus rubros correspondientes, completá los ACU con los precios de mi biblioteca y decime qué falta.');
 await page.locator('#ai-question button').click();
 const preview=page.locator('.ai-ingredient-preview').last();
 await expect(preview).toContainText('Revoque grueso interior');
 await expect(preview).toContainText('Mampostería de ladrillo especial');
 await expect(preview).toContainText('Revoques');
 await expect(preview).toContainText('Mamposterías');
 await expect(preview).toContainText('Falta ladrillo especial');
 expect(await page.evaluate(()=>window.__reviewHarness.writes)).toHaveLength(0);
 const approve=preview.getByRole('button',{name:'Sí, aprobar y cargar esta lista'});
 await expect(approve).toBeVisible();
 await approve.click();
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 await expect(page.locator('.ai-approval-status')).toContainText('2 partidas organizadas por rubro');
 const result=await page.evaluate(()=>({writes:window.__reviewHarness.writes,state:window.__reviewHarness.state,modalCalls:window.__reviewHarness.modalCalls}));
 expect(result.writes).toHaveLength(1);
 expect(result.writes[0].acus).toHaveLength(1);
 expect(result.writes[0].acus[0].section_id).toBe('97000000-0000-4000-8000-000000000003');
 expect(result.writes[0].section_moves).toHaveLength(1);
 expect(result.writes[0].section_moves[0].section_id).toBe('97000000-0000-4000-8000-000000000004');
 expect(result.writes[0].acus[0].components[0].expected_resource.price).toBe('20');
 expect(result.state.lines.map(l=>l.quantity)).toEqual(['36','80']);
 expect(result.modalCalls).toBe(0);
});
