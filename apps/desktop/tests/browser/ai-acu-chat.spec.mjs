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
  const structure=${JSON.stringify(reply==='structure')};
  const extra={...resource,id:'unplanned',description:'Alquiler tijera elevadora',kind:'equipment',unit:'día'};
  const house=${JSON.stringify(reply==='house')};
  const brick12={...resource,id:'brick12',description:'Ladrillo cerámico hueco 12 x 18 x 33 cm',unit:'un'};
  const brick18={...brick12,id:'brick18',description:'Ladrillo cerámico hueco 18 x 18 x 33 cm'};
  const light={...resource,id:'light',description:'Instalación de artefacto de luz',kind:'labor',unit:'un'};
  const basin={...light,id:'basin',description:'Colocación de bacha de baño'};
  const resources=house?[brick12,brick18,light,basin]:structure?[resource,extra]:[resource];
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
   if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:structuredClone(state.lines),sections:[]};
   if(name==='assisted_acu_references')return [];
   if(name==='ai_chat'){
    if(house&&args.mode==='plan'){
     const wall=(brick,thickness)=>({description:'Construcción de muros con ladrillo cerámico hueco '+thickness+' cm',
      unit:'m²',quantity:null,work_result:'Muro terminado',resources:[
       {name:brick.description,kind:'material',unit:'un'},
       {name:light.description,kind:'labor',unit:'un'},
       {name:'Lechada o adhesivo para revoque',kind:'material',unit:'kg'}
      ]});
     return {text:JSON.stringify({work_sections:[
      {title:'Muros',partidas:[wall(brick12,12),wall(brick18,18)]},
      {title:'Aberturas',partidas:[{description:'Colocación de aberturas de aluminio',unit:'m²',quantity:null,
       work_result:'Aberturas colocadas',resources:[{name:'Abertura de aluminio',kind:'material',unit:'m²'}]}]}
     ]})};
    }
    if(structure&&args.mode==='plan')return {text:JSON.stringify({work_sections:[{title:'Muros',partidas:[{
     description:'Revoque con mortero',unit:'m²',quantity:null,work_result:'Muro revocado',
     resources:[{name:'Mortero',kind:'material',unit:'kg'}]
    }]}]})};
    if(args.mode==='acu'){
     const context=JSON.parse(args.context);
     if(house)return {text:JSON.stringify({acu_proposals:context.targets.map(target=>{
      const brick=target.description.includes('12 cm')?brick12:target.description.includes('18 cm')?brick18:null;
      if(!brick)return context.previous_review?
       {line_id:target.line_id,components:[],missing_resources:[{description:'Medidas y tipos de aberturas',action:'specify',reason:'No se indicaron dimensiones'}]}:
       {line_id:target.line_id,components:[{resource_id:basin.id,quantity:'1'}]};
      return {line_id:target.line_id,components:context.previous_review?[{resource_id:brick.id,quantity:'16'}]:
       [{resource_id:brick.id,quantity:'50'},{resource_id:light.id,quantity:'0.2'}]};
     })})};
     return {text:JSON.stringify({answer:'Recetas para revisar',acu_proposals:context.targets.map(target=>({
      line_id:target.line_id,components:[{resource_id:resource.id,quantity:'0.25'},...(structure&&target.is_new?[{resource_id:extra.id,quantity:'0.02'}]:[])],
      measurements:[],assumptions:['Consumo estimativo por m² para revisar.'],missing_resources:[]
     }))}),input_tokens:50,output_tokens:50};
    }
    const answer=${JSON.stringify(reply)}==='legacy'
     ? {answer:'Estos son los consumos de las partidas existentes.',proposal_lines:[{description:'Agregar material',unit:'gl',quantity:null,unit_price:null,section:'Insumos'}]}
     : {answer:'Podés completar los insumos de las partidas existentes desde la preparación de ACU.',acu_request:{mode:'fill',brief:${JSON.stringify(handoffBrief)},line_ids:[${JSON.stringify(reply==='foreign'?foreignLineId:firstLineId)}]},proposal_lines:[{description:'Agregar material'}]};
    return {text:JSON.stringify(answer),input_tokens:50,output_tokens:50};
   }
   if(name==='apply_reviewed_budget_batch'){
    const batch=structuredClone(args.batch);batches.push(batch);
    for(const created of batch.creates)state.lines.push({...created,components:[],analysis_id:null,unit_cost:created.unit_price});
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
 await expect(page.locator('.ai-message.ai-user')).toContainText('¿Qué recomendás revisar en este presupuesto?');
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
 await expect(page.locator('.ai-transcript')).toContainText('Estos son los consumos de las partidas existentes');
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

test('clearing the chat preserves the budget and an already composed selection yields zero proposals',async({page})=>{
 await chatFixture(page);
 await ask(page,'¿Qué recomendás revisar en este presupuesto?');
 await expect(page.getByRole('button',{name:'Revisar antes de cargar',exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const line=window.__aiAcuHarness.state.lines[0];
  line.analysis_id='existing-acu';
  line.components=[{quantity:'3',resource_id:'existing-resource'}];
 });
 await page.getByTitle('Limpiar conversación').click();
 await expect(page.locator('.ai-message')).toHaveCount(0);
 await ask(page,'¿Qué recomendás revisar en este presupuesto?');
 await expect(page.getByRole('button',{name:'Revisar antes de cargar',exact:true})).toBeVisible();
 await ask(page,'perfecto, cargalos');
 await expect(page.locator('.ai-transcript')).toContainText('0 propuestas: no hay partidas seleccionadas sin ACU');
 const result=await page.evaluate(()=>{
  const {state,calls,batches}=window.__aiAcuHarness;
  return {composition:state.lines[0].components,acuCalls:calls.filter(call=>call.args.mode==='acu'),batches};
 });
 expect(result.composition).toEqual([{quantity:'3',resource_id:'existing-resource'}]);
 expect(result.acuCalls).toEqual([]);
 expect(result.batches).toEqual([]);
});


test('a structure-only save reports zero ACU and retries with the reason on the existing line',async({page})=>{
 await chatFixture(page,{reply:'structure'});
 const prompt='Prepará partidas nuevas con ACU para una casa con muros a revocar.';
 await ask(page,prompt);
 await expect(page.locator('.ai-message.ai-user').first()).toContainText(prompt);
 await expect(page.locator('.ai-acu-tree-errors')).toContainText('Insumo sin requisito en esta partida: Alquiler tijera elevadora');
 await ask(page,'sí, aprobado');
 expect(await page.evaluate(()=>window.__aiAcuHarness.batches)).toHaveLength(0);
 await page.getByRole('button',{name:'Guardar solo rubros y partidas (sin ACU)',exact:true}).click();
 await expect(page.locator('.ai-approval-status')).toContainText('0 ACU guardados');
 await expect(page.locator('.ai-message.ai-user').first()).toContainText(prompt);
 await page.getByRole('button',{name:'Completar 1 ACU pendientes'}).click();
 const preview=page.getByRole('button',{name:'Aprobar y guardar 1 ACU completos'});
 await expect(preview).toBeVisible();

 const before=await page.evaluate(()=>{
  const {calls,batches}=window.__aiAcuHarness;
  return {batches,contexts:calls.filter(call=>call.args.mode==='acu').map(call=>JSON.parse(call.args.context))};
 });
 expect(before.batches).toHaveLength(1);
 expect(before.batches[0].acus).toEqual([]);
 expect(before.contexts).toHaveLength(2);
 const saved=before.batches[0].creates[0];
 expect(saved.quantity).toBe('0');
 expect(before.contexts[1].targets).toMatchObject([{line_id:saved.id,is_new:false}]);
 expect(before.contexts[1].previous_review).toMatchObject([{
  line_id:saved.id,errors:['Insumo sin requisito en esta partida: Alquiler tijera elevadora']
 }]);

 await preview.click();
 const after=await page.evaluate(()=>window.__aiAcuHarness.batches);
 expect(after).toHaveLength(2);
 expect(after[1]).toMatchObject({creates:[],deletes:[],updates:[],acus:[{line_id:saved.id,measurements:null,
  expected:{quantity:'0'},components:[{resource_id:resourceId,quantity:'0.25'}]}]});
});



test('mixed house proposals are corrected separately and a pending opening does not block valid wall ACU',async({page})=>{
 await chatFixture(page,{reply:'house'});
 await ask(page,'Prepará partidas nuevas con ACU para una casa de 120 m² con muros de ladrillo del 12 y 18 y aberturas de aluminio sin definir.');
 const approve=page.getByRole('button',{name:'Aprobar y guardar 2 ACU completos · 1 pendientes',exact:true});
 await expect(approve).toBeVisible();
 const tree=page.locator('.ai-acu-review-tree');
 await expect(tree.locator('.ai-acu-tree-line').filter({hasText:'12 cm'})).toContainText('16 un / m²');
 await expect(tree.locator('.ai-acu-tree-line').filter({hasText:'aberturas de aluminio'})).toContainText('ACU pendiente');
 await expect(tree).not.toContainText('Instalación de artefacto de luz');
 await expect(tree).not.toContainText('Colocación de bacha de baño');
 const contexts=await page.evaluate(()=>window.__aiAcuHarness.calls.filter(call=>call.args.mode==='acu').map(call=>JSON.parse(call.args.context)));
 const corrections=contexts.filter(context=>context.previous_review);
 expect(corrections).toHaveLength(3);
 expect(corrections.every(context=>context.targets.length===1)).toBe(true);
 for(const context of corrections.slice(0,2)){
  expect(context.previous_review[0].errors.join(' ')).toContain('Consumo incompatible con la cara del ladrillo');
  expect(context.resources.map(resource=>resource.resource_id)).not.toContain('light');
 }
 expect(new Set(contexts[0].targets.flatMap(target=>target.required_resources.map(requirement=>requirement.id))).size).toBe(2);
 expect(await page.evaluate(()=>window.__aiAcuHarness.batches)).toHaveLength(0);

 await approve.click();
 await expect(page.locator('.ai-approval-status')).toContainText('2 ACU cargados y 3 partidas nuevas creadas; 1 pendiente');
 const [batch]=await page.evaluate(()=>window.__aiAcuHarness.batches);
 expect(batch.creates).toHaveLength(3);
 expect(batch.creates.every(line=>line.quantity==='0')).toBe(true);
 expect(batch.acus.map(acu=>acu.components.map(component=>[component.resource_id,component.quantity]))).toEqual([
  [['brick12','16']],[['brick18','16']]
 ]);
 expect(batch.acus.every(acu=>acu.measurements===null)).toBe(true);
});
