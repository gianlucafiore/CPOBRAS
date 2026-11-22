import {e,dateToday} from './helpers.js';
import {validatedResourceDraft} from '../services/ai-resource-chat.js';
import {invokeReviewedAiAction} from '../services/ai-view-api-contracts.js';

// Formulario chico, abierto desde una tarjeta del chat. Nunca guarda por
// iniciativa del modelo: requiere un clic explícito del usuario.
export function createAiMissingResourcePopup({invoke,document,state,canSave,onSaved}){
 const host=document.createElement('div');
 host.id='ai-missing-resource-popup';
 document.body.append(host);
 let item=null,form=null,busy=false,error='';
 const kinds=[['','Elegí tipo'],['material','Material'],['labor','Mano de obra'],['equipment','Equipo'],['subcontract','Subcontrato']];
 const active=()=>!!item;
 function paint(){
  if(!item){host.innerHTML='';return;}
  host.innerHTML=`<div class="ai-missing-overlay">
   <section class="ai-missing-dialog" role="dialog" aria-modal="true" aria-label="Completar insumo faltante">
   <header><strong>${item.action==='specify'?'Especificar insumo':'Agregar insumo faltante'}</strong>
   <button type="button" data-missing-action="close" aria-label="Cerrar" ${busy?'disabled':''}>×</button></header>
   <p>La IA sugirió estos datos. Verificá la identidad y la unidad antes de agregar el insumo a la biblioteca.</p>
   ${item.reason?`<p class="ai-missing-hint">${e(item.reason)}</p>`:''}
   <label>Descripción<input data-missing-field="description" maxlength="500" value="${e(form.description)}" ${busy?'disabled':''}></label>
   <div class="ai-missing-grid"><label>Tipo<select data-missing-field="kind" ${busy?'disabled':''}>${kinds.map(([value,label])=>`<option value="${value}" ${form.kind===value?'selected':''}>${label}</option>`).join('')}</select></label>
   <label>Unidad<input data-missing-field="unit" maxlength="50" value="${e(form.unit)}" placeholder="ej. kg, m², unidad" ${busy?'disabled':''}></label></div>
   <label>Precio unitario ARS (opcional)<input data-missing-field="price" value="${e(form.price)}" placeholder="Dejar vacío si no se conoce" ${busy?'disabled':''}></label>
   <small>Se asignará código desde CPOBRAS. No se creará ningún ACU ni se inventará un precio.</small>
   ${error?`<p class="ai-missing-error" role="alert">${e(error)}</p>`:''}
   <footer><button type="button" data-missing-action="close" ${busy?'disabled':''}>Cancelar</button>
   <button type="button" data-missing-action="save" class="ai-missing-primary" ${busy?'disabled':''}>${busy?'Guardando…':'Agregar a biblioteca'}</button></footer>
   </section></div>`;
 }
 function open(resource){
  if(busy||!resource||resource.saved)return false;
  if(!canSave())throw new Error('Abrí una obra local editable y cerrá otros formularios antes de crear insumos.');
  item=resource;form={description:resource.description||'',unit:resource.unit||'',kind:resource.kind||'',price:''};error='';paint();
  host.querySelector('[data-missing-field="description"]')?.focus();
  return true;
 }
 function close(){if(busy)return false;item=null;form=null;error='';paint();return true;}
 async function save(){
  if(!item||busy)return;
  if(!canSave())throw new Error('Cambió el contexto de la obra; no se agregó el insumo.');
  busy=true;error='';paint();
  const startingScope=JSON.stringify([state.database?.scope||null,state.projectId,state.estimateId,state.view]);
  let attempted=false;
  try{
   if(item.action==='specify'&&(form.description.trim()===item.description.trim()||/\b(?:a definir|por definir|sin definir|pendiente)\b/i.test(form.description)))
    throw new Error('Completá la especificación técnica en la descripción antes de crear el insumo.');
   const catalog=await invoke('ai_catalog_context',{projectId:null,estimateId:null,currency:'ARS',asOf:dateToday()});
   if(!canSave()||startingScope!==JSON.stringify([state.database?.scope||null,state.projectId,state.estimateId,state.view]))
    throw new Error('Cambió la obra o la base. Revisá el insumo antes de cargarlo.');
   const review=validatedResourceDraft([{...form,price:form.price||null}],catalog.resources||[]);
   if(review.pending.length||review.ready.length!==1)throw new Error(review.rows[0]?.errors.join(' · ')||'Revisá la ficha antes de guardar.');
   const row=review.ready[0];attempted=true;
   const result=await invokeReviewedAiAction(invoke,'resources','import_resources',{
    rows:[{code:'',description:row.description,kind:row.kind,unit:row.unit,price:row.price??null}],
    effectiveDate:dateToday(),source:'Insumo faltante de ACU, revisado y aprobado desde CPOBRAS IA'
   },{approved:true});
   if(result.created!==1)throw new Error('La respuesta no confirmó el alta del insumo.');
   const saved=item;item=null;form=null;paint();
   await onSaved(saved,result);
  }catch(caught){
   error=(attempted?'El alta pudo realizarse; comprobá la biblioteca antes de reintentar. ':'')+String(caught);
  }finally{busy=false;paint();}
 }
 host.addEventListener('input',event=>{const field=event.target?.dataset?.missingField;if(form&&['description','kind','unit','price'].includes(field))form[field]=event.target.value;});
 host.addEventListener('change',event=>{const field=event.target?.dataset?.missingField;if(form&&['description','kind','unit','price'].includes(field))form[field]=event.target.value;});
 host.addEventListener('click',async event=>{
  const action=event.target.closest('[data-missing-action]')?.dataset?.missingAction;
  if(action==='close')close();
  if(action==='save')await save();
 });
 host.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
 return {open,close,active};
}
