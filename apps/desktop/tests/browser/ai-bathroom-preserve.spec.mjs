import {test,expect} from '@playwright/test';
test('sí agregalos adds adhesive and grout while preserving existing porcelain and labor',async({page})=>{
 const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const lineId='93000000-0000-4000-8000-000000000001';
const resources=[
 {id:'tile',code:'MAT-TILE',description:'Porcelanato para baños 60x60',kind:'material',unit:'m²',price:'100'},
 {id:'labor',code:'MO-TILE',description:'Mano de obra colocación de porcelanato',kind:'labor',unit:'m²',price:'50'},
 {id:'glue',code:'MAT-GLUE',description:'Adhesivo para porcelanato tipo Klaucol x25kg',kind:'material',unit:'bolsa',price:'17000'},
 {id:'grout',code:'MAT-GROUT',description:'Pastina para porcelanato',kind:'material',unit:'kg',price:'3000'}
];
const line={id:lineId,description:'Revestimiento de baños',unit:'m²',quantity:'35',unit_cost:'150',analysis_id:'old-analysis',expected_recipe:'old-recipe',section_id:null,section:'',components:[{resource_id:'tile',quantity:'1'},{resource_id:'labor',quantity:'1'}],takeoffs:[],formula:null};
const state={view:'workspace',projectId:'p',estimateId:'e',projects:[{id:'p',currency:'ARS'}],estimates:[{id:'e',title:'Presupuesto inicial',currency:'ARS',issued:false}],lines:[line],sections:[],assignments:{},selectedLineId:lineId,panel:'acu',search:''};
const harness={state,calls:[],batches:[],ready:false};window.__preserveFixture=harness;
const render=()=>{document.getElementById('app').textContent='ACU Revestimiento de baños';};
const invoke=async(name,args={})=>{
 harness.calls.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
 if(name==='ai_cancel')return null;
 if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,resources:structuredClone(resources)};
 if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
 if(name==='assisted_acu_references')return [];
 if(name==='ai_chat'){
  if(args.mode==='acu'){
   const ctx=JSON.parse(args.context);
   if(ctx.operation!=='append'||ctx.targets.length!==1||ctx.targets[0].line_id!==lineId)throw Error('Followup lost additive operation or selected target');
   return {text:JSON.stringify({answer:'Insumos propuestos',acu_proposals:[{line_id:lineId,components:[
    {resource_id:'glue',quantity:'0.2',quantity_unit:'bolsa',requested_description:resources[2].description,consumption_support:'Consumo estimado por m²'},
    {resource_id:'grout',quantity:'0.1',quantity_unit:'kg',requested_description:resources[3].description,consumption_support:'Consumo estimado por m²'}
   ],measurements:[],missing_resources:[]}]}),input_tokens:110,output_tokens:80};
  }
  return {text:JSON.stringify({answer:'Ya tenés porcelanato y colocación, pero faltan adhesivos y pastinas específicos.'}),input_tokens:100,output_tokens:20};
 }
 if(name==='apply_reviewed_budget_batch'){
  const batch=structuredClone(args.batch);
  harness.batches.push(batch);
  if(batch.acus.length!==1||batch.acus[0].line_id!==lineId)throw Error('Wrong budget target');
  state.lines[0].components=structuredClone(batch.acus[0].components);
  return {composed:1,created:0,updated:0,deleted:0};
 }
 throw Error('Unexpected IPC '+name);
};
const assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{throw Error('No modal');},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
harness.assistant=assistant;render();harness.ready=true;`;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');await page.waitForFunction(()=>window.__preserveFixture?.ready);
 await page.locator('.ai-launch').click();await page.locator('[name=ai-consent]').check();
 const ask=async q=>{await page.locator('#ai-prompt').fill(q);await page.locator('#ai-question button').click();};
 await ask('¿y qué me falta?');
 await expect(page.locator('.ai-transcript')).toContainText('En la biblioteca, pero faltan en el ACU');
 await ask('si agregalos');
 await expect(page.locator('.ai-ingredient-preview')).toBeVisible();
 const preview=page.locator('.ai-ingredient-preview');
 await expect(preview).toContainText('Adhesivo para porcelanato');
 await expect(preview).toContainText('Pastina para porcelanato');
 await expect(preview).toContainText('Se conservan 2 insumos existentes');
 expect(await page.evaluate(()=>window.__preserveFixture.batches.length)).toBe(0);
 await preview.getByRole('button',{name:'Sí, aprobar y cargar esta lista'}).click();
 await expect(page.locator('.ai-approval-status')).toContainText('1 ACU cargado');
 const data=await page.evaluate(()=>({batches:window.__preserveFixture.batches,components:window.__preserveFixture.state.lines[0].components}));
 expect(data.batches).toHaveLength(1);
 expect(data.components.map(item=>item.resource_id)).toEqual(['tile','labor','glue','grout']);
 expect(data.batches[0].acus[0].expected_recipe).toBe('old-recipe');
});
