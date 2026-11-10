import {test,expect} from '@playwright/test';

const projectId='30000000-0000-4000-8000-000000000001';
const estimateId='30000000-0000-4000-8000-000000000002';
const lineId='30000000-0000-4000-8000-000000000003';
const mortarId='30000000-0000-4000-8000-000000000004';
const limeId='30000000-0000-4000-8000-000000000005';
const brief='El revoque necesita cal hidratada por kg; registrar solo el insumo identificado y conservar la cantidad y los consumos de la propuesta.';

async function mount(page,body){
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body}));
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('/');
 await page.waitForFunction(()=>window.__resourceHarness?.ready);
}

const catalogCode=`
 const mortar={id:${JSON.stringify(mortarId)},code:'MAT-1',description:'Mortero',unit:'kg',kind:'material',price:'20',price_source:'catálogo:precio',active:true};
 const resources=[mortar],calls=[],imports=[],batches=[];
 const importRows=args=>{
  imports.push(structuredClone(args));
  const resourceIds=args.rows.map((row,index)=>{
   const id=index===0?${JSON.stringify(limeId)}:crypto.randomUUID();
   resources.push({...structuredClone(row),id,code:'INS-'+String(resources.length+1).padStart(4,'0'),price_source:row.price==null?'sin precio':'catálogo:nuevo',active:true});return id;
  });
  return {created:args.rows.length,resource_ids:resourceIds};
 };
`;

test('bulk review discards model prices and IDs, blocks duplicates and incomplete data, and imports only the approved selection',async({page})=>{
 await mount(page,`import './style.css';import {createAiResourceImport} from './components/ai-resource-import.js';
  ${catalogCode}
  const state={view:'resources',projectId:null,resources:structuredClone(resources)};
  const invoke=async(name,args={})=>{
   calls.push({name,args:structuredClone(args)});
   if(name==='ai_status')return {configured:true,provider:'openai',model:'fixture-model'};
   if(name==='ai_cancel')return null;
   if(name==='ai_chat')return {text:JSON.stringify({answer:'Lista para revisar',resource_proposals:[
    {description:'Cal hidratada',kind:'MAT',unit:'kg',price:'99999',code:'FAKE-1',id:'made-up'},
    {description:'Mortero',kind:'material',unit:'kg',price:'123'},
    {description:'Arena',kind:'material',unit:null,price:null}
   ]}),input_tokens:30,output_tokens:40};
   if(name==='import_resources')return importRows(args);
   throw new Error('Unexpected native command: '+name);
  };
  const component=createAiResourceImport({invoke,state,document,window,reloadCatalog:async()=>{state.resources=structuredClone(resources);}});
  window.__resourceHarness={state,calls,imports,batches,resources,component,ready:false};
  await component.open('Cal hidratada por kg y arena; dejar los precios desconocidos vacíos.');window.__resourceHarness.ready=true;
 `);
 await page.locator('[data-ai-resource-field=consent]').check();
 await page.locator('[data-ai-resource=generate]').click();
 await expect(page.locator('[data-ai-resource-row]')).toHaveCount(3);
 for(const input of await page.locator('[data-ai-resource-field=price]').all())await expect(input).toHaveValue('');
 await expect(page.locator('[data-ai-resource-field=selected]:checked')).toHaveCount(0);
 await expect(page.locator('[data-ai-resource=save]')).toBeDisabled();
 await expect(page.locator('[data-ai-resource-row="0"] [data-ai-resource-warnings]')).toContainText('Se descartó el precio');
 await expect(page.locator('[data-ai-resource-row="0"] [data-ai-resource-warnings]')).toContainText('Se descartó el identificador');
 await expect(page.locator('[data-ai-resource-row="1"] [data-ai-resource-errors]')).toContainText('ya existe o está repetido');
 await expect(page.locator('[data-ai-resource-row="2"] [data-ai-resource-errors]')).toContainText('Unidad obligatoria');
 expect(await page.evaluate(()=>window.__resourceHarness.imports)).toHaveLength(0);

 await page.locator('[data-ai-resource-field=selected][data-index="1"]').check();
 await page.locator('[data-ai-resource-field=selected][data-index="2"]').check();
 await expect(page.locator('[data-ai-resource=save]')).toBeDisabled();
 expect(await page.evaluate(()=>window.__resourceHarness.imports)).toHaveLength(0);
 await page.locator('[data-ai-resource=unselect]').click();
 await page.locator('[data-ai-resource-field=unit][data-index="2"]').fill('m³');
 await page.locator('[data-ai-resource=select-valid]').click();
 await expect(page.locator('[data-ai-resource-field=selected]:checked')).toHaveCount(2);
 await expect(page.locator('[data-ai-resource-field=selected][data-index="1"]')).not.toBeChecked();
 await expect(page.locator('[data-ai-resource=save]')).toBeEnabled();
 expect(await page.evaluate(()=>window.__resourceHarness.imports)).toHaveLength(0);
 await page.locator('[data-ai-resource=save]').click();
 await page.waitForFunction(()=>window.__resourceHarness.imports.length===1);
 const imported=await page.evaluate(()=>window.__resourceHarness.imports[0].rows);
 expect(imported).toEqual([
  {code:'',description:'Cal hidratada',kind:'material',unit:'kg',price:null},
  {code:'',description:'Arena',kind:'material',unit:'m³',price:null}
 ]);
 await expect(page.locator('[data-ai-resource-row]')).toHaveCount(1);
});

test('the real app returns from the library with the same ACU preview and an updated catalog without another AI consultation',async({page})=>{
 await mount(page,`import './style.css';import {createWorkspaceApp} from './app.js';
  ${catalogCode}
  const project={id:${JSON.stringify(projectId)},name:'Obra de muestra',currency:'ARS',read_only:false,organization_id:'org',organization_name:'Mi organización',client_id:'client'};
  const estimate={id:${JSON.stringify(estimateId)},title:'Presupuesto de muestra',currency:'ARS',issued:false};
  const line={id:${JSON.stringify(lineId)},description:'Revoque grueso',unit:'m²',quantity:'42',unit_cost:'0',total:'0',analysis_id:null,expected_recipe:null,section_id:null,section:'',components:[],takeoffs:[],formula:null};
  const totals={direct:'0',total:'0',general_expenses:'0',financial_expenses:'0',profit:'0',discount:'0',taxes:'0'};
  const invoke=async(name,args={})=>{
   calls.push({name,args:structuredClone(args)});
   if(name==='list_projects')return [project];if(name==='list_clients')return [{id:'client',name:'Comitente'}];
   if(name==='list_resources')return structuredClone(resources);
   if(name==='list_organizations')return [{id:'org',name:'Mi organización',ownership:'own',is_default:true,profile:{company_name:'Mi organización',logo_png:[]}}];
   if(['list_analyses','list_persons','list_management_records','p2p_projects','list_budget_sections','list_line_sections','list_measured_lines','list_takeoffs'].includes(name))return [];
   if(name==='list_project_estimates')return [estimate];if(name==='list_estimate_lines')return [structuredClone(line)];
   if(name==='get_estimate_pricing')return {general_expenses_percent:'0',financial_expenses_percent:'0',profit_percent:'0',discount_percent:'0',tax_percent:'0'};
   if(name==='priced_estimate_total')return totals;if(name==='get_estimate_resource_prices')return {};
   if(name==='ai_status')return {configured:true,persistent:true,provider:'openai',model:'fixture-model'};
   if(name==='assisted_acu_context')return {currency:'ARS',resources:structuredClone(resources),lines:[structuredClone(line)],sections:[]};
   if(name==='assisted_acu_references')return [];
   if(name==='ai_chat'){
    const answer=args.mode==='resources'
     ? {answer:'Faltante identificado para revisar',resource_proposals:[{description:'Cal hidratada',kind:'material',unit:'kg',price:'99999'}]}
     : {answer:'Falta cal hidratada',acu_proposals:[{line_id:line.id,components:[{resource_id:mortar.id,quantity:'0.25'},{resource_id:'MAT-FUERA',description:'Cal hidratada',quantity:'0.1'}],measurements:[],assumptions:['Consumos de la propuesta original para revisar'],missing_resources:['Cal hidratada por kg, según indicación del usuario']}]};
    return {text:JSON.stringify(answer),input_tokens:30,output_tokens:40};
   }
   if(name==='import_resources')return importRows(args);
   if(name==='apply_reviewed_budget_batch'){batches.push(structuredClone(args.batch));return {composed:args.batch.acus.length,created:args.batch.creates.length};}
   if(name==='ai_cancel')return null;throw new Error('Unexpected native command: '+name);
  };
  const app=createWorkspaceApp({invoke,document,window});window.__resourceHarness={app,calls,imports,batches,resources,ready:false};
  await app.ready;Object.assign(app.state,{view:'workspace',projectId:project.id,estimateId:estimate.id,estimates:[estimate],lines:[line],sections:[],assignments:{},selectedLineId:line.id,panel:'acu',totals,rates:{}});app.render();window.__resourceHarness.ready=true;
 `);
 await page.locator('.ai-launch').click();
 await expect(page.locator('#ai-settings')).toHaveCount(0);
 await page.locator('[name=ai-consent]').check();
 await page.locator('[data-ai=acu-workbench]').click();
 await page.locator('[data-acu-field=brief]').fill(brief);
 await page.locator('[data-acu=generate]').click();
 await expect(page.locator('[data-acu-proposal]')).toHaveCount(1);
 await page.locator('[data-acu-row=selected]').check();
 await page.locator('[data-acu-proposal] [data-acu=library]').first().click();
 await expect(page.locator('.acu-library-return')).toBeVisible();
 expect(await page.evaluate(()=>({view:window.__resourceHarness.app.state.view,projectId:window.__resourceHarness.app.state.projectId}))).toEqual({view:'resources',projectId:null});

 await page.locator('.acu-library-return [data-action=ai-resource-open]').click();
 expect(await page.locator('[data-ai-resource-field=brief]').inputValue()).toContain(brief);
 expect(await page.locator('[data-ai-resource-field=brief]').inputValue()).toContain('Cal hidratada');
 expect(await page.locator('[data-ai-resource-field=brief]').inputValue()).not.toContain('MAT-FUERA');
 await page.locator('[data-ai-resource-field=consent]').check();
 await page.locator('[data-ai-resource=generate]').click();
 await expect(page.locator('[data-ai-resource-row]')).toHaveCount(1);
 await expect(page.locator('[data-ai-resource-field=price]')).toHaveValue('');
 await page.locator('[data-ai-resource-field=price]').fill('300');
 await page.locator('[data-ai-resource=select-valid]').click();
 await page.locator('[data-ai-resource=save]').click();
 await page.waitForFunction(()=>window.__resourceHarness.imports.length===1);
 await page.locator('[data-ai-resource=close]').first().click();
 await page.locator('[data-action=acu-library-return]').click();

 await expect(page.locator('[data-acu-proposal]')).toHaveCount(1);
 await expect(page.locator('[data-acu-field=brief]')).toHaveValue(brief);
 await expect(page.locator('[data-acu-row=selected]')).not.toBeChecked();
 await expect(page.locator('[data-acu-row=quantity]')).toHaveValue('42');
 await expect(page.locator('[data-acu-component=quantity]').nth(0)).toHaveValue('0.25');
 await expect(page.locator('[data-acu-component=quantity]').nth(1)).toHaveValue('0.1');
 await expect(page.locator('[data-acu-component=resource_id]').nth(1)).toHaveValue('Cal hidratada');
 await expect(page.locator('#acu-resource-list option')).toHaveCount(2);
 await expect(page.locator('footer [data-acu=apply]')).toBeDisabled();
 const result=await page.evaluate(()=>({
  state:{view:window.__resourceHarness.app.state.view,projectId:window.__resourceHarness.app.state.projectId,estimateId:window.__resourceHarness.app.state.estimateId,lineId:window.__resourceHarness.app.state.selectedLineId},
  modes:window.__resourceHarness.calls.filter(call=>call.name==='ai_chat').map(call=>call.args.mode),imports:window.__resourceHarness.imports,batches:window.__resourceHarness.batches
 }));
 expect(result.state).toEqual({view:'workspace',projectId,estimateId,lineId});
 expect(result.modes).toEqual(['acu','resources']);
 expect(result.imports[0].rows).toEqual([{code:'',description:'Cal hidratada',kind:'material',unit:'kg',price:'300'}]);
 expect(result.batches).toEqual([]);

 // Returning makes the new resource available, but leaves the actual matching
 // and approval to the user instead of guessing from a similar description.
 const label=await page.locator('#acu-resource-list option').evaluateAll(options=>options.find(option=>option.value.includes('Cal hidratada')).value);
 await page.locator('[data-acu-component=resource_id]').nth(1).fill(label);
 await page.locator('[data-acu-row=missing_resolved]').check();
 await page.locator('[data-acu-row=selected]').check();
 await expect(page.locator('footer [data-acu=apply]')).toBeEnabled();
 expect(await page.evaluate(()=>window.__resourceHarness.calls.filter(call=>call.name==='ai_chat').length)).toBe(2);
});
