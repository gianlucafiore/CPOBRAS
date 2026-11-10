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
 if(name==='ai_chat'){
  const question=args.messages.at(-1).content.toLowerCase();
  const op=question.includes('renombr')?{action:'update',target:'Fundaciones',new_title:'Movimiento de suelos'}:
   question.includes('borr')?{action:'delete',target:'Movimiento de suelos'}:
   {action:'create',titles:'Fundaciones; Estructuras; Cubiertas'};
  return {text:JSON.stringify({answer:'Propuesta de rubros',tool_call:{name:'manage_sections',args:op}}),input_tokens:25,output_tokens:35};
 }
 if(name==='apply_budget_section_edits'){
  harness.writes.push(structuredClone(args));
  if(args.estimateId!==estimate)throw Error('Wrong budget');
  let created=0,updated=0,deleted=0,preserved_lines=0,reparented_subsections=0;
  for(const edit of args.edits){
   if(edit.action==='create'){
    const id='section-'+(state.sections.length+1);
    state.sections.push({id,estimate_id:estimate,parent_id:null,title:edit.title,code:String(state.sections.length+1).padStart(2,'0'),position:state.sections.length});
    created++;
   }else{
    const target=state.sections.find(s=>s.id===edit.section_id);
    if(!target||target.title!==edit.expected_title)throw Error('Stale section edit');
    if(edit.action==='update'){target.title=edit.title||target.title;target.code=edit.code||target.code;updated++;}
    if(edit.action==='delete'){
     const assigned=Object.values(state.assignments).filter(id=>id===target.id).length;
     const children=state.sections.filter(s=>s.parent_id===target.id).length;
     if(assigned!==edit.expected_lines||children!==edit.expected_children)throw Error('Stale delete snapshot');
     for(const [id,sec] of Object.entries(state.assignments))if(sec===target.id)delete state.assignments[id];
     for(const child of state.sections)if(child.parent_id===target.id)child.parent_id=target.parent_id;
     state.sections=state.sections.filter(s=>s.id!==target.id);
     preserved_lines+=assigned;reparented_subsections+=children;deleted++;
    }
   }
  }
  return {created,updated,deleted,preserved_lines,reparented_subsections};
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
 await expect(page.locator('.ai-approval-status')).toContainText('3 creados');
 expect(await page.evaluate(()=>window.__sectionHarness.state.sections.map(s=>s.title))).toEqual(['Fundaciones','Estructuras','Cubiertas']);
 await ask('Renombrá el rubro Fundaciones a Movimiento de suelos');
 panel=page.locator('.ai-ingredient-preview');
 await expect(panel).toContainText('Fundaciones → Movimiento de suelos');
 await ask('sí, aprobado');
 await expect(page.locator('.ai-approval-status')).toContainText('1 editados');
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
 await expect(panel).toContainText('1 subrubros; pasarán al rubro superior');
 expect(await page.evaluate(()=>window.__sectionHarness.writes.length)).toBe(2);
 await panel.getByRole('button',{name:'Aprobar cambios de rubros'}).click();
 await expect(page.locator('.ai-approval-status')).toContainText('1 borrados');
 const result=await page.evaluate(()=>({writes:window.__sectionHarness.writes,state:window.__sectionHarness.state}));
 expect(result.writes).toHaveLength(3);
 expect(result.state.lines).toHaveLength(1);
 expect(result.state.lines[0].description).toBe('Excavación');
 expect(result.state.assignments).toEqual({});
 expect(result.state.sections.find(s=>s.id==='sub').parent_id).toBe(null);
});
