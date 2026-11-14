import {test,expect} from '@playwright/test';
async function fixture(page){
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:`
 import './style.css';
 import {createActions} from './controllers/actions.js';
 import {createModalRenderer} from './components/modal.js';
 import {createResourcePicker} from './components/resource-picker.js';
 const resources=[{id:'10000000-0000-4000-8000-000000000001',code:'INS-1',description:'Fenólico',unit:'placa',price:'80000'},{id:'10000000-0000-4000-8000-000000000002',code:'INS-2',description:'Alambre',unit:'kg',price:'3442.78'}];
 const original={id:'10000000-0000-4000-8000-000000000003',code:'ACU-1',description:'Estructura de hormigón visto',unit:'m³'};
 const originalComponents=resources.map(r=>({resource_id:r.id,quantity:'1',unit_price:r.price}));
 const state={view:'analyses',resources,analyses:[original],clients:[],personClients:[],sections:[],acuComponents:[],modal:null},writes=[];
 const invoke=async(name,args)=>{
  if(name==='get_analysis_details')return {components:structuredClone(originalComponents)};
  if(['create_analysis','update_analysis'].includes(name)){
   if(args.components.some(c=>!c.resourceId))throw Error('invalid length: found 0');
   writes.push({name,args:structuredClone(args)});return {id:crypto.randomUUID()};
  }
  throw Error('Unexpected command '+name);
 };
 let markup;
 const render=()=>document.querySelector('#app').innerHTML=state.modal?markup():'';
 const openModal=(kind,record)=>{state.modal={kind,record};state.acuComponents=record.components.map(row=>({resourceId:row.resource_id,quantity:row.quantity,unitPrice:row.unit_price}));render();};
 const ctx={state,invoke,document,window,FormData,render,openModal,currentEstimate:()=>null,editable:()=>true,loadCollections:async()=>{},refreshAnalysis:async()=>{}};
 markup=createModalRenderer(ctx);
 const actions=createActions(ctx),picker=createResourcePicker(ctx);
 document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(await picker.act(b))return;if(b.dataset.action)await actions.act(b);});
 document.addEventListener('input',e=>picker.input(e));
 document.addEventListener('submit',async e=>{e.preventDefault();try{await actions.handleSubmit(e.target);}catch(error){e.target.querySelector('.modal-error').textContent=error.message;}});
 await actions.act({dataset:{action:'duplicate-analysis',id:original.id}});
 window.__duplicate={state,writes,original,originalComponents,ready:true};
 `}));
 await page.goto('/');await page.waitForFunction(()=>window.__duplicate?.ready);
}
test('duplicate and modify saves a new ACU with resource identities and leaves its source intact',async({page})=>{
 await fixture(page);
 await expect(page.getByRole('dialog')).toHaveAttribute('aria-label','Crear análisis de costo unitario');
 await page.locator('[name=description]').fill('Estructura modificada');
 await page.locator('[name=quantity]').nth(1).fill('3');
 await page.locator('[data-action=add-component]').click();
 await page.locator('[data-action=remove-component]').last().click();
 await expect(page.locator('[name=description]')).toHaveValue('Estructura modificada');
 await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const saved=await page.evaluate(()=>window.__duplicate);
 expect(saved.writes).toHaveLength(1);expect(saved.writes[0].name).toBe('create_analysis');
 expect(saved.writes[0].args).toMatchObject({code:'',description:'Estructura modificada',unit:'m³',components:[{resourceId:saved.originalComponents[0].resource_id,quantity:'1',unitPrice:'80000'},{resourceId:saved.originalComponents[1].resource_id,quantity:'3',unitPrice:'3442.78'}]});
 expect(saved.original.description).toBe('Estructura de hormigón visto');expect(saved.originalComponents[1].quantity).toBe('1');
});
test('unresolved resource search blocks a copy before IPC and preserves edits until a result is chosen',async({page})=>{
 await fixture(page);
 await page.locator('[name=quantity]').first().fill('4');
 await page.locator('.resource-search').first().fill('Alambre');
 await expect(page.locator('[data-resource-unit]').first()).toBeHidden();
 await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.locator('.modal-error')).toContainText('fila 1');
 expect(await page.evaluate(()=>window.__duplicate.writes)).toHaveLength(0);
 await expect(page.locator('[name=quantity]').first()).toHaveValue('4');
 await expect(page.locator('[name=description]')).toHaveValue('Estructura de hormigón visto (copia)');
 await page.getByRole('option',{name:/INS-2/}).click();
 await expect(page.locator('[data-resource-unit]').first()).toHaveText('Unidad: kg');
 await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__duplicate.writes[0].args.components[0])).toMatchObject({quantity:'4',unitPrice:'3442.78',resourceId:'10000000-0000-4000-8000-000000000002'});
});
