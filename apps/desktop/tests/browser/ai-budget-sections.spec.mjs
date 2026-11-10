import {test,expect} from '@playwright/test';
const source=String.raw`import './style.css';
import {createAiAssistant} from './components/ai-assistant.js';
const project='96000000-0000-4000-8000-000000000001';
const estimate='96000000-0000-4000-8000-000000000002';
const line='96000000-0000-4000-8000-000000000003';
const state={view:'workspace',projectId:project,estimateId:estimate,
 projects:[{id:project,currency:'ARS'}],
 estimates:[{id:estimate,title:'Presupuesto preliminar',issued:false,currency:'ARS'}],
 lines:[{id:line,description:'Excavación',unit:'m³',quantity:'15',unit_cost:'5000',components:[]}],
 sections:[],assignments:{},selectedLineId:line,selectedSectionId:null,search:'',panel:'budget'};
const harness={state,writes:[],calls:[],ready:false};window.__sectionHarness=harness;
const render=()=>{document.querySelector('#app').textContent='Presupuesto preliminar';};
const invoke=async(name,args={})=>{
 harness.calls.push({name,args:structuredClone(args)});
 if(name==='ai_status')return {configured:true,provider:'openai',model:'test-model'};
 if(name==='ai_cancel')return null;
 if(name==='ai_catalog_context')return {currency:'ARS',resources:[]};
 if(name==='assisted_acu_context')return {currency:'ARS',resources:[],lines:structuredClone(state.lines),sections:[]};
 if(name==='ai_chat'){
  const question=args.messages.at(-1).content.toLowerCase();
  if(question.includes('9 partidas')&&!question.includes('convert')){
   const names=['Movimiento de suelos','Fundaciones','Estructuras','Mampostería','Cubiertas','Revestimientos','Sanitaria','Eléctrica','Pinturas'];
   return {text:JSON.stringify({answer:'Nueve partidas preliminares',proposal_lines:names.map(description=>({description,unit:'gl',quantity:'1',unit_price:'0',section:''}))})};
  }
  const op=question.includes('convert')?{action:'convert',source:'last_created'}:
   question.includes('renombr')?{action:'update',target:'Fundaciones',new_title:'Movimiento de suelos'}:
   question.includes('borr')?{action:'delete',target:'Movimiento de suelos'}:
   {action:'create',titles:'Fundaciones; Estructuras; Cubiertas'};
  return {text:JSON.stringify({answer:'Propuesta de rubros',tool_call:{name:'manage_sections',args:op}}),input_tokens:25,output_tokens:35};
 }
 if(name==='apply_reviewed_budget_batch'){
  const batch=args.batch;
  harness.writes.push(structuredClone(args));
  for(const item of batch.creates)state.lines.push({id:item.id,description:item.description,unit:item.unit,quantity:item.quantity,unit_cost:item.unit_price,analysis_id:null,components:[],takeoffs:[]});
  return {created:batch.creates.length,updated:0,deleted:0,composed:0};
 }
 if(name==='apply_reviewed_section_batch'){
  harness.writes.push(structuredClone(args));
  const batch=args.batch;
  if(batch.estimate_id!==estimate)throw Error('Wrong budget');
  for(const create of batch.creates){
   if(state.sections.some(s=>s.title===create.title))throw Error('Duplicate rubro');
   state.sections.push({id:create.id,estimate_id:estimate,parent_id:create.parent_id,title:create.title,code:create.code||'AI-'+create.id.slice(0,8),position:create.position});
  }
  for(const edit of batch.renames){
   const current=state.sections.find(s=>s.id===edit.id);
   if(!current||current.title!==edit.expected.title||current.code!==edit.expected.code)throw Error('Stale section edit');
   current.title=edit.title;current.code=edit.code||current.code;
  }
  for(const conversion of batch.converts){
   const current=state.lines.find(l=>l.id===conversion.line_id);
   if(!current||current.description!==conversion.expected.description||Number(current.unit_cost)!==0||current.analysis_id)throw Error('Unsafe conversion');
   state.lines=state.lines.filter(l=>l.id!==current.id);
  }
  for(const deletion of batch.deletes){
   const target=state.sections.find(s=>s.id===deletion.id);
   if(!target||target.title!==deletion.expected.title)throw Error('Stale delete');
   const assigned=Object.values(state.assignments).filter(id=>id===target.id).length;
   const children=state.sections.filter(s=>s.parent_id===target.id).length;
   if(assigned!==deletion.expected_lines||children!==deletion.expected_children)throw Error('Stale deletion contents');
   for(const [id,sec] of Object.entries(state.assignments))if(sec===target.id)delete state.assignments[id];
   for(const child of state.sections)if(child.parent_id===target.id)child.parent_id=target.parent_id;
   state.sections=state.sections.filter(s=>s.id!==target.id);
  }
  return {created:batch.creates.length,renamed:batch.renames.length,deleted:batch.deletes.length,converted:batch.converts.length};
 }
 throw Error('Unexpected IPC '+name);
};
const ai=createAiAssistant({invoke,state,document,window,openModal:()=>{throw Error('Should not open modal')},editable:()=>true,loadEstimate:async()=>render(),loadEstimates:async()=>{},openEstimate:async()=>render()});
harness.ai=ai;render();harness.ready=true;`;
test('natural-language creates, renames and removes rubros without deleting budget lines',async({page})=>{
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');
 await page.waitForFunction(()=>window.__sectionHarness?.ready);
 await page.locator('.ai-launch').click();
 await page.locator('[name=ai-consent]').check();
 const ask=async text=>{await page.locator('#ai-prompt').fill(text);await page.locator('#ai-question button').click();};
 await ask('Creá los rubros Fundaciones, Estructuras y Cubiertas');
 let panel=page.locator('.ai-ingredient-preview');
 await expect(panel).toContainText('Crear rubro: Fundaciones');
 await expect(panel).toContainText('Crear rubro: Cubiertas');
 expect(await page.evaluate(()=>window.__sectionHarness.writes.length)).toBe(0);
 await panel.getByRole('button',{name:'Aprobar cambios de rubros'}).click();
 await expect(page.locator('.ai-approval-status').last()).toContainText('3 creados');
 expect(await page.evaluate(()=>window.__sectionHarness.state.sections.map(s=>s.title))).toEqual(['Fundaciones','Estructuras','Cubiertas']);
 await ask('Renombrá el rubro Fundaciones a Movimiento de suelos');
 panel=page.locator('.ai-ingredient-preview');
 await expect(panel).toContainText('Fundaciones → Movimiento de suelos');
 await ask('sí, aprobado');
 await expect(page.locator('.ai-approval-status').last()).toContainText('1 editados');
 expect(await page.evaluate(()=>window.__sectionHarness.state.sections[0].title)).toBe('Movimiento de suelos');
 await page.evaluate(()=>{
  const h=window.__sectionHarness;const parent=h.state.sections[0].id;
  h.state.assignments[h.state.lines[0].id]=parent;
  h.state.sections.push({id:'sub',estimate_id:h.state.estimateId,title:'Zapatas',code:'01.01',parent_id:parent,position:9});
 });
 await ask('Borrá el rubro Movimiento de suelos');
 panel=page.locator('.ai-ingredient-preview');
 await expect(panel).toContainText('Borrar rubro: Movimiento de suelos');
 await expect(panel).toContainText('1 partidas; quedarán sin rubro');
 await expect(panel).toContainText('1 subrubros; pasan al rubro superior');
 expect(await page.evaluate(()=>window.__sectionHarness.writes.length)).toBe(2);
 await panel.getByRole('button',{name:'Aprobar cambios de rubros'}).click();
 await expect(page.locator('.ai-approval-status').last()).toContainText('1 borrados');
 const result=await page.evaluate(()=>({writes:window.__sectionHarness.writes,state:window.__sectionHarness.state}));
 expect(result.writes).toHaveLength(3);
 expect(result.state.lines).toHaveLength(1);
 expect(result.state.lines[0].description).toBe('Excavación');
 expect(result.state.assignments).toEqual({});
 expect(result.state.sections.find(s=>s.id==='sub').parent_id).toBe(null);
});


test('chat converts exactly the nine last-created generic partidas into rubros without touching real work',async({page})=>{
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');await page.waitForFunction(()=>window.__sectionHarness?.ready);
 await page.locator('.ai-launch').click();await page.locator('[name=ai-consent]').check();
 const ask=async text=>{await page.locator('#ai-prompt').fill(text);await page.locator('#ai-question button').click();};
 await ask('Creá 9 partidas preliminares para una vivienda');
 await expect(page.getByRole('button',{name:'Sí, aprobar y crear partidas'})).toBeVisible();
 await page.getByRole('button',{name:'Sí, aprobar y crear partidas'}).click();
 await expect(page.locator('.ai-approval-status').last()).toContainText('9 partidas nuevas');
 const before=await page.evaluate(()=>window.__sectionHarness.state.lines.length);
 expect(before).toBe(10);
 await ask('Convertí esas 9 partidas en rubros');
 const preview=page.locator('.ai-ingredient-preview').last();
 await expect(preview).toContainText('Convertir partida genérica en rubro: Fundaciones');
 await expect(preview).toContainText('Convertir partida genérica en rubro: Pinturas');
 const writesBefore=await page.evaluate(()=>window.__sectionHarness.writes.length);
 expect(writesBefore).toBe(1);
 await preview.getByRole('button',{name:'Aprobar cambios de rubros'}).click();
 await expect(page.locator('.ai-approval-status').last()).toContainText('9 partidas genéricas convertidas');
 const result=await page.evaluate(()=>({lines:window.__sectionHarness.state.lines,sections:window.__sectionHarness.state.sections,writes:window.__sectionHarness.writes}));
 expect(result.writes).toHaveLength(2);
 expect(result.lines).toHaveLength(1);
 expect(result.lines[0].description).toBe('Excavación');
 expect(result.sections).toHaveLength(9);
 expect(result.sections.map(s=>s.title)).toContain('Fundaciones');
});


test('after reopening the app, converting current unpriced partidas into rubros preserves real priced work',async({page})=>{
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');
 await page.waitForFunction(()=>window.__sectionHarness?.ready);
 await page.evaluate(()=>{
  const h=window.__sectionHarness;
  const names=['Cimentación','Estructura','Mampostería','Cubierta','Carpintería exterior','Revestimientos','Instalaciones eléctricas','Instalaciones sanitarias','Pintura'];
  for(const [index,description] of names.entries())
   h.state.lines.push({id:'placeholder-'+index,description,unit:index===0?'m3':'m2',quantity:'0',unit_cost:'0',analysis_id:null,components:[],takeoffs:[]});
 });
 await page.locator('.ai-launch').click();await page.locator('[name=ai-consent]').check();
 await page.locator('#ai-prompt').fill('Las partidas que están creadas en este presupuesto están mal, deberían ser rubros, por favor crea los rubros que se corresponden con cada nombre de partida');
 await page.locator('#ai-question button').click();
 const preview=page.locator('.ai-ingredient-preview').last();
 await expect(preview).toContainText('Convertir partida genérica en rubro: Cimentación');
 await expect(preview).toContainText('Convertir partida genérica en rubro: Pintura');
 await expect(preview).toContainText('las demás partidas se conservan');
 expect(await page.evaluate(()=>window.__sectionHarness.writes.length)).toBe(0);
 await preview.getByRole('button',{name:'Aprobar cambios de rubros'}).click();
 await expect(page.locator('.ai-approval-status').last()).toContainText('9 partidas genéricas convertidas');
 const after=await page.evaluate(()=>({lines:window.__sectionHarness.state.lines,sections:window.__sectionHarness.state.sections,batch:window.__sectionHarness.writes[0]?.batch}));
 expect(after.lines).toHaveLength(1);
 expect(after.lines[0].description).toBe('Excavación');
 expect(after.sections).toHaveLength(9);
 expect(after.batch.converts).toHaveLength(9);
});

