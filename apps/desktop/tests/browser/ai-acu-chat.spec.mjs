import {test,expect} from '@playwright/test';

const firstLineId='20000000-0000-4000-8000-000000000001';
const secondLineId='20000000-0000-4000-8000-000000000002';
const resourceId='20000000-0000-4000-8000-000000000003';
const foreignLineId='20000000-0000-4000-8000-000000000099';
const handoffBrief='Completar el ACU de la partida de revoque grueso existente, sin crear ni duplicar partidas. Usar los insumos de la biblioteca y sus unidades actuales. Revisar un espesor de 15 mm, conservar la cantidad presupuestada y explicar el desperdicio incluido. La mano de obra debe expresarse en jornales, con la jornada de trabajo indicada como hipótesis para revisar.';
const legacyBrief='Las partidas Revoque grueso y Revoque fino ya existen en este presupuesto, con sus cantidades cargadas y sus ACU vacíos. Para sus insumos y rendimientos: el grueso tiene 15 mm de espesor y el fino 3 mm. El mortero disponible está en kg y la mano de obra, si corresponde, en jornales. Estas son las condiciones de las partidas existentes; sus cantidades deben conservarse.';

// Exercise the actual chat and workbench together, replacing only native IPC.
// This fixture never calls an AI provider or writes a real project/database.
async function chatFixture(page,{reply='handoff'}={}){
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:`
  import './style.css';
  import {createAiAssistant} from './components/ai-assistant.js';
  const resource={id:${JSON.stringify(resourceId)},code:'MAT-001',description:'Mortero',unit:'kg',kind:'material',price:'20',price_source:'catálogo:price-1'};
  const line=(id,description)=>({id,description,unit:'m²',quantity:'42',unit_cost:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',components:[],takeoffs:[],formula:null});
  const state={view:'workspace',projectId:'project-1',estimateId:'estimate-1',projects:[{id:'project-1',currency:'ARS'}],estimates:[{id:'estimate-1',title:'Presupuesto de prueba',currency:'ARS',issued:false}],lines:[line(${JSON.stringify(firstLineId)},'Revoque grueso'),line(${JSON.stringify(secondLineId)},'Revoque fino')],sections:[],assignments:{},selectedLineId:${JSON.stringify(firstLineId)},panel:'acu',search:''};
  const calls=[],batches=[],loads=[];
  const harness={state,calls,batches,loads,ready:false};window.__aiAcuHarness=harness;
  const renderBudget=()=>{
   const app=document.querySelector('#app');app.replaceChildren();
   const heading=document.createElement('h2');heading.textContent='Presupuesto de prueba';app.append(heading);
   for(const item of state.lines){const row=document.createElement('div');row.dataset.lineId=item.id;row.textContent=item.description+' · '+item.quantity+' '+item.unit;app.append(row);}
  };
  const invoke=async(name,args={})=>{
   calls.push({name,args:structuredClone(args)});
   if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
   if(name==='ai_cancel')return null;
   if(name==='ai_catalog_context')return {currency:'ARS',as_of:args.asOf,resources:[structuredClone(resource)]};
   if(name==='assisted_acu_context')return {currency:'ARS',resources:[structuredClone(resource)],lines:structuredClone(state.lines),sections:[]};
   if(name==='assisted_acu_references')return [];
   if(name==='ai_chat'){
    if(args.mode==='acu'){
     const context=JSON.parse(args.context);
     return {text:JSON.stringify({answer:'Recetas para revisar',acu_proposals:context.targets.map(target=>({line_id:target.line_id,components:[{resource_id:${JSON.stringify(resourceId)},quantity:'0.25'}],measurements:[],assumptions:['Consumo estimativo por m² para revisar.'],missing_resources:[]}))}),input_tokens:50,output_tokens:50};
    }
    const answer=${JSON.stringify(reply)}==='legacy'
     ? {answer:'Estos son los consumos de las partidas existentes.',proposal_lines:[{description:'Agregar material',unit:'gl',quantity:null,unit_price:null,section:'Insumos'}]}
     : {answer:'Podés completar los insumos de las partidas existentes desde la preparación de ACU.',acu_request:{mode:'fill',brief:${JSON.stringify(handoffBrief)},line_ids:[${JSON.stringify(reply==='foreign'?foreignLineId:firstLineId)}]},proposal_lines:[{description:'Agregar material'}]};
    return {text:JSON.stringify(answer),input_tokens:50,output_tokens:50};
   }
   if(name==='apply_reviewed_budget_batch'){
    const batch=structuredClone(args.batch);batches.push(batch);
    for(const acu of batch.acus){const existing=state.lines.find(item=>item.id===acu.line_id);if(!existing)throw new Error('The chat must not invent a target line');existing.components=structuredClone(acu.components);existing.unit_cost='5.00';existing.analysis_id='private-analysis-'+existing.id;}
    return {updated:batch.updates.length,created:batch.creates.length,deleted:batch.deletes.length,composed:batch.acus.length};
   }
   throw new Error('Unexpected native command: '+name);
  };
  const loadEstimate=async()=>{loads.push({selectedLineId:state.selectedLineId,panel:state.panel,search:state.search});renderBudget();};
  const assistant=createAiAssistant({invoke,state,document,window,openModal:()=>{throw new Error('ACU completion must not open a new-line form');},editable:()=>true,loadEstimate,loadEstimates:async()=>{},openEstimate:async(id,selectedLineId)=>{state.estimateId=id;if(selectedLineId)state.selectedLineId=selectedLineId;await loadEstimate();}});
  harness.assistant=assistant;renderBudget();harness.ready=true;
 `}));
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('/');
 await page.waitForFunction(()=>window.__aiAcuHarness?.ready);
 await page.locator('[data-ai=toggle]').click();
 await expect(page.locator('#ai-console')).toBeVisible();
 await expect(page.locator('#ai-settings')).toHaveCount(0);
 await page.locator('[name=ai-consent]').check();
}

async function ask(page,question){
 await page.locator('#ai-prompt').fill(question);
 await page.locator('#ai-question button').click();
}

test('a structured ACU handoff opens the exact existing targets and ignores an unrelated invalid outline',async({page})=>{
 await chatFixture(page);
 await ask(page,'¿Qué recomendás revisar en este presupuesto?');
 const handoff=page.getByRole('button',{name:'Revisar antes de cargar',exact:true});
 await expect(handoff).toBeVisible();
 await expect(page.locator('.ai-transcript')).not.toContainText('La lista de partidas no es válida');
 await expect(page.locator('[data-ai=review-plan]')).toHaveCount(0);
 await handoff.click();

 await expect(page.locator('[data-acu-field=mode]')).toHaveValue('fill');
 await expect(page.locator('[data-acu-field=brief]')).toHaveValue(handoffBrief);
 await expect(page.locator('[data-acu-target]')).toHaveCount(2);
 await expect(page.locator(`[data-acu-target="${firstLineId}"]`)).toBeChecked();
 await expect(page.locator(`[data-acu-target="${secondLineId}"]`)).not.toBeChecked();
 await expect(page.locator('[data-acu-seed]')).toHaveCount(0);
 await expect(page.locator('[data-acu=outline]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__aiAcuHarness.calls.filter(call=>call.name==='ai_chat').length)).toBe(1);
 expect(await page.evaluate(()=>window.__aiAcuHarness.batches)).toHaveLength(0);
});

test('a short confirmation loads legacy ACU recipes headlessly with the original target selection',async({page})=>{
 await chatFixture(page,{reply:'legacy'});
 await ask(page,legacyBrief);
 await expect(page.locator('.ai-transcript')).toContainText('Podemos revisar la composición');
 await expect(page.locator('[data-ai=review-plan]')).toBeVisible();
 expect(await page.evaluate(()=>window.__aiAcuHarness.calls.filter(call=>call.name==='ai_chat').length)).toBe(1);

 await ask(page,'perfecto, cargalos');
 await expect(page.locator('.ai-ingredient-preview')).toContainText('Mortero');
 expect(await page.evaluate(()=>window.__aiAcuHarness.batches.length)).toBe(0);
 await ask(page,'sí, aprobado');
 await expect(page.locator('.ai-approval-status')).toContainText('2 ACU');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('[data-ai=review-acu-request]')).toHaveCount(0);
 const result=await page.evaluate(()=>({batches:window.__aiAcuHarness.batches,calls:window.__aiAcuHarness.calls.filter(call=>call.name==='ai_chat')}));
 expect(result.calls).toHaveLength(2);
 expect(result.calls[1].args.mode).toBe('acu');
 expect(result.batches).toHaveLength(1);
 expect(result.batches[0].creates).toEqual([]);
 expect(result.batches[0].acus.map(acu=>acu.line_id)).toEqual([firstLineId,secondLineId]);
 expect(result.batches[0].acus.map(acu=>acu.expected.quantity)).toEqual(['42','42']);
});

test('a handoff with a foreign line id clears the selection instead of generating ACU for every line',async({page})=>{
 await chatFixture(page,{reply:'foreign'});
 await ask(page,'¿Qué recomendás revisar en este presupuesto?');
 await page.getByRole('button',{name:'Revisar antes de cargar',exact:true}).click();
 await expect(page.locator('[data-acu-field=mode]')).toHaveValue('fill');
 await expect(page.locator('.acu-body > .acu-error')).toContainText('no corresponden a este presupuesto');
 await expect(page.locator('[data-acu-target]')).toHaveCount(2);
 await expect(page.locator('[data-acu-target]:checked')).toHaveCount(0);
 await expect(page.locator('[data-acu=generate]')).toBeDisabled();
 await expect(page.locator('[data-acu-proposal]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__aiAcuHarness.calls.filter(call=>call.name==='ai_chat').length)).toBe(1);
 expect(await page.evaluate(()=>window.__aiAcuHarness.batches)).toHaveLength(0);
});
