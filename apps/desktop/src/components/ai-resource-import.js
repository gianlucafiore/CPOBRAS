import {e,dateToday} from './helpers.js';
import {createAiRequest} from '../services/ai-assistant.js';
import {parseAiResourceProposals,reviewAiResourceRows} from '../services/ai-resource-import.js';

const kinds=[['material','Material'],['labor','Mano de obra'],['equipment','Equipo'],['subcontract','Subcontrato']];

// A library-only review surface. AI replies never write resources directly.
export function createAiResourceImport({invoke,state,document,window,reloadCatalog,onSaved=()=>{},onConfigure=()=>{},isChatBusy=()=>false}){
 const host=document.createElement('div');host.id='ai-resource-import';document.body.append(host);
 const model={open:false,brief:'',rows:[],date:dateToday(),busy:false,saving:false,configured:false,provider:'openai',consent:false,error:'',notice:'',usage:null};
 let generation=0,request=null;
 const allowed=()=>state.view==='resources'&&!state.projectId&&!state.remoteProject&&!state.modal&&!state.pageDirty;
 const providerName=()=>model.provider==='anthropic'?'Claude':'OpenAI';
 const existing=()=>state.resources||[];
 const newKey=()=>globalThis.crypto.randomUUID();

 function reviewed(rows=model.rows){
  const input=rows.map(row=>({...row,price:row.priceText??row.price??null}));
  return reviewAiResourceRows(input,existing()).map((row,index)=>({...row,key:input[index].key||newKey(),priceText:input[index].priceText??(input[index].price==null?'':String(input[index].price))}));
 }
 function validateRows(){
  model.rows=reviewed();
  const selected=model.rows.filter(row=>row.selected);
  if(selected.length){
   const checked=reviewed(selected),byKey=new Map(checked.map(row=>[row.key,row]));
   model.rows=model.rows.map(row=>row.selected?byKey.get(row.key):row);
  }
 }
 const selection=()=>model.rows.filter(row=>row.selected);
 function updateControls(){
  const selected=selection(),invalid=selected.filter(row=>row.errors.length).length;
  const save=host.querySelector('[data-ai-resource=save]');
  if(save){save.disabled=model.busy||!selected.length||!!invalid||!model.date;save.textContent=model.saving?'Guardando…':`Agregar ${selected.length||''} ${selected.length===1?'insumo':'insumos'} a la biblioteca`;}
  const generate=host.querySelector('[data-ai-resource=generate]');if(generate)generate.disabled=model.busy||!model.configured||!model.consent||!model.brief.trim();
  const count=host.querySelector('[data-ai-resource-count]');if(count)count.textContent=`${model.rows.length} propuestas · ${selected.length} marcadas${invalid?` · ${invalid} con datos pendientes`:''}`;
  const hint=host.querySelector('[data-ai-resource-hint]');if(hint)hint.textContent=model.busy?(model.saving?'Guardando la selección revisada…':'Preparando la lista; todavía no se guardó ningún insumo.'):invalid?'Corregí los datos pendientes de las filas marcadas antes de guardar.':selected.length?'Se agregarán solo las filas marcadas. Los presupuestos y ACU se conservan.':'Revisá los datos y marcá las filas que quieras agregar.';
 }
 function updateRowFeedback(){
  for(let index=0;index<model.rows.length;index++){
   const row=model.rows[index],element=host.querySelector(`[data-ai-resource-row="${index}"]`);if(!element)continue;
   const checkbox=element.querySelector('[data-ai-resource-field=selected]');if(checkbox)checkbox.checked=!!row.selected;
   const errors=element.querySelector('[data-ai-resource-errors]');if(errors)errors.textContent=row.errors.join(' · ');
   const warnings=element.querySelector('[data-ai-resource-warnings]');if(warnings)warnings.textContent=(row.warnings||[]).join(' · ');
  }
  updateControls();
 }
 function paint(){
  const scroll=host.querySelector('.ai-resource-body')?.scrollTop||0;
  if(!model.open){host.innerHTML='';return;}
  const disabled=model.busy?'disabled':'';
  host.innerHTML=`<div class="ai-resource-overlay"><section class="ai-resource-dialog" role="dialog" aria-modal="true" aria-label="Preparar insumos en lote con IA"><header><h2>Preparar insumos en lote con IA</h2><button type="button" data-ai-resource="close" aria-label="Cerrar carga de insumos" ${model.saving?'disabled':''}>×</button></header><div class="ai-resource-body"><p class="ai-resource-help">Pegá una lista de insumos o describí los faltantes que ya identificaste. La IA debe organizar solo los insumos identificados en tu lista. Revisá que conserve sus características; los datos desconocidos quedan pendientes y nada se guarda sin tu selección.</p><label>Lista e indicaciones<textarea data-ai-resource-field="brief" maxlength="6000" rows="4" ${disabled} placeholder="Ej.: cemento bolsa de 25 kg, arena por m³ y oficial albañil por jornal. Dejar sin precio los que todavía no conozco.">${e(model.brief)}</textarea></label><div class="ai-resource-toolbar"><label class="ai-resource-consent"><input type="checkbox" data-ai-resource-field="consent" ${model.consent?'checked':''} ${disabled}> Autorizo enviar esta lista e indicaciones a ${e(providerName())}. El uso de API puede generar cargos.</label><button type="button" data-ai-resource="configure" ${disabled}>Configurar IA</button><button type="button" data-ai-resource="connection" ${disabled}>Actualizar conexión</button></div><p class="ai-resource-help">${model.configured?`Conexión configurada con ${e(providerName())}.`:'Configurá una conexión de IA para preparar la lista.'} Se envía solo el texto de arriba, sin el catálogo ni el historial del chat. Los precios de la IA se descartan: podés cargar precios conocidos manualmente en la revisión.</p><div class="ai-resource-toolbar"><button type="button" class="ai-resource-primary" data-ai-resource="generate" ${disabled}>${model.rows.length?'Reemplazar propuesta con IA':'Preparar lista con IA'}</button><button type="button" data-ai-resource="add" ${disabled||model.rows.length>=60?'disabled':''}>＋ Fila manual</button>${request?'<button type="button" data-ai-resource="cancel">Detener consulta</button>':''}</div>${model.rows.length?`<div class="ai-resource-toolbar"><span data-ai-resource-count></span><button type="button" data-ai-resource="select-valid" ${disabled}>Marcar filas completas revisadas</button><button type="button" data-ai-resource="unselect" ${disabled}>Desmarcar</button><label>Fecha de precios manuales<input type="date" data-ai-resource-field="date" value="${e(model.date)}" ${disabled}></label></div><div class="ai-resource-table-wrap"><table><thead><tr><th aria-label="Agregar"></th><th>Descripción</th><th>Tipo</th><th>Unidad</th><th>Precio ARS · opcional</th><th>Revisión</th><th></th></tr></thead><tbody>${model.rows.map((row,index)=>`<tr data-ai-resource-row="${index}"><td><input type="checkbox" data-ai-resource-field="selected" data-index="${index}" aria-label="Agregar ${e(row.description||`fila ${index+1}`)}" ${row.selected?'checked':''} ${disabled}></td><td><input data-ai-resource-field="description" data-index="${index}" aria-label="Descripción fila ${index+1}" value="${e(row.description)}" maxlength="500" ${disabled}></td><td><select data-ai-resource-field="kind" data-index="${index}" aria-label="Tipo fila ${index+1}" ${disabled}><option value="">Seleccionar…</option>${kinds.map(([value,label])=>`<option value="${value}" ${row.kind===value?'selected':''}>${label}</option>`).join('')}</select></td><td><input data-ai-resource-field="unit" data-index="${index}" aria-label="Unidad fila ${index+1}" value="${e(row.unit)}" maxlength="50" ${disabled}></td><td><input data-ai-resource-field="price" data-index="${index}" aria-label="Precio manual ARS fila ${index+1}" value="${e(row.priceText??row.price??'')}" placeholder="Sin precio" inputmode="decimal" maxlength="80" ${disabled}></td><td><small class="ai-resource-error" data-ai-resource-errors>${row.errors.map(e).join(' · ')}</small><small class="ai-resource-warning" data-ai-resource-warnings>${(row.warnings||[]).map(e).join(' · ')}</small></td><td><button type="button" data-ai-resource="remove" data-index="${index}" aria-label="Quitar fila ${index+1}" ${disabled}>×</button></td></tr>`).join('')}</tbody></table></div>`:''}<p class="ai-resource-notice" role="status">${e(model.notice)}</p><p class="ai-resource-error" role="alert">${e(model.error)}</p>${model.usage?`<small class="ai-resource-help">Última consulta: ${e(model.usage.input??'—')} tokens de entrada · ${e(model.usage.output??'—')} de salida.</small>`:''}</div><footer><p data-ai-resource-hint role="status"></p><div class="ai-resource-footer-actions"><button type="button" data-ai-resource="close" ${model.saving?'disabled':''}>Cerrar</button><button type="button" class="ai-resource-primary" data-ai-resource="save" ${disabled}>Agregar insumos a la biblioteca</button></div></footer></section></div>`;
  const body=host.querySelector('.ai-resource-body');if(body)body.scrollTop=scroll;
  updateControls();
 }
 async function connection(token=generation){
  const status=await invoke('ai_status');
  if(token!==generation)return;
  if(status.provider!==model.provider)model.consent=false;
  model.provider=status.provider||'openai';model.configured=!!status.configured;
  if(status.storage_error)throw new Error(status.storage_error);
 }
 async function open(brief=''){
  if(!allowed())throw new Error('Abrí la biblioteca de Insumos desde Inicio y cerrá otros formularios antes de cargar insumos en lote');
  if(model.saving)return;
  const token=++generation;request?.cancel();request=null;
  const incoming=String(brief||'').trim();
  if(incoming&&!model.brief.includes(incoming))model.brief=(model.brief?model.brief+'\n\n':'')+incoming;
  model.brief=model.brief.slice(0,6000);model.open=true;model.busy=true;model.error='';model.rows.forEach(row=>row.selected=false);
  model.notice=model.rows.length?'Se retomó la lista sin guardar. Revisá las filas antes de marcarlas otra vez.':'';paint();
  try{await Promise.all([connection(),reloadCatalog()]);if(token!==generation||!allowed())return;validateRows();}
  catch(error){if(token===generation)model.error=String(error);}
  finally{if(token===generation){model.busy=false;if(!allowed())model.open=false;paint();}}
 }
 function close(){
  if(model.saving)return false;
  generation++;request?.cancel();request=null;model.busy=false;model.open=false;paint();return true;
 }
 function syncScope(){
  if(model.open&&!allowed()){
   generation++;request?.cancel();request=null;model.open=false;if(!model.saving)model.busy=false;paint();
  }else if(model.open)updateControls();
 }
 async function generate(){
  if(!allowed())throw new Error('La carga de insumos se realiza desde la biblioteca');
  if(!model.configured||!model.consent)throw new Error('Configurá la IA y autorizá el envío de esta lista antes de consultar');
  if(isChatBusy())throw new Error('Hay una consulta de chat en curso. Esperá a que termine o cancelala antes de preparar insumos');
  if(!model.brief.trim())throw new Error('Indicá los insumos que querés cargar');
  const token=generation;model.busy=true;model.error='';model.notice='Preparando la lista. Todavía no se guardó ningún insumo.';
  const current=createAiRequest(invoke,{messages:[{role:'user',content:'Prepará una lista de insumos para revisar en la biblioteca a partir de estos datos:\n'+model.brief+'\nDevolvé JSON con answer y resource_proposals (máximo 60), con description, kind y unit. Usá solo los insumos identificados en la lista; no agregues otros ni inventes características, marcas, dimensiones o precios. Si tipo o unidad no se conocen, dejalos vacíos para completarlos en la revisión. No devuelvas IDs ni códigos.'}],context:JSON.stringify({task:'resource_catalog'}),mode:'resources'});
  request=current;paint();
  try{
   const result=await current.promise;if(token!==generation||!allowed())return;
   await reloadCatalog();if(token!==generation||!allowed())return;
   model.rows=parseAiResourceProposals(result.text,existing()).map(row=>({...row,key:newKey(),priceText:''}));validateRows();
   model.usage={input:result.input_tokens,output:result.output_tokens};model.notice=`Se prepararon ${model.rows.length} propuestas sin guardar. Completá los datos pendientes, revisá los precios y marcá las que quieras agregar.`;
  }catch(error){
   if(token===generation)model.notice='La consulta se detuvo. Se conservó la lista anterior y no se guardó ningún insumo.';
   throw error;
  }finally{if(request===current)request=null;if(token===generation){model.busy=false;paint();}}
 }
 async function save(){
  if(!allowed())throw new Error('La carga de insumos se realiza desde la biblioteca');
  const token=generation;let committed=false;model.busy=true;model.saving=true;model.error='';paint();
  try{
   await reloadCatalog();if(token!==generation||!allowed())throw new Error('Cambió la sección abierta. Volvé a la biblioteca y revisá la selección');
   validateRows();const selected=selection();
   if(!selected.length||selected.some(row=>row.errors.length))throw new Error('Revisá las filas marcadas: faltan datos o hay insumos ya cargados');
   if(!model.date)throw new Error('Indicá la fecha para los precios manuales');
   const keys=new Set(selected.map(row=>row.key));
   const rows=selected.map(({description,kind,unit,price})=>({code:'',description,kind,unit,price}));
   const result=await invoke('import_resources',{rows,effectiveDate:model.date,source:'Carga de insumos asistida por IA, revisada por el usuario'});
   committed=true;
   model.rows=model.rows.filter(row=>!keys.has(row.key));model.rows.forEach(row=>row.selected=false);
   model.notice=`Se agregaron ${result.created} insumos a la biblioteca. Para usarlos en un ACU, retomá su preparación y actualizá el catálogo.`;
   await reloadCatalog();validateRows();
   try{await onSaved(result);}catch(error){model.error='Los insumos se guardaron, pero no se pudo actualizar la vista. '+String(error);}
  }catch(error){throw new Error((committed?'Los insumos se guardaron, pero no se pudo actualizar la vista. ':'')+String(error));}
  finally{model.busy=false;model.saving=false;if(token===generation)paint();}
 }
 host.addEventListener('click',async event=>{
  event.stopPropagation();const button=event.target.closest('[data-ai-resource]');if(!button||button.disabled)return;
  const action=button.dataset.aiResource,token=generation;
  try{
   if(action==='close'){close();return;}
   if(action==='cancel'){request?.cancel();return;}
   if(model.busy)return;
   model.error='';
   if(action==='configure'){close();await onConfigure();return;}
   if(action==='connection'){model.busy=true;paint();try{await connection();}finally{if(token===generation)model.busy=false;}}
   if(action==='generate'){await generate();return;}
   if(action==='save'){await save();return;}
   if(action==='add'){model.rows.push({row_number:model.rows.length+1,key:newKey(),description:'',kind:'',unit:'',price:null,priceText:'',selected:false,errors:[],warnings:[]});validateRows();}
   if(action==='remove'){model.rows.splice(Number(button.dataset.index),1);validateRows();}
   if(action==='select-valid'){validateRows();model.rows.forEach(row=>row.selected=!row.errors.length);validateRows();}
   if(action==='unselect'){model.rows.forEach(row=>row.selected=false);validateRows();}
   paint();
  }catch(error){if(token===generation){model.error=String(error);paint();}}
 });
 function edit(event){
  event.stopPropagation();const target=event.target,field=target.dataset.aiResourceField;if(!field||model.busy)return;
  if(field==='brief'){model.brief=target.value;updateControls();return;}
  if(field==='consent'){model.consent=target.checked;updateControls();return;}
  if(field==='date'){model.date=target.value;updateControls();return;}
  const row=model.rows[Number(target.dataset.index)];if(!row)return;
  if(field==='selected')row.selected=target.checked;
  else if(field==='price'){row.priceText=target.value;row.selected=false;}
  else if(['description','kind','unit'].includes(field)){row[field]=target.value;row.selected=false;}
  validateRows();updateRowFeedback();
 }
 host.addEventListener('input',edit);
 host.addEventListener('change',edit);
 host.addEventListener('keydown',event=>{
  event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}
 });
 return {open,close,syncScope,isOpen:()=>model.open};
}
