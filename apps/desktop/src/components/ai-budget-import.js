import {e} from './helpers.js';
import {money} from '../decimal.js';
import {createAiRequest} from '../services/ai-assistant.js';
import {textPriceRows,excelPriceRows,guessColumns,sourcePrices,budgetCandidates,localMatches,parsePlan,matchingContext,applyAiMatches,reviewedBatch,duplicateWarning,importDecimal,rowsFromChanges,editContext} from '../services/ai-budget-import.js';
export function createAiBudgetImport({invoke,state,document,window,editable,loadEstimate,loadEstimates,openEstimate,canUseAi}){
 const host=document.createElement('div');host.id='ai-budget-import';document.body.append(host);
 let model={open:false},request=null,generation=0;
 const key=()=>[state.view,state.projectId,state.estimateId].join(':');
 const labels=()=>new Map((model.lines||[]).map((l,i)=>[l.id,`${i+1} · ${l.code?l.code+' · ':''}${l.description}`]));
 function syncScope(){if(model.open&&model.scope!==key()){generation++;request?.cancel();model.open=false;paint();}}
 function open(mode='prices',text=''){
  if(state.modal||state.pageDirty)throw new Error('Cerrá los formularios o guardá los cambios pendientes antes de abrir una carga por lotes');
  if(state.remoteProject||!state.projectId||state.projects.find(p=>p.id===state.projectId)?.read_only)throw new Error('Primero abrí un proyecto propio para preparar esta carga');
  let estimate=state.estimates.find(x=>x.id===state.estimateId),newEstimate=null;
  if(!estimate&&mode==='plan'){
    const project=state.projects.find(p=>p.id===state.projectId);
    estimate={id:globalThis.crypto.randomUUID(),title:'Presupuesto inicial',currency:String(project?.currency||'ARS').toUpperCase(),issued:false};
    newEstimate={project_id:state.projectId,title:estimate.title};
  }else if(!editable()||!estimate)throw new Error('Abrí un presupuesto en elaboración para actualizar precios o crear partidas');
  generation++;model={open:true,scope:key(),mode,stage:'source',text:text||'',brief:mode==='plan'?text||'':'',raw:[],columns:null,locale:'ar',rows:[],lines:newEstimate?[]:structuredClone(budgetCandidates(state)),estimate:structuredClone(estimate),newEstimate,currency:estimate.currency,batchId:globalThis.crypto.randomUUID(),error:'',busy:false,fileName:'',applied:false,notice:''};paint();
 }
 function openPlanRows(rows,changes=[]){open(changes.length?'manage':'plan');model.rows=[...rowsFromChanges(changes,model.lines),...rows];model.stage='review';paint();}
 function columnSelect(label,field,optional=false){return `<label>${label}<select data-import-column="${field}">${optional?'<option value="-1">No incluida</option>':''}${(model.raw[0]||[]).map((c,i)=>`<option value="${i}" ${model.columns[field]===i?'selected':''}>${i+1} · ${e(String(c.text||'Columna').slice(0,70))}</option>`).join('')}</select></label>`;}
 function review(){const names=labels();return `<p>Revisá y marcá qué aplicar. Los precios están en <strong>${e(model.currency)}</strong>, en la misma base del presupuesto. No se convierten monedas ni se calculan precios con IA. Una partida nueva sin cantidad o precio se guardará en <strong>0, pendiente de completar</strong>.</p><p class="ai-import-warning">Cambiar el precio de una partida con ACU la pasa a precio manual; su composición anterior se conserva. Las eliminaciones conservan los documentos y la planificación histórica. Las partidas nuevas no tienen composición de ACU.</p><div class="ai-import-toolbar"><button type="button" data-import="all">Marcar filas válidas</button><button type="button" data-import="none">Desmarcar todas</button>${model.mode==='prices'?'<button type="button" data-import="match">Sugerir coincidencias con IA (hasta 50 pendientes)</button>':''}</div><datalist id="ai-import-targets"><option value="+ Crear partida"></option>${[...names].map(([,label])=>`<option value="${e(label)}"></option>`).join('')}</datalist><div class="ai-import-table"><table><thead><tr><th>Aplicar · acción</th><th>Fuente / descripción nueva</th><th>Partida de destino / nueva</th><th>Unidad · cantidad nueva</th><th>Precio actual</th><th>Precio propuesto</th><th>Revisión</th></tr></thead><tbody>${model.rows.map((r,i)=>`<tr data-import-row="${i}"><td><input type="checkbox" data-row="selected" aria-label="Aplicar fila ${i+1}" ${r.selected?'checked':''}><select data-row="operation" aria-label="Acción fila ${i+1}">${[['price','Precio'],['edit','Editar'],['delete','ELIMINAR'],['create','Crear']].map(([v,label])=>`<option value="${v}" ${(r.target==='new'?'create':r.operation||'price')===v?'selected':''}>${label}</option>`).join('')}</select></td><td><small>Fila ${e(r.row_id)} ${e(r.code||'')}</small><input data-row="description" aria-label="Descripción fila ${i+1}" value="${e(r.description)}" maxlength="500" ${r.target==='new'||r.operation==='edit'?'':'disabled'}></td><td><input data-row="target" list="ai-import-targets" aria-label="Destino fila ${i+1}" ${["edit","delete"].includes(r.operation)?"disabled":""} placeholder="Buscar partida o + Crear partida" value="${e(r.target==='new'?'+ Crear partida':names.get(r.target)||'')}"><small data-current-data>${r.target&&r.target!=='new'?`Actual: ${e(model.lines.find(l=>l.id===r.target)?.quantity)} ${e(model.lines.find(l=>l.id===r.target)?.unit)}`:"Nueva partida"}</small><input data-row="section" aria-label="Rubro nuevo fila ${i+1}" placeholder="Rubro (opcional)" value="${e(r.section||'')}" maxlength="100" ${r.target==='new'?'':'disabled'}></td><td><input data-row="unit" aria-label="Unidad fila ${i+1}" placeholder="Unidad" value="${e(r.unit||'')}" maxlength="30" ${r.target==='new'||r.operation==='edit'?'':'disabled'}><input data-row="quantity" aria-label="Cantidad nueva fila ${i+1}" placeholder="Sin definir → 0" value="${e(r.quantity??'')}" ${r.target==='new'||r.operation==='edit'?'':'disabled'}></td><td data-current-price>${r.target&&r.target!=='new'?money(model.lines.find(l=>l.id===r.target)?.unit_cost):'—'}</td><td><input data-row="unit_price" aria-label="Precio propuesto fila ${i+1}" placeholder="Sin definir → 0" value="${e(r.unit_price??'')}" ${r.operation==='delete'?'disabled':''}><small>Decimal con punto</small></td><td data-row-warning>${e(warning(r))}</td></tr>`).join('')}</tbody></table></div>`;}
 function warning(r){const line=model.lines?.find(l=>l.id===r.target);return [r.operation==='delete'?'SE ELIMINARÁ: '+(line?.description||'Elegí una partida existente'):'',r.error,r.reason,r.target==='new'?duplicateWarning(r,model.lines):'',line?.analysis_id?'ACU → precio manual':'',line&&r.unit&&r.unit!==line.unit?'Unidad de origen distinta: revisar':''].filter(Boolean).join(' · ');}
 function paint(){
  host.innerHTML=!model.open?'':`<div class="ai-import-overlay"><section class="ai-import-dialog" role="dialog" aria-modal="true" aria-label="Carga asistida del presupuesto"><header><h2>${model.mode==='plan'?'Crear partidas desde la descripción de obra':model.mode==='manage'?'Editar y eliminar partidas con revisión':'Cargar precios desde texto o Excel'}</h2><button type="button" data-import="close" aria-label="Cerrar carga" ${model.busy&&!request?'disabled':''}>×</button></header><div class="ai-import-body"><p>Presupuesto: <strong>${e(model.estimate.title)}</strong> · ${e(model.estimate.currency)}. ${model.newEstimate?"Se creará un presupuesto nuevo al confirmar la selección.":""} Nada se guarda hasta confirmar la selección.</p>${model.newEstimate&&!model.applied?`<label>Título del presupuesto nuevo<input data-import-input="estimateTitle" maxlength="500" value="${e(model.newEstimate.title)}"></label>`:''}${model.stage==='source'?(model.mode!=='prices'?`<label>${model.mode==='manage'?'Describí qué partidas querés editar o eliminar':'Contá qué vas a construir o qué trabajos necesitás'}<textarea data-import-input="brief" maxlength="3000" rows="7" placeholder="Por ejemplo: vivienda de una planta con dos dormitorios, cocina y baño; estructura de hormigón y cubierta de chapa…">${e(model.brief)}</textarea></label><p>La IA propondrá hasta 60 partidas y rubros por consulta. Los datos no suministrados quedan sin definir. Revisá el alcance técnico antes de aplicarlo.</p><button type="button" data-import="generate" ${model.busy?'disabled':''}>Preparar propuesta con IA</button>${model.lines.length?'<button type="button" data-import="manual">Revisar partidas manualmente</button>':""}`:`<label>Pegá filas desde Excel o una lista descripción;precio<textarea data-import-input="text" rows="7" maxlength="150000" placeholder="Nivelación;17.000,00\nPerforación;600.000,00">${e(model.text)}</textarea></label><div class="ai-import-toolbar"><button type="button" data-import="read" ${model.busy?'disabled':''}>Leer lista</button><label>O cargá un Excel (.xlsx, primera hoja)<input type="file" data-import-file accept=".xlsx" ${model.busy?'disabled':''}></label></div>${model.raw.length?`<p>${e(model.fileName||'Lista pegada')} · ${model.raw.length} filas</p><label><input type="checkbox" data-import-header ${model.columns.header?'checked':''}> La primera fila contiene encabezados</label><div class="ai-import-columns">${columnSelect('Descripción','description',true)}${columnSelect('Código','code',true)}${columnSelect('Precio unitario','price')}${columnSelect('Unidad','unit',true)}${columnSelect('Cantidad (solo partidas nuevas)','quantity',true)}<label>Formato de texto numérico<select data-import-locale><option value="ar" ${model.locale==='ar'?'selected':''}>Argentino: 1.234,56</option><option value="decimal" ${model.locale==='decimal'?'selected':''}>Decimal: 1234.56</option></select></label></div><p>Las celdas numéricas de Excel conservan sus decimales exactos. Revisá las columnas: nunca selecciones el importe total como precio unitario.</p><button type="button" data-import="preview">Preparar vista previa</button>`:''}`):review()}<p class="ai-import-error" role="alert">${e(model.error||'')}</p><p role="status">${e(model.notice||'')}${model.busy?' Procesando…':''}</p>${request?'<button type="button" data-import="cancel">Cancelar consulta IA</button>':''}</div><footer><button type="button" data-import="close" ${model.busy&&!request?'disabled':''}>Cerrar</button>${model.stage==='review'?`<button type="button" data-import="back" ${model.busy||model.applied?'disabled':''}>Volver</button><button type="button" data-import="apply" ${model.busy||model.applied?'disabled':''}>${model.applied?'Aplicado':'Aplicar selección'}</button>`:''}</footer></section></div>`;
 }
 async function ask(messages,context,mode){
  if(!canUseAi())throw new Error('Configurá la API y aceptá el envío al proveedor en la consola antes de usar IA');
  const token=generation;model.busy=true;model.error='';
  try{request=createAiRequest(invoke,{messages,context,mode});paint();const reply=await request.promise;if(token!==generation)return null;return reply.text;}
  finally{if(token===generation){request=null;model.busy=false;paint();}}
 }
 async function action(name){
  if(name==='cancel'){request?.cancel();return;}
  if(name==='close'){if(model.busy&&!request)return;generation++;request?.cancel();request=null;model.open=false;paint();return;}
  if(model.busy||model.applied)return;
  model.error='';model.notice='';
  if(name==='read'){model.raw=textPriceRows(model.text);if(model.raw.length>1001)throw new Error('Máximo 1000 filas');model.columns=guessColumns(model.raw);}
  if(name==='preview'){
   if(!model.raw.length)throw new Error('Primero leé una lista o seleccioná un archivo');
   if(model.columns.price<0||model.columns.price===model.columns.description||model.columns.price===model.columns.code)throw new Error('La columna de precio debe ser distinta de descripción y código');
   model.rows=localMatches(sourcePrices(model.raw,model.columns,model.locale,model.currency),model.lines);model.stage='review';
  }
  if(name==='manual'){model.rows=rowsFromChanges(model.lines.map(l=>({line_id:l.id,action:'edit'})),model.lines).map(r=>({...r,reason:'Edición manual: revisar'}));model.stage='review';}
  if(name==='generate'&&model.mode==='manage'){
   if(!model.brief.trim())throw new Error('Describí los cambios que necesitás');
   const text=await ask([{role:'user',content:'Proponé únicamente los cambios que pido: '+model.brief+'\nRespondé JSON con answer y proposal_changes [{line_id,action:edit o delete,description opcional,unit opcional,quantity opcional,unit_price opcional}]. Los números van como texto decimal; los datos omitidos se conservan. No propongas eliminar nada que no haya solicitado.'}],editContext(model.lines),'manage');
   if(text){const {changeProposals}=await import('../services/ai-budget-import.js');model.rows=rowsFromChanges(changeProposals(text),model.lines);model.stage='review';}
  }
  if(name==='generate'&&model.mode==='plan'){
   if(!model.brief.trim())throw new Error('Describí primero los trabajos de la obra');
   const text=await ask([{role:'user',content:'Prepará una propuesta de partidas para esta obra: '+model.brief+'\nRespondé JSON con answer y proposal_lines. Incluí rubro en section. No inventes cantidades ni precios: usá null cuando no estén dados. Máximo 60 partidas.'}],JSON.stringify({moneda:model.estimate.currency,partidas_existentes:model.lines.slice(0,30).map(l=>({description:l.description,unit:l.unit}))}),'plan');
   if(text){model.rows=parsePlan(text);model.stage='review';}
  }
  if(name==='match'){
   const context=matchingContext(model.rows,model.lines);
   const text=await ask([{role:'user',content:'Relacioná las filas de origen con las partidas candidatas. Respondé JSON con answer y price_matches [{row_id,line_id,reason}]. No agregues precios. Omití las filas sin correspondencia clara.'}],JSON.stringify(context),'match_prices');
   if(text){model.rows=applyAiMatches(text,model.rows,context);model.notice='Las sugerencias IA quedan desmarcadas: revisá cada correspondencia y marcá las que quieras aplicar.';}
  }
  if(name==='all')model.rows.forEach(r=>{r.selected=!!r.target&&!r.error;});
  if(name==='none')model.rows.forEach(r=>{r.selected=false;});
  if(name==='back'){model.stage='source';model.rows=[];model.batchId=globalThis.crypto.randomUUID();}
  if(name==='apply'){
   if((!model.newEstimate&&(!editable()||state.estimateId!==model.estimate.id))||state.remoteProject||state.projectId!==(model.newEstimate?.project_id||state.projectId))throw new Error('El presupuesto dejó de ser editable');
   const batch=reviewedBatch(model.rows,model.lines,model.estimate,model.batchId,model.currency,model.newEstimate);
   const actions=[batch.updates.length?`${batch.updates.length} ediciones`:null,batch.creates.length?`${batch.creates.length} partidas nuevas`:null,batch.deletes.length?`ELIMINAR ${batch.deletes.length} partidas existentes`:null].filter(Boolean).join(', ');
   if(!window.confirm(`¿${model.newEstimate?"Crear el presupuesto «"+model.newEstimate.title+"» y aplicar":"Aplicar"} ${actions} en «${model.estimate.title}», con importes en ${model.currency}? Los datos nuevos sin definir se guardan en 0. Los precios o unidades con ACU que cambien pasan a manuales.`))return;
   model.busy=true;paint();
   try{
    const result=await invoke('apply_reviewed_budget_batch',{batch});model.applied=true;model.notice=`Guardado: ${result.updated} partidas actualizadas y ${result.created} partidas creadas y ${result.deleted} eliminadas.`;
    if(model.newEstimate){state.message=model.notice;await loadEstimates();await openEstimate(model.estimate.id);}
    else if(state.estimateId===model.estimate.id)await loadEstimate();
   }catch(error){model.error=(model.applied?'Los cambios se guardaron, pero no se pudo refrescar la vista. Recargá el presupuesto. ':'')+String(error);}finally{model.busy=false;}
  }
  paint();
 }
 host.addEventListener('click',async event=>{event.stopPropagation();const token=generation;const button=event.target.closest('[data-import]');if(!button||button.disabled)return;try{await action(button.dataset.import);}catch(error){if(token===generation){model.error=String(error);paint();}}});
 host.addEventListener('input',event=>{
  event.stopPropagation();const target=event.target;
  if(target.dataset.importInput){if(target.dataset.importInput==='estimateTitle'){model.newEstimate.title=target.value;model.estimate.title=target.value;}else model[target.dataset.importInput]=target.value;}
  const tr=target.closest('[data-import-row]');if(!tr||!target.dataset.row)return;const row=model.rows[Number(tr.dataset.importRow)],field=target.dataset.row;
  if(field==='selected')row.selected=target.checked;
  else if(field==='operation'){
   row.operation=target.value;const line=model.lines.find(l=>l.id===row.target);
   if(row.operation==='create'){row.target='new';tr.querySelector('[data-row=target]').value='+ Crear partida';}
   if(row.operation==='edit'&&line){row.description=line.description;row.unit=line.unit;row.quantity=line.quantity;for(const f of ['description','unit','quantity'])tr.querySelector(`[data-row=${f}]`).value=row[f];}
   if(row.operation==='delete'&&row.target==='new'){row.target='';tr.querySelector('[data-row=target]').value='';row.selected=false;tr.querySelector('[data-row=selected]').checked=false;}
  }
  else if(field==='target'){
   row.target=target.value==='+ Crear partida'?'new':([...labels()].find(([,label])=>label===target.value)?.[0]||'');
   row.operation=row.target==='new'?'create':'price';tr.querySelector('[data-row=operation]').value=row.operation;
   row.reason=row.target==='new'?'Creación seleccionada por el usuario':row.target?'Correspondencia elegida por el usuario':'Elegí una correspondencia de la lista';
   for(const input of tr.querySelectorAll('[data-row="description"],[data-row="section"],[data-row="unit"],[data-row="quantity"]'))input.disabled=row.target!=='new'&&row.operation!=='edit';
   tr.querySelector('[data-current-price]').textContent=row.target&&row.target!=='new'?money(model.lines.find(l=>l.id===row.target)?.unit_cost):'—';
   const current=model.lines.find(l=>l.id===row.target);tr.querySelector('[data-current-data]').textContent=current?`Actual: ${current.quantity} ${current.unit}`:'Nueva partida';
  }else{
   row[field]=target.value;
   if(field==='unit_price'||field==='quantity'){try{importDecimal(target.value,'decimal',true);row.error='';}catch(error){row.error=error.message;}}
  }
  for(const input of tr.querySelectorAll('[data-row=description],[data-row=unit],[data-row=quantity]'))input.disabled=row.target!=='new'&&row.operation!=='edit';
  tr.querySelector('[data-row=target]').disabled=['edit','delete'].includes(row.operation);
  tr.querySelector('[data-row=section]').disabled=row.target!=='new';
  tr.querySelector('[data-row=unit_price]').disabled=row.operation==='delete';
  tr.querySelector('[data-row-warning]').textContent=warning(row);
 });
 host.addEventListener('change',async event=>{
  event.stopPropagation();const t=event.target;
  if(t.dataset.importColumn)model.columns[t.dataset.importColumn]=Number(t.value);
  if(t.matches('[data-import-header]'))model.columns.header=t.checked;
  if(t.matches('[data-import-locale]'))model.locale=t.value;
  if(t.matches('[data-import-file]')){
   const file=t.files?.[0];if(!file)return;const token=generation;model.busy=true;model.error='';paint();
   try{const rows=await excelPriceRows(file);if(token!==generation)return;model.raw=rows;model.columns=guessColumns(rows);model.fileName=file.name;}
   catch(error){if(token===generation)model.error=String(error);}finally{if(token===generation){model.busy=false;paint();}}
  }
 });
 host.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape')void action('close');});
 paint();return {open,openPlanRows,syncScope,isBusy:()=>Boolean(model.busy),hasDraft:()=>model.open};
}
