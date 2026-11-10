import {test,expect} from '@playwright/test';

const resourceId='10000000-0000-4000-8000-000000000001';
const firstNewLineId='10000000-0000-4000-8000-000000000011';
const secondNewLineId='10000000-0000-4000-8000-000000000012';

// Isolate the real workbench component from the rest of the app and native IPC.
// All AI replies and writes are simulated; this fixture never contacts a provider.
async function componentFixture(page,{invalidResource=false}={}){
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:`
  import './style.css';
  import {createAcuWorkbench} from './components/ai-acu-workbench.js';
  const resource={id:${JSON.stringify(resourceId)},code:'MAT-001',description:'Mortero',unit:'kg',kind:'material',price:'20',price_source:'catálogo:price-1'};
  const oldLine={id:'10000000-0000-4000-8000-000000000002',description:'Partida anterior',unit:'m²',quantity:'10',unit_cost:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',components:[],takeoffs:[],formula:null};
  const state={view:'workspace',projectId:'project-1',estimateId:'estimate-1',projects:[{id:'project-1',currency:'ARS'}],estimates:[{id:'estimate-1',title:'Presupuesto de prueba',currency:'ARS',issued:false}],lines:[oldLine],sections:[],assignments:{},selectedLineId:oldLine.id,panel:'summary',search:'filtro anterior'};
  const outline=[
   {new_id:${JSON.stringify(firstNewLineId)},description:'Revoque grueso',unit:'m²',quantity:'42',section:'Revoques'},
   {new_id:${JSON.stringify(secondNewLineId)},description:'Revoque fino',unit:'m²',quantity:'42',section:'Revoques'}
  ];
  const calls=[],batches=[],loads=[];
  const harness={state,calls,batches,loads,ready:false};window.__acuHarness=harness;
  const renderBudget=()=>{
   const shown=state.lines.find(line=>line.id===state.selectedLineId);
   const app=document.querySelector('#app');app.replaceChildren();
   const title=document.createElement('h2');title.textContent='Presupuesto de prueba';app.append(title);
   if(shown){const row=document.createElement('div');row.dataset.shownLine=shown.id;row.textContent=shown.description;app.append(row);}
  };
  const invoke=async(name,args={})=>{
   calls.push({name,args:structuredClone(args)});
   if(name==='assisted_acu_context')return {currency:'ARS',resources:[{...structuredClone(resource),price_source:batches.length?'presupuesto':resource.price_source}],lines:structuredClone(state.lines),sections:structuredClone(state.sections)};
   if(name==='assisted_acu_references')return [];
   if(name==='ai_cancel')return null;
   if(name==='ai_chat'){
    const context=JSON.parse(args.context);
    return {text:JSON.stringify({answer:'Recetas para revisar',acu_proposals:context.targets.map(target=>({line_id:target.line_id,components:[{resource_id:${invalidResource?"'unavailable-resource'":JSON.stringify(resourceId)},quantity:'0.25'}],measurements:[],section:'Revoques',assumptions:'Consumo preliminar por m²; revisar el espesor antes de aplicar.',missing_resources:''}))}),input_tokens:100,output_tokens:200};
   }
   if(name==='apply_reviewed_budget_batch'){
    const batch=structuredClone(args.batch);batches.push(batch);
    for(const created of batch.creates)state.lines.push({...created,unit_cost:'5.00',analysis_id:'private-analysis-'+created.id,components:batch.acus.find(acu=>acu.line_id===created.id)?.components||[]});
    return {updated:batch.updates.length,created:batch.creates.length,deleted:batch.deletes.length,composed:batch.acus.length};
   }
   throw new Error('Unexpected native command: '+name);
  };
  const loadEstimate=async()=>{loads.push({selectedLineId:state.selectedLineId,panel:state.panel,search:state.search,view:state.view});renderBudget();};
  const workbench=createAcuWorkbench({invoke,state,document,window,loadEstimate,loadEstimates:async()=>{},openEstimate:async(id,selectedLineId)=>{state.estimateId=id;if(selectedLineId)state.selectedLineId=selectedLineId;await loadEstimate();},canUseAi:()=>true});
  harness.workbench=workbench;renderBudget();
  await workbench.open('Preparar revoques con los insumos de biblioteca.',outline,'create');harness.ready=true;
 `}));
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('/');
 await page.waitForFunction(()=>window.__acuHarness?.ready);
}

test('an outline is a list of targets, not saved ACU recipes',async({page})=>{
 await componentFixture(page);
 await expect(page.locator('[data-acu-target]')).toHaveCount(2);
 await expect(page.locator('[data-acu-proposal]')).toHaveCount(0);
 await expect(page.locator('[data-acu=generate]')).toBeEnabled();
 await expect(page.locator('[data-acu=generate]')).toContainText(/2\.\s*Generar ACU/);
 await expect(page.locator('footer [data-acu=apply]')).toBeDisabled();
 expect(await page.evaluate(()=>window.__acuHarness.batches)).toHaveLength(0);
});

test('string notes do not discard valid recipes and saving requires an approved selection',async({page})=>{
 await componentFixture(page);
 await page.locator('[data-acu=generate]').click();
 await expect(page.locator('[data-acu-proposal]')).toHaveCount(2);
 await expect(page.locator('.acu-body > .acu-error')).not.toContainText('Notas del ACU inválidas');
 await expect(page.locator('[data-acu-row=selected]').nth(0)).not.toBeChecked();
 await expect(page.locator('[data-acu-row=selected]').nth(1)).not.toBeChecked();
 await expect(page.locator('footer [data-acu=apply]')).toBeDisabled();
 expect(await page.evaluate(()=>window.__acuHarness.batches)).toHaveLength(0);
 await page.locator('[data-acu-row=selected]').nth(0).check();
 await expect(page.locator('footer [data-acu=apply]')).toBeEnabled();
 await expect(page.locator('footer [data-acu=apply]')).toContainText(/Guardar\s+1\s+ACU/);
});

test('saving creates the selected lines and ACU, then focuses the result in the budget',async({page})=>{
 await componentFixture(page);
 await page.locator('[data-acu=generate]').click();
 await expect(page.locator('[data-acu-proposal]')).toHaveCount(2);
 await page.locator('[data-acu-row=selected]').nth(0).check();
 await page.locator('footer [data-acu=apply]').click();
 await expect(page.locator('[data-acu=view-result]')).toBeVisible();
 await expect(page.locator('[data-acu=view-result]')).toHaveText('Ver en presupuesto');
 await expect(page.locator('.acu-body > [role=status]')).toContainText(/Guardado|guardaron/);
 const result=await page.evaluate(()=>({batches:window.__acuHarness.batches,loads:window.__acuHarness.loads}));
 expect(result.batches).toHaveLength(1);
 expect(result.batches[0].creates).toHaveLength(1);
 expect(result.batches[0].acus).toHaveLength(1);
 expect(result.batches[0].creates[0].id).toBe(firstNewLineId);
 expect(result.batches[0].acus[0].line_id).toBe(firstNewLineId);
 expect(result.batches[0].acus[0].components[0].expected_resource.price).toBe('20');
 expect(result.loads).toContainEqual(expect.objectContaining({selectedLineId:firstNewLineId,panel:'acu',search:''}));
 await page.locator('[data-acu=view-result]').click();
 await expect(page.getByRole('dialog',{name:'ACU con insumos y rendimientos'})).toHaveCount(0);
 await expect(page.locator('#app [data-shown-line]')).toHaveAttribute('data-shown-line',firstNewLineId);
 await expect(page.locator('#app [data-shown-line]')).toHaveText('Revoque grueso');
});

test('an invalid resource still blocks saving and clears the stale preparing status',async({page})=>{
 await componentFixture(page,{invalidResource:true});
 await page.locator('[data-acu=generate]').click();
 await expect(page.locator('.acu-body > .acu-error')).toContainText(/insumo desconocido/);
 await expect(page.locator('.acu-body > [role=status]')).not.toContainText('Preparando consultas');
 await expect(page.locator('[data-acu-proposal]')).toHaveCount(0);
 await expect(page.locator('footer [data-acu=apply]')).toBeDisabled();
 expect(await page.evaluate(()=>window.__acuHarness.batches)).toHaveLength(0);
});

test('partial saving preserves the remaining recipe without another AI request and uses a new batch id',async({page})=>{
 await componentFixture(page);
 await page.locator('[data-acu=generate]').click();
 await expect(page.locator('[data-acu-proposal]')).toHaveCount(2);
 await page.locator('[data-acu-row=selected]').nth(0).check();
 await page.locator('footer [data-acu=apply]').click();
 await expect(page.locator('[data-acu=continue]')).toContainText(/1 pendiente/);
 const firstSave=await page.evaluate(()=>({
  aiCalls:window.__acuHarness.calls.filter(call=>call.name==='ai_chat').length,
  batchId:window.__acuHarness.batches[0].id
 }));
 expect(firstSave.aiCalls).toBe(1);

 await page.locator('[data-acu=continue]').click();
 const remaining=page.locator(`[data-acu-proposal="${secondNewLineId}"]`);
 await expect(page.locator('[data-acu-proposal]')).toHaveCount(1);
 await expect(remaining).toBeVisible();
 await expect(remaining.locator('summary')).toContainText('Revoque fino');
 await expect(remaining.locator('[data-acu-row=selected]')).not.toBeChecked();
 await expect(remaining.locator('[data-acu-component=quantity]')).toHaveValue('0.25');
 await expect(remaining.locator('[data-acu-row=assumptions]')).toHaveValue(/Consumo preliminar por m²/);
 await expect(page.locator('footer [data-acu=apply]')).toBeDisabled();
 expect(await page.evaluate(()=>window.__acuHarness.calls.filter(call=>call.name==='ai_chat').length)).toBe(firstSave.aiCalls);

 await remaining.locator('[data-acu-row=selected]').check();
 await page.locator('footer [data-acu=apply]').click();
 await expect(page.locator('[data-acu=view-result]')).toBeVisible();
 const result=await page.evaluate(()=>({batches:window.__acuHarness.batches,aiCalls:window.__acuHarness.calls.filter(call=>call.name==='ai_chat').length}));
 expect(result.aiCalls).toBe(firstSave.aiCalls);
 expect(result.batches).toHaveLength(2);
 expect(result.batches[0].id).toBeTruthy();
 expect(result.batches[1].id).toBeTruthy();
 expect(result.batches[1].id).not.toBe(firstSave.batchId);
 expect(result.batches[1].creates.map(line=>line.id)).toEqual([secondNewLineId]);
 expect(result.batches[1].acus.map(acu=>acu.line_id)).toEqual([secondNewLineId]);
 expect(result.batches[1].acus[0].components[0].expected_resource.price_source).toBe('presupuesto');
 await expect(page.locator('[data-acu=continue]')).toHaveCount(0);
});
