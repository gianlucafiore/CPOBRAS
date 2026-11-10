import {e,dateToday,kindName} from './helpers.js';
import {money,numeric,multiplyDecimals} from '../decimal.js';
import {parsePlan,normalize,importDecimal} from '../services/ai-budget-import.js';
import {createAiRequest} from '../services/ai-assistant.js';
import {parseAcuAdditions,mergeAcuAddition,additionPreservationErrors} from '../services/ai-acu-addition.js';
import {productivityEditRow} from '../services/ai-acu-productivity.js';
import {acuSeed,newAcuSeeds,emptyAcu,parseAcuProposals,measurementQuantity,acuTotals,acuPreapprovalErrors,copyAcuExample,acuPromptContext,acuBatch} from '../services/ai-acu.js';
export function createAcuWorkbench({invoke,state,document,window,loadEstimate,loadEstimates,openEstimate,canUseAi,openResourceLibrary=null}){
 const host=document.createElement('div');host.id='ai-acu-workbench';document.body.append(host);
 let model={open:false},request=null,generation=0,stop=false,approvedRun=null;const drafts=new Map();
 const draftKey=()=>[state.projectId,state.estimateId||'new'].join(':');
 function keepDraft(){
  if(!model.draftKey)return;
  const draft=model.applied&&model.remaining?.count?{...model,rows:model.remaining.rows,seeds:model.remaining.seeds,targetIds:new Set(model.remaining.targetIds),applied:false,remaining:null,resumeAfterApply:true,batchId:globalThis.crypto.randomUUID()}:model;
  if(!draft.applied&&(draft.rows.length||draft.seeds.length||draft.targetIds.size||draft.brief.trim())){draft.busy=false;drafts.set(draft.draftKey,draft);if(drafts.size>5)drafts.delete(drafts.keys().next().value);}
 }
 const scope=()=>[state.view,state.projectId,state.estimateId].join(':');
 function syncScope(){if((model.open||model.headless)&&(model.scope!==scope()||(model.headless&&approvedRun&&(state.modal||state.pageDirty||state.remoteProject||state.projects.find(project=>project.id===state.projectId)?.read_only||state.estimates.find(estimate=>estimate.id===state.estimateId)?.issued)))){cancelApproved();generation++;stop=true;request?.cancel();keepDraft();model.open=false;model.headless=false;paint();}}
 const selectedResources=()=>model.context.resources.filter(r=>model.resourceIds.has(r.id));
 const sectionLabel=row=>row.section_id?model.context.sections.find(s=>s.id===row.section_id)?.code+' · '+model.context.sections.find(s=>s.id===row.section_id)?.title:row.section_title||'';
 async function readContext(){return invoke('assisted_acu_context',{projectId:state.projectId,estimateId:state.estimateId||null,asOf:model.asOf});}
 async function open(brief='',outline=null,forceMode=null,lineIds=null,authorization=null,operation=null){
  if(approvedRun&&authorization!==approvedRun){if(approvedRun.writing)throw new Error('El lote se está guardando. Esperá a que termine antes de abrir otra preparación');cancelApproved();keepDraft();}
  if(!state.projectId||state.remoteProject||state.modal||state.pageDirty||state.projects.find(p=>p.id===state.projectId)?.read_only)throw new Error('Abrí un proyecto propio y cerrá los formularios pendientes antes de preparar ACU');
  const estimate=state.estimates.find(x=>x.id===state.estimateId);
  if(estimate?.issued)throw new Error('Los presupuestos emitidos no admiten cambios de ACU');
  if(forceMode==='fill'&&!estimate)throw new Error('Abrí un presupuesto existente para completar sus ACU');
  if((operation==='append'||operation==='productivity')&&(forceMode!=='fill'||!Array.isArray(lineIds)||!lineIds.length))throw new Error('Para agregar insumos indicá una partida existente de destino');
  const saved=drafts.get(draftKey());if(saved&&!saved.applied&&!outline&&!forceMode){generation++;const token=generation;model=saved;model.open=true;model.headless=false;model.scope=scope();model.busy=false;if(brief)model.brief=brief;model.notice='Se retomó la preparación sin aplicar. Podés actualizar precios y catálogo antes de revisarla.';stop=false;
   if(model.resumeAfterApply){model.error='';model.busy=true;paint();try{const context=await readContext();if(token!==generation)return;model.context=context;model.rows.forEach(r=>r.selected=false);model.resumeAfterApply=false;}catch(error){if(token===generation)model.error=String(error);}finally{if(token===generation)model.busy=false;}}
   paint();return;}
  const newEstimate=estimate?null:{project_id:state.projectId,title:'Presupuesto con ACU'};
  generation++;const token=generation;
  host.innerHTML='';model={open:!authorization,headless:!!authorization,operation,appendTargetIds:new Set(operation==='append'?lineIds:[]),draftKey:draftKey(),details:new Set(['targets']),scope:scope(),asOf:dateToday(),brief,mode:forceMode||((outline||!estimate)?'create':'fill'),estimate:estimate?structuredClone(estimate):{id:globalThis.crypto.randomUUID(),title:newEstimate.title},newEstimate,context:{resources:[],lines:[],sections:[],currency:'ARS'},resourceIds:new Set(),targetIds:new Set(),seeds:[],rows:[],choices:[],referenceKeys:new Set(),examples:[],resourceSearch:'',targetSearch:'',referenceSearch:'',busy:true,loading:true,error:'',notice:'',applied:false,batchId:globalThis.crypto.randomUUID()};stop=false;
  if(authorization){authorization.model=model;authorization.generation=token;authorization.scope=model.scope;}
  paint();
  try{
   const [context,choices]=await Promise.all([readContext(),invoke('assisted_acu_references')]);if(token!==generation)return;
   model.context=context;model.estimate.currency=context.currency;model.choices=choices.filter(c=>c.key!=='budget:'+model.estimate.id);
   model.resourceIds=new Set(context.resources.map(r=>r.id));model.seeds=outline?newAcuSeeds(outline):[];
   model.targetIds=new Set(model.mode==='create'?model.seeds.map(s=>s.id):context.lines.filter(l=>!l.components.length).map(l=>l.id));
   if(model.mode==='fill'&&lineIds?.length){
    if(lineIds.length>60||new Set(lineIds).size!==lineIds.length||lineIds.some(id=>!context.lines.some(l=>l.id===id))){model.targetIds.clear();throw new Error('Las partidas indicadas no corresponden a este presupuesto. Seleccionalas de nuevo en la lista.');}
    model.targetIds=new Set(lineIds);
   }
   if(model.mode==='fill')model.notice='Se completan los ACU de partidas existentes. Sus cantidades se conservan, salvo que elijas aplicar una medición propuesta.';
  }catch(error){if(token===generation)model.error=String(error);}finally{if(token===generation){model.busy=false;model.loading=false;paint();}}
 }
 function cancelApproved(){
  if(!approvedRun||approvedRun.writing)return false;
  approvedRun.revoked=true;stop=true;request?.cancel();return true;
 }
 function approvalCurrent(authorization){return approvedRun===authorization&&!authorization.revoked&&!authorization.used&&!stop&&authorization.model===model&&authorization.generation===generation&&authorization.scope===scope()&&!state.navigating&&!state.modal&&!state.pageDirty&&!state.remoteProject&&!state.projects.find(project=>project.id===state.projectId)?.read_only&&!state.estimates.find(estimate=>estimate.id===state.estimateId)?.issued;}
 function approvedProgress(authorization,phase,message,extra={}){
  try{const result=authorization.onProgress?.({phase,message,projectId:authorization.projectId,estimateId:authorization.model?.estimate.id,...extra});result?.catch?.(()=>{});}catch{}
 }
 async function runApproved(input,{onProgress}={}){
  if(approvedRun||model.busy)throw new Error('Esperá a que termine la preparación actual o detenela antes de iniciar otra carga');
  if(!input||!['fill','create'].includes(input.mode)||typeof input.brief!=='string'||!input.brief.trim()||input.brief.length>3000)throw new Error('La carga aprobada necesita un objetivo y criterios acotados');
  if(input.lineIds!=null&&(!Array.isArray(input.lineIds)||input.lineIds.some(id=>typeof id!=='string')||new Set(input.lineIds).size!==input.lineIds.length||input.lineIds.length>60))throw new Error('Las partidas aprobadas no son válidas');
  if(input.mode==='create'&&input.lineIds?.length)throw new Error('La creación de partidas no puede incluir identificadores de partidas existentes');
  if(input.operation!=null&&!['append','productivity'].includes(input.operation))throw new Error('La operación de ACU aprobada no es válida');
  const append=input.operation==='append',productivity=input.operation==='productivity';
  if((append||productivity)&&(input.mode!=='fill'||!input.lineIds?.length||(productivity&&input.lineIds.length!==1)))throw new Error('Para agregar insumos indicá las partidas existentes de destino; nunca se seleccionan todas automáticamente');
  const brief=input.brief.trim(),mode=input.mode,approvedLineIds=[...(input.lineIds||[])];
  const outline=mode==='create'&&input.outline?.length?parsePlan(JSON.stringify({proposal_lines:input.outline})):null;
  keepDraft();
  const authorization={projectId:state.projectId,initialScope:scope(),onProgress,revoked:false,used:false,writing:false,targetIds:new Set()};approvedRun=authorization;stop=false;
  let saved=0,created=0,error='',cancelled=false,committed=false,lineIds=[];
  approvedProgress(authorization,'preparing','Leyendo las partidas y los precios actuales para esta carga aprobada.');
  try{
   if(authorization.revoked||authorization.initialScope!==scope()){cancelled=true;return finish();}
   await open(brief,outline,mode,approvedLineIds,authorization,productivity?'productivity':append?'append':null);
   if(authorization.model===model)authorization.targetIds=new Set(model.targetIds);
   if(!approvalCurrent(authorization)){cancelled=true;return finish();}
   if(model.error)throw new Error(model.error);
   model.busy=true;model.context=structuredClone(model.context);paint();
   if(model.mode==='create'&&!model.seeds.length){
    approvedProgress(authorization,'preparing','Preparando la lista de partidas nuevas de esta solicitud.');
    if(!approvalCurrent(authorization)){cancelled=true;return finish();}
    const result=await ask([{role:'user',content:'Prepará una lista de partidas y rubros para esta obra: '+model.brief+'\nRespondé JSON con answer y proposal_lines. No inventes cantidades ni precios: usá null cuando no estén dados. Máximo 60 partidas; los ACU se prepararán después.'}],JSON.stringify({currency:model.context.currency,existing_lines:model.context.lines.slice(0,40).map(line=>({description:line.description,unit:line.unit}))}),'plan');
    if(!approvalCurrent(authorization)){cancelled=true;return finish();}
    model.seeds=newAcuSeeds(parsePlan(result.text));model.targetIds=new Set(model.seeds.map(seed=>seed.id));
   }
   const seeds=targets().map(seed=>structuredClone(seed));authorization.targetIds=new Set(seeds.map(seed=>seed.id));
   if(!seeds.length){model.notice='No hay partidas pendientes dentro de esta solicitud. No se guardó ningún cambio.';return finish();}
   const resources=structuredClone(selectedResources());if(!resources.length)throw new Error('No hay insumos disponibles en el catálogo para preparar los ACU');
   if(productivity){
    if(seeds.length!==1)throw new Error('La corrección del rendimiento requiere una sola partida seleccionada');
    approvedProgress(authorization,'generating','Calculando el consumo inverso del equipo y comprobando la unidad del catálogo.');
    addRows([productivityEditRow(model.brief,seeds[0],resources)]);
   }else for(let offset=0;offset<seeds.length;offset+=5){
    if(!approvalCurrent(authorization)){cancelled=true;return finish();}
    const chunk=seeds.slice(offset,offset+5);
    approvedProgress(authorization,'generating',`Preparando ACU: consulta ${Math.floor(offset/5)+1} de ${Math.ceil(seeds.length/5)}. Todavía no se guardó ningún cambio.`,{prepared:model.rows.length,total:seeds.length});
    if(!approvalCurrent(authorization)){cancelled=true;return finish();}
    const additionInstruction=append?additionPrompt():'';
    const result=await ask([{role:'user',content:additionInstruction+'Prepará ACU solo para los targets indicados. Criterios aprobados por el usuario: '+model.brief+'\nRespondé JSON con answer y acu_proposals, con IDs exactos y consumos decimales como texto. Usá exclusivamente resource_id del catálogo. Para cada consumo incluí quantity_unit (unidad exacta del insumo), requested_description (material requerido realmente), consumption_support (hipótesis y fundamento del consumo) y, si convertiste una cifra, source_quantity y source_unit. No sustituyas materiales diferentes ni inventes precios, insumos o medidas: dejá measurements vacío y explicá los faltantes en missing_resources. Se conservarán las cantidades y los metrados actuales.'}],promptContext(chunk,resources,[]),'acu');
    if(!approvalCurrent(authorization)){cancelled=true;return finish();}
    const rows=append?parseAcuAdditions(result.text,chunk,resources,model.brief).map(row=>mergeAcuAddition(row,resources,model.brief)):parseAcuProposals(result.text,chunk,resources);
    for(const row of rows){row.apply_measurements=false;row.selected=false;}
    addRows(rows);
   }
   if(!approvalCurrent(authorization)){cancelled=true;return finish();}
   for(const row of model.rows){
    row.apply_measurements=false;row.preapproval_errors=[...acuPreapprovalErrors(row,model.context.resources),...(append?additionPreservationErrors(row):[])];
    row.selected=authorization.targetIds.has(row.id)&&!acuTotals(row,model.context.resources).errors.length&&!row.preapproval_errors.length;
   }
   const selected=model.rows.filter(row=>row.selected);if(!selected.length){model.notice=`No se guardó ningún ACU: ${authorization.targetIds.size} partidas necesitan revisión. Las propuestas se conservaron.`;return finish();}
   const batch=acuBatch({rows:model.rows,context:model.context,estimate:model.estimate,newEstimate:model.newEstimate,batchId:model.batchId,asOf:model.asOf});
   if(batch.updates.length||batch.deletes.length||batch.acus.some(acu=>!authorization.targetIds.has(acu.line_id)||acu.measurements!==null)||batch.creates.some(line=>!authorization.targetIds.has(line.id))||(model.mode==='fill'&&batch.creates.length))throw new Error('La carga supera el alcance de las partidas aprobadas');
   if(!approvalCurrent(authorization)){cancelled=true;return finish();}
   approvedProgress(authorization,'saving',`Guardando ${batch.acus.length} ACU completos. Las propuestas con faltantes quedan pendientes.`,{pending:authorization.targetIds.size-batch.acus.length});
   if(!approvalCurrent(authorization)){cancelled=true;return finish();}
   authorization.used=true;authorization.writing=true;
   const result=await invoke('apply_reviewed_budget_batch',{batch});committed=true;authorization.writing=false;saved=result.composed;created=result.created;lineIds=batch.acus.map(acu=>acu.line_id);
   model.applied=true;drafts.delete(model.draftKey);
   const ids=new Set(lineIds),rows=model.rows.filter(row=>!ids.has(row.id)),remainingSeeds=model.seeds.filter(seed=>!ids.has(seed.id)),targetIds=[...model.targetIds].filter(id=>!ids.has(id));
   model.remaining={rows,seeds:remainingSeeds,targetIds,count:new Set([...rows.map(row=>row.id),...remainingSeeds.map(seed=>seed.id),...targetIds]).size};
   model.lastApplied={estimateId:model.estimate.id,lineIds:[...lineIds]};
   model.notice=`Guardado: ${saved} ACU y ${created} partidas nuevas. Pendientes de revisión: ${model.remaining.count}.`;
   const createdEstimate=!!model.newEstimate;model.newEstimate=null;model.draftKey=[authorization.projectId,model.estimate.id].join(':');
   if(authorization.generation===generation&&authorization.scope===scope()){
    state.message=model.notice;model.scope=['workspace',authorization.projectId,model.estimate.id].join(':');authorization.scope=model.scope;
    state.search='';state.selectedLineId=lineIds[0];state.panel='acu';
    if(createdEstimate){await loadEstimates();await openEstimate(model.estimate.id,lineIds[0]);}else if(state.view==='workspace')await loadEstimate();else await openEstimate(model.estimate.id,lineIds[0]);
   }
  }catch(caught){
   if(committed)error='Se guardó el lote, pero falló el refresco de la vista. Reabrí el presupuesto. '+String(caught);
   else if(authorization.revoked||stop||(authorization.model&&authorization.generation!==generation)){cancelled=true;}
   else error=String(caught);
  }finally{if(approvedRun===authorization)finish();}
  return summary();
  function summary(){
   const snapshot=authorization.model,done=new Set(lineIds);
   const pendingReasons=(snapshot?.rows||[]).filter(row=>!done.has(row.id)).slice(0,8).map(row=>({description:row.seed.description,reasons:[...new Set([...(row.missing_resources||[]),...acuPreapprovalErrors(row,snapshot.context.resources)])].slice(0,10)}));
   const warnings=committed?(snapshot?.rows||[]).filter(row=>done.has(row.id)).flatMap(row=>row.advisories||[]):[];
   return {saved,created,pending:Math.max(0,authorization.targetIds.size-saved),pendingReasons,warnings,projectId:authorization.projectId,estimateId:snapshot?.estimate.id,lineIds:[...lineIds],committed,cancelled,error};
  }
  function finish(){
   if(approvedRun===authorization){
    authorization.revoked=true;authorization.writing=false;approvedRun=null;
    if(authorization.model===model){model.busy=false;model.headless=false;model.rows.forEach(row=>row.selected=false);if(error)model.error=error;if(cancelled)model.notice='Se detuvo la carga. Las propuestas recibidas se conservaron sin aplicar cambios adicionales.';keepDraft();paint();}
    const result=summary();approvedProgress(authorization,'done',error||authorization.model?.notice||'Terminó la preparación de ACU.',result);
   }
   return summary();
  }
 }
 function targets(){return model.mode==='create'?model.seeds.filter(s=>model.targetIds.has(s.id)):model.context.lines.filter(l=>model.targetIds.has(l.id)&&(model.operation!=='append'||model.appendTargetIds.has(l.id))).map(acuSeed);}
 function additionPrompt(){return 'OPERACIÓN ADITIVA: components debe contener SOLO los insumos adicionales de este pedido y sus incrementos, nunca la composición existente ni reemplazos. CPOBRAS preserva la composición original y suma esos incrementos. Para cada incremento informá quantity_scope:"per_unit" si es consumo por una unidad de partida, o "total" si quantity es una cantidad total explícita del pedido; CPOBRAS la dividirá por la cantidad actual de la partida. No confundas cantidades totales con consumos. quantity_unit debe ser la unidad real del catálogo. Si el pedido usa otra unidad y falta una conversión comprobable (por ejemplo m² frente a m), indicá el faltante y no asumas equivalencia. No cambies el rubro ni propongas mediciones. ';}
 function promptContext(seeds,resources,examples){const text=acuPromptContext(seeds,resources,examples,model.brief);return model.operation==='append'?JSON.stringify({...JSON.parse(text),operation:'append'}):text;}
 function pending(){const done=new Set(model.rows.map(r=>r.id));return targets().filter(s=>!done.has(s.id));}
 function resourceOptions(){return model.context.resources.map(r=>`<option value="${e(r.code+' · '+r.description+' · '+r.unit)}"></option>`).join('');}
 function resourceLabel(id){const r=model.context.resources.find(r=>r.id===id);return r?r.code+' · '+r.description+' · '+r.unit:'';}
 function consumptionEvidence(component){return [component.quantity_unit?'Unidad del consumo: '+component.quantity_unit:'',component.source_quantity&&component.source_unit?'Cantidad de origen: '+component.source_quantity+' '+component.source_unit:'',component.consumption_support||''].filter(Boolean).join(' · ');}
 function libraryButton(index){return typeof openResourceLibrary==='function'?`<button type="button" data-acu="library"${Number.isInteger(index)?` data-index="${index}"`:''} ${model.busy||model.applied?'disabled':''}>Abrir biblioteca de insumos</button>`:'';}
 function libraryBrief(index){
  const readable=value=>{
   const text=String(value||'').replace(/[\u0000-\u001F\u007F]/g,' ').trim();
   if(!text||!/[a-záéíóúüñ]/i.test(text)||/^(?:unknown|unavailable|missing|fake|resource(?:_?id)?|null|undefined|desconocido)$/i.test(text)||/^[a-f\d]{8}-[a-f\d-]{27,}$/i.test(text)||(!/\s/.test(text)&&(/[\d_.:/-]/.test(text)||/^[A-Z]{2,8}$/.test(text))))return '';
   return text;
  };
  const rows=Number.isInteger(index)?model.rows.slice(index,index+1):model.rows;
  const requirements=rows.flatMap(row=>{
   const unavailable=row.components.filter(c=>!model.context.resources.some(r=>r.id===c.resource_id));
   if(!unavailable.length&&!row.missing_resources.length)return [];
   const descriptions=[...new Set([...row.missing_resources,...unavailable.map(c=>c.description)].map(readable).filter(Boolean))];
   return [`Partida «${row.seed.description}»: faltantes a identificar y revisar:\n${descriptions.length?descriptions.map(description=>'• '+description).join('\n'):'• Identificar el insumo necesario: la propuesta no contiene un nombre de material verificable.'}${descriptions.length&&unavailable.length&&!unavailable.some(c=>readable(c.description))?'\n• Hay componentes sin identificar; revisá qué insumos requieren antes de darlos de alta.':''}`];
  });
  return [model.brief.trim(),...requirements,'Preparar los insumos faltantes en la biblioteca para revisión del usuario. Los nombres indicados son faltantes a identificar, no altas confirmadas. No asumir códigos, unidades, tipos ni precios que no estén informados. Después se elegirán los insumos reales en las propuestas de ACU conservadas.'].filter(Boolean).join('\n\n');
 }
 async function resumeFromLibrary(){
  await open();
  if(!model.open||model.scope!==scope())return;
  const token=generation;model.busy=true;model.error='';model.rows.forEach(row=>row.selected=false);paint();
  try{
   const previous=new Set(model.context.resources.map(resource=>resource.id)),context=await readContext();if(token!==generation)return;
   model.context.resources=context.resources;
   model.resourceIds=new Set([...model.resourceIds].filter(id=>context.resources.some(resource=>resource.id===id)));
   for(const resource of context.resources)if(!previous.has(resource.id))model.resourceIds.add(resource.id);
   model.priceDateDirty=false;
   model.notice='Se retomaron las propuestas y se actualizó la biblioteca, sin repetir la consulta de IA. Elegí los insumos reales en los campos pendientes, resolvé los faltantes y revisá otra vez los ACU antes de guardarlos.';
  }catch(error){if(token===generation)model.error=String(error);}finally{if(token===generation){model.busy=false;paint();}}
 }
 function priceSummary(row){const totals=acuTotals(row,model.context.resources);return totals.unit_cost==null?'ACU incompleto':money(totals.unit_cost)+' '+model.context.currency+' / '+row.seed.unit;}
 function proposalMarkup(row,index){
  const totals=acuTotals(row,model.context.resources);let measure='';try{measure=measurementQuantity(row.measurements);}catch{measure='Medición incompleta';}
  return `<details class="acu-proposal" data-acu-proposal="${e(row.id)}" ${row.expanded?'open':''}><summary><span><input type="checkbox" data-acu-row="selected" data-index="${index}" aria-label="Aplicar ACU de ${e(row.seed.description)}" ${row.selected?'checked':''} ${model.busy||model.applied?'disabled':''}> ${e(row.seed.description)} <small>${row.seed.is_new?'Nueva partida':row.seed.components.length?'Reemplaza ACU existente':'Completa ACU vacío'}</small></span><strong>${e(priceSummary(row))}</strong></summary><div class="acu-proposal-body"><p>Actual: ${e(row.seed.quantity)} ${e(row.seed.unit)} · ${money(row.seed.unit_cost)} ${e(model.context.currency)} por unidad. Propuesto: <b data-acu-cost>${totals.unit_cost==null?'Sin costo completo':money(totals.unit_cost)}</b> ${e(model.context.currency)} por ${e(row.seed.unit)}. <span data-acu-total>Total de partida: ${totals.total==null?'sin costo completo':money(totals.total)} ${e(model.context.currency)}.</span></p><div class="acu-fields"><label>Descripción<input data-acu-row="description" data-index="${index}" value="${e(row.seed.description)}" ${!row.seed.is_new||model.busy||model.applied?'disabled':''} maxlength="500"></label><label>Unidad de partida<input data-acu-row="unit" data-index="${index}" value="${e(row.seed.unit)}" ${!row.seed.is_new||model.busy||model.applied?'disabled':''} maxlength="30"></label><label>Cantidad a aplicar<input data-acu-row="quantity" data-index="${index}" value="${e(row.apply_measurements?totals.quantity:row.seed.quantity)}" ${!row.seed.is_new||row.apply_measurements||model.busy||model.applied?'disabled':''}></label><label>Rubro: elegí existente o escribí uno nuevo<input list="acu-sections" data-acu-row="section" data-index="${index}" value="${e(sectionLabel(row))}" ${model.busy||model.applied?'disabled':''}></label></div><p class="acu-help">Consumo de cada insumo por <b>1 ${e(row.seed.unit)}</b> de partida. Revisá especialmente kg/bolsa, horas/jornal, espesores y desperdicios. Usá coma o punto decimal, sin separadores de miles.</p><div class="acu-table-wrap"><table><thead><tr><th>Insumo · unidad</th><th>Consumo por unidad</th><th>Precio vigente</th><th>Parcial por unidad</th><th></th></tr></thead><tbody>${row.components.map((c,i)=>{const r=model.context.resources.find(r=>r.id===c.resource_id);return `<tr><td><input list="acu-resource-list" data-acu-component="resource_id" data-index="${index}" data-component="${i}" aria-label="Insumo ${i+1} de ${e(row.seed.description)}" value="${e(resourceLabel(c.resource_id)||c.description||'')}" placeholder="Buscar por código o descripción" ${model.busy||model.applied?'disabled':''}><small>${e(kindName(r?.kind))} · ${e(r?.unit||'Sin insumo')} · ${e(priceSource(r))}</small>${!r?libraryButton(index):''}</td><td><input data-acu-component="quantity" data-index="${index}" data-component="${i}" value="${e(c.quantity)}" aria-label="Consumo ${i+1} de ${e(row.seed.description)}" ${model.busy||model.applied?'disabled':''}><small>${e(r?.unit||'?')} / ${e(row.seed.unit)}</small><small data-acu-evidence ${consumptionEvidence(c)?'':'hidden'}>${e(consumptionEvidence(c))}</small></td><td>${r?.price==null?`Sin precio ${r?`<button type="button" data-acu="edit-price" data-resource="${e(r.id)}" ${model.busy||model.applied?'disabled':''}>Registrar precio</button>`:''}`:money(r.price)}</td><td data-component-partial>${r?.price==null?'—':money(safeProduct(c.quantity,r.price))}</td><td><button type="button" data-acu="remove-component" data-index="${index}" data-component="${i}" aria-label="Quitar insumo" ${model.busy||model.applied?'disabled':''}>×</button></td></tr>`;}).join('')}</tbody></table></div><button type="button" data-acu="add-component" data-index="${index}" ${model.busy||model.applied?'disabled':''}>＋ Insumo</button><details data-acu-measure-detail="${e(row.id)}" ${row.measurementExpanded?'open':''}><summary>Mediciones propuestas · ${row.measurements.length} renglones</summary><p>La cantidad actual se conserva salvo que marques Aplicar medición. Si la aplicás, reemplaza las mediciones anteriores de esta partida y se guarda en Metrados.</p><label><input type="checkbox" data-acu-row="apply_measurements" data-index="${index}" ${row.apply_measurements?'checked':''} ${model.busy||model.applied?'disabled':''}> Aplicar medición propuesta: <strong data-acu-measure>${e(measure??'sin dimensiones')} ${e(row.seed.unit)}</strong></label><div class="acu-table-wrap"><table><thead><tr><th>Descripción</th><th>Factor / caras</th><th>Largo (m)</th><th>Ancho (m)</th><th>Alto (m)</th><th>Suma / resta</th><th></th></tr></thead><tbody>${row.measurements.map((m,i)=>`<tr>${['note','factor','length','width','height'].map(field=>`<td><input data-acu-measurement="${field}" data-index="${index}" data-measure="${i}" value="${e(m[field])}" aria-label="${field} medición ${i+1}" ${model.busy||model.applied?'disabled':''}></td>`).join('')}<td><select data-acu-measurement="sign" data-index="${index}" data-measure="${i}" ${model.busy||model.applied?'disabled':''}><option value="1" ${m.sign===1?'selected':''}>Sumar</option><option value="-1" ${m.sign===-1?'selected':''}>Descontar</option></select></td><td><button type="button" data-acu="remove-measure" data-index="${index}" data-measure="${i}" ${model.busy||model.applied?'disabled':''}>×</button></td></tr>`).join('')}</tbody></table></div><button type="button" data-acu="add-measure" data-index="${index}" ${model.busy||model.applied?'disabled':''}>＋ Medición</button></details><label>Hipótesis, origen y revisión de los rendimientos<textarea data-acu-row="assumptions" data-index="${index}" maxlength="5500" ${model.busy||model.applied?'disabled':''}>${e(row.assumptions.join('\n'))}</textarea></label>${row.missing_resources.length?`<div class="acu-warning">Faltantes: ${row.missing_resources.map(e).join(' · ')}${libraryButton(index)}<label><input type="checkbox" data-acu-row="missing_resolved" data-index="${index}" ${row.missing_resolved?'checked':''} ${model.busy||model.applied?'disabled':''}> Revisé y resolví estos faltantes en la composición</label></div>`:''}<p class="acu-warning" data-acu-warnings ${totals.warnings.length?'':'hidden'}>${totals.warnings.map(e).join(' · ')}</p><p class="acu-error" data-acu-errors>${totals.errors.map(e).join(' · ')}</p><p class="acu-warning" data-acu-preapproval-errors ${row.preapproval_errors?.length?'':'hidden'}>${row.preapproval_errors?.length?'Pendiente de carga automática: '+row.preapproval_errors.map(e).join(' · '):''}</p><button type="button" data-acu="discard" data-index="${index}" ${model.busy||model.applied?'disabled':''}>Descartar propuesta de esta partida</button></div></details>`;
 }
 function priceSource(r){return r?.price_source==='presupuesto'?'Precio del presupuesto':r?.price_source?.startsWith('catálogo:')?'Precio de catálogo':r?.price_source||'';}
 function safeProduct(q,p){try{return multiplyDecimals(q,p);}catch{return null;}}
 function workflow(){
  const checked=model.rows.map(row=>({row,errors:[...acuTotals(row,model.context.resources).errors,...(model.operation==='append'?additionPreservationErrors(row):[])]}));
  const selected=checked.filter(x=>x.row.selected),invalid=selected.filter(x=>x.errors.length);
  return {prepared:checked.length,complete:checked.filter(x=>!x.errors.length).length,selected:selected.length,invalid:invalid.length,creates:selected.filter(x=>x.row.seed.is_new).length};
 }
 function updateWorkflow(){
  const info=workflow(),button=host.querySelector('[data-acu=apply]'),hint=host.querySelector('[data-acu-apply-hint]');
  if(button){button.disabled=model.busy||model.applied||!info.selected||!!info.invalid||model.priceDateDirty;button.textContent=model.applied?'Guardado':`Guardar ${info.selected} ACU${info.creates?` y crear ${info.creates} ${info.creates===1?'partida':'partidas'}`:''}`;}
  if(hint)hint.textContent=model.applied?'Los cambios ya se guardaron. Podés verlos en el presupuesto.':model.busy?'Esperá a que termine la preparación o detené las consultas.':!info.prepared?(pending().length?(model.mode==='fill'?'Las partidas ya existen. Siguiente paso: generar sus ACU; no se crearán partidas nuevas.':'La lista todavía no está guardada. Siguiente paso: generar los ACU de las partidas seleccionadas.'):'Prepará o seleccioná primero las partidas.'):!info.selected?`Hay ${info.prepared} propuestas, ${info.complete} completas. Revisá los insumos y marcá los ACU que quieras guardar.`:info.invalid?`${info.invalid} ACU seleccionados tienen datos pendientes. Revisalos antes de guardar.`:model.priceDateDirty?'Actualizá los precios después de cambiar la fecha.':`Se guardarán ${info.selected} ACU${info.creates?` y se crearán ${info.creates} ${info.creates===1?'partida nueva':'partidas nuevas'}`:''} al confirmar.`;
  const counts=host.querySelector('[data-acu-review-count]');if(counts)counts.textContent=`${info.prepared} propuestas · ${info.complete} completas · ${info.selected} marcadas para guardar`;
 }
 function showProposals(){window.requestAnimationFrame?.(()=>host.querySelector('.acu-proposals')?.scrollIntoView({block:'start',behavior:'smooth'}));}
 async function showResult(close=false){
  const result=model.lastApplied;if(!result)return;
  state.search='';state.selectedLineId=result.lineIds[0];state.panel='acu';
  if(close){keepDraft();model.open=false;paint();}
  await openEstimate(result.estimateId,result.lineIds[0]);
  state.selectedLineId=result.lineIds[0];state.panel='acu';
  document.querySelector(`#app .line-row[data-id="${result.lineIds[0]}"]`)?.scrollIntoView({block:'nearest'});
 }
 function paint(){
  const bodyScroll=host.querySelector('.acu-body')?.scrollTop||0,listScroll=[...host.querySelectorAll?.('.acu-choice-list')||[]].map(n=>n.scrollTop);
  if(!model.open){host.innerHTML='';return;}
  const disabled=model.busy||model.applied,flow=workflow();
  host.innerHTML=`<div class="acu-overlay"><section class="acu-dialog" role="dialog" aria-modal="true" aria-label="ACU con insumos y rendimientos"><header><h2>ACU con insumos, rendimientos y metrado</h2><button type="button" data-acu="close" aria-label="Cerrar preparación ACU" ${model.busy&&!request?'disabled':''}>×</button></header><div class="acu-body"><ol class="acu-steps" aria-label="Pasos para guardar los ACU"><li>${model.mode==='fill'?'1. Seleccionar partidas existentes':'1. Preparar lista'}</li><li>2. Generar ACU</li><li>3. Revisar y guardar</li></ol><p class="acu-help" data-acu-review-count></p><p><b>${e(model.estimate.title)}</b> · ${e(model.context.currency)}. Los costos se calculan con insumos del catálogo; la IA propone consumos, no precios. Las recetas no se guardan hasta confirmar. Al cerrar, las propuestas se conservan en memoria mientras CPOBRAS siga abierto.</p><button type="button" data-acu="new-preparation" ${disabled?'disabled':''}>Nueva preparación</button>${model.newEstimate?`<label>Título del presupuesto nuevo<input data-acu-field="title" value="${e(model.newEstimate.title)}" maxlength="500" ${disabled?'disabled':''}></label>`:''}<div class="acu-fields"><label>Objetivo<select data-acu-field="mode" ${disabled||model.rows.length||model.operation==='append'?'disabled':''}>${!model.newEstimate?`<option value="fill" ${model.mode==='fill'?'selected':''}>Completar ACU de partidas existentes</option>`:''}<option value="create" ${model.mode==='create'?'selected':''}>Crear partidas con ACU</option></select></label><label>Fecha para precios de catálogo<input type="date" data-acu-field="asOf" value="${e(model.asOf)}" ${disabled?'disabled':''}></label><button type="button" data-acu="refresh" ${disabled?'disabled':''}>Actualizar precios y catálogo</button></div>${model.editPrice?`<div class="acu-price-editor"><strong>Registrar precio en biblioteca: ${e(model.context.resources.find(r=>r.id===model.editPrice)?.description)}</strong><label>Importe en ${e(model.context.currency)} a ${e(model.asOf)}<input data-acu-field="priceAmount" value="${e(model.priceAmount||'')}" placeholder="Decimal con punto" ${disabled?'disabled':''}></label><button type="button" data-acu="save-price" ${disabled?'disabled':''}>Guardar precio en biblioteca</button><button type="button" data-acu="cancel-price" ${disabled?'disabled':''}>Cerrar</button><p>Este botón registra el precio en el historial del catálogo; las recetas se aplican por separado.</p></div>`:''}<p class="acu-help">Se usa primero el precio del insumo fijado en este presupuesto; si no existe, el del catálogo en ${e(model.context.currency)} a la fecha elegida. No se convierten monedas ni se copian precios históricos. Si falta un insumo, abrí la biblioteca para cargarlo individualmente o preparar una carga masiva. Al volver se conservan las propuestas para elegir los insumos reales, sin repetir la consulta.</p>${libraryButton()}<label>Describí el trabajo, espesores, dosificación, medidas y criterios que conocés<textarea data-acu-field="brief" maxlength="3000" rows="3" ${disabled?'disabled':''} placeholder="Ej.: revoque de dos caras en muro de 20 m × 3 m, descontar una abertura de 2 m × 2 m. Usar los insumos de la biblioteca y explicar rendimientos por m².">${e(model.brief)}</textarea></label><div class="acu-config"><details data-acu-detail="resources" ${model.details.has('resources')?'open':''}><summary>Insumos para IA · ${model.resourceIds.size} seleccionados de ${model.context.resources.length}</summary><input data-acu-search="resourceSearch" value="${e(model.resourceSearch)}" placeholder="Buscar insumo por descripción, código o unidad"><div class="acu-toolbar"><button type="button" data-acu="resources-visible" ${disabled?'disabled':''}>Seleccionar coincidencias</button><button type="button" data-acu="resources-none" ${disabled?'disabled':''}>Limpiar selección</button></div><div class="acu-choice-list">${model.context.resources.filter(r=>normalize(r.code+' '+r.description+' '+r.unit).includes(normalize(model.resourceSearch))).map(r=>`<label><input type="checkbox" data-acu-resource="${e(r.id)}" ${model.resourceIds.has(r.id)?'checked':''} ${disabled?'disabled':''}> ${e(r.code)} · ${e(r.description)} · ${e(r.unit)} · ${r.price==null?'Sin precio':money(r.price)}</label>`).join('')}</div></details><details data-acu-detail="references" ${model.details.has('references')?'open':''}><summary>Presupuestos y ACU de referencia · ${model.referenceKeys.size} seleccionados</summary><p>Elegí hasta tres referencias propias. Se leen como ejemplos para esta consulta; no se entrena el modelo ni se modifican los originales.</p><input data-acu-search="referenceSearch" value="${e(model.referenceSearch)}" placeholder="Buscar obra, presupuesto o ACU"><div class="acu-choice-list">${model.choices.filter(c=>normalize(c.title).includes(normalize(model.referenceSearch))).map(c=>`<label><input type="checkbox" data-acu-reference="${e(c.key)}" ${model.referenceKeys.has(c.key)?'checked':''} ${disabled?'disabled':''}> ${e(c.title)}</label>`).join('')}</div><button type="button" data-acu="load-references" ${disabled?'disabled':''}>Cargar referencias elegidas</button><p>${model.examples.length} recetas de referencia cargadas</p>${model.examples.length?`<label>Receta para reutilizar<select data-acu-field="exampleIndex" ${disabled?'disabled':''}>${model.examples.map((ex,i)=>`<option value="${i}" ${model.exampleIndex===i?'selected':''}>${e(ex.source_title||ex.key)} · ${e(ex.description)} (${e(ex.unit)})</option>`).join('')}</select></label><label>Partida de destino<select data-acu-field="copyTarget" ${disabled?'disabled':''}><option value="">Elegí una partida</option>${[...model.context.lines.map(acuSeed),...model.seeds].map(s=>`<option value="${e(s.id)}" ${model.copyTarget===s.id?'selected':''}>${e(s.description)} · ${e(s.unit)}</option>`).join('')}</select></label><button type="button" data-acu="copy-example" ${disabled?'disabled':''}>Copiar receta a una propuesta revisable</button>`:''}</details></div>${model.mode==='create'?`<div class="acu-toolbar"><button type="button" data-acu="outline" ${disabled?'disabled':''}>Preparar lista de partidas con IA</button><button type="button" data-acu="add-seed" ${disabled?'disabled':''}>＋ Partida manual</button></div>`:''}<details class="acu-targets" data-acu-detail="targets" ${model.details.has('targets')?'open':''}><summary>${model.mode==='create'?'Partidas nuevas a preparar':'Partidas a completar'} · ${model.targetIds.size} seleccionadas</summary><div class="acu-toolbar"><button type="button" data-acu="targets-missing" ${disabled?'disabled':''}>${model.mode==='create'?'Seleccionar todas':'Seleccionar sin ACU'}</button><button type="button" data-acu="targets-none" ${disabled?'disabled':''}>Desmarcar todas</button><input data-acu-search="targetSearch" value="${e(model.targetSearch)}" placeholder="Filtrar partidas"></div><div class="acu-choice-list">${(model.mode==='create'?model.seeds:model.context.lines).filter(s=>normalize(s.description+' '+s.section).includes(normalize(model.targetSearch))).map(s=>`<div class="acu-target"><label><input type="checkbox" data-acu-target="${e(s.id)}" ${model.targetIds.has(s.id)?'checked':''} ${disabled?'disabled':''}> ${e(s.description)} · ${e(s.unit)} · ${s.is_new?'Nueva':s.components.length?'Tiene ACU: se reemplazará':'Sin ACU / vacío'}</label>${s.is_new?`<div class="acu-fields"><input data-acu-seed="description" data-id="${e(s.id)}" value="${e(s.description)}" maxlength="500" aria-label="Descripción de partida nueva" ${disabled||model.rows.some(r=>r.id===s.id)?'disabled':''}><input data-acu-seed="unit" data-id="${e(s.id)}" value="${e(s.unit)}" aria-label="Unidad de partida nueva" maxlength="30" ${disabled||model.rows.some(r=>r.id===s.id)?'disabled':''}><input data-acu-seed="quantity" data-id="${e(s.id)}" value="${e(s.quantity)}" aria-label="Cantidad de partida nueva" ${disabled||model.rows.some(r=>r.id===s.id)?'disabled':''}><input data-acu-seed="section" data-id="${e(s.id)}" value="${e(s.section)}" placeholder="Rubro" maxlength="100" ${disabled||model.rows.some(r=>r.id===s.id)?'disabled':''}></div>`:''}</div>`).join('')}</div></details><div class="acu-toolbar"><button type="button" data-acu="generate" ${disabled||!pending().length?'disabled':''}>2. Generar ACU · ${pending().length} partidas / ${Math.ceil(pending().length/5)} consultas</button><button type="button" data-acu="manual" ${disabled?'disabled':''}>Agregar propuestas vacías para completar a mano</button>${request?'<button type="button" data-acu="cancel">Detener consultas</button>':''}</div><p class="acu-help">La generación usa tu API y puede generar cargos. Se procesa de a cinco partidas; al detener se conservan las propuestas recibidas y no se reintenta automáticamente. Los rendimientos sugeridos deben revisarse por unidad, condiciones y datos de obra.</p><p role="status">${e(model.notice)}</p><p class="acu-error" role="alert">${e(model.error)}</p><datalist id="acu-resource-list">${resourceOptions()}</datalist><datalist id="acu-sections">${model.context.sections.map(s=>`<option value="${e(s.code+' · '+s.title)}"></option>`).join('')}</datalist>${model.rows.length?`<div class="acu-toolbar"><button type="button" data-acu="select-valid" ${disabled?'disabled':''}>Marcar propuestas completas revisadas</button><button type="button" data-acu="unselect-rows" ${disabled?'disabled':''}>Desmarcar propuestas</button></div>`:''}<div class="acu-proposals" aria-label="Propuestas de ACU para revisar">${model.rows.map(proposalMarkup).join('')}</div></div><footer><p data-acu-apply-hint role="status"></p><div class="acu-footer-actions"><button type="button" data-acu="close" ${model.busy&&!request?'disabled':''}>Cerrar</button>${model.applied?`<button type="button" data-acu="view-result" ${model.busy?'disabled':''}>Ver en presupuesto</button>${model.remaining?.count?`<button type="button" data-acu="continue" ${model.busy?'disabled':''}>Continuar preparación · ${model.remaining.count} ${model.remaining.count===1?'pendiente':'pendientes'}</button>`:''}`:''}${!model.rows.length&&!model.applied?`<button type="button" data-acu="next" ${disabled||(!pending().length&&(model.mode!=='create'||model.seeds.length))?'disabled':''}>${pending().length?`2. Generar ACU de ${pending().length} partidas`:model.mode==='create'&&!model.seeds.length?'1. Preparar lista de partidas':'Seleccioná partidas para generar ACU'}</button>`:''}<button type="button" data-acu="apply" ${!model.rows.length?'hidden':''} ${disabled||!flow.selected||flow.invalid?'disabled':''}>Guardar ${flow.selected} ACU</button></div></footer></section></div>`;
  const body=host.querySelector('.acu-body');if(body)body.scrollTop=bodyScroll;host.querySelectorAll('.acu-choice-list').forEach((n,i)=>n.scrollTop=listScroll[i]||0);updateWorkflow();
 }
 async function ask(messages,context,mode){
  if(!canUseAi())throw new Error('Configurá la API y aceptá el envío al proveedor en la consola antes de generar propuestas');
  const current=createAiRequest(invoke,{messages,context,mode});request=current;paint();
  try{return await current.promise;}finally{if(request===current)request=null;}
 }
 function addRows(rows){const existing=new Set(model.rows.map(r=>r.id));for(const row of rows)if(!existing.has(row.id)){if(!model.rows.length)row.expanded=true;model.rows.push(row);existing.add(row.id);}}
 async function actionNext(button){return action(model.mode==='create'&&!model.seeds.length?'outline':'generate',button);}
 async function action(action,button){
  if(action==='view-result'){if(!model.busy)await showResult(true);return;}
  if(action==='continue'&&model.applied&&!model.busy){
   const token=generation;model.error='';model.busy=true;paint();try{const context=await readContext();if(token!==generation)return;model.context=context;model.rows=model.remaining.rows;model.rows.forEach(r=>r.selected=false);model.seeds=model.remaining.seeds;model.targetIds=new Set(model.remaining.targetIds);model.applied=false;model.remaining=null;model.batchId=globalThis.crypto.randomUUID();model.notice='Se conservaron las propuestas sin guardar. Revisalas y completá las partidas pendientes, sin repetir las propuestas que ya están preparadas.';}finally{if(token===generation){model.busy=false;paint();}}return;
  }
  if(action==='next'){await actionNext(button);return;}
  if(action==='cancel'){stop=true;request?.cancel();return;}
  if(action==='close'){if(model.busy&&!request)return;generation++;stop=true;request?.cancel();request=null;keepDraft();model.open=false;paint();return;}
  if(model.busy||model.applied)return;
  model.error='';const token=generation;
  if(model.operation==='append'&&['manual','copy-example','add-seed'].includes(action))throw new Error('Para agregar sin reemplazar la composición usá Generar ACU con los insumos adicionales de este pedido');
  if(action==='library'){
   if(typeof openResourceLibrary!=='function')throw new Error('La biblioteca de insumos no está disponible en esta vista');
   const brief=libraryBrief(button.dataset.index===undefined?null:Number(button.dataset.index));
   keepDraft();model.open=false;paint();
   try{await openResourceLibrary({brief});}catch(error){if(model.scope===scope())model.open=true;throw error;}
   return;
  }
  if(action==='new-preparation'){if(!window.confirm('¿Descartar las propuestas actuales y empezar otra preparación?'))return;drafts.delete(model.draftKey);model.rows=[];model.seeds=[];model.brief='';model.batchId=globalThis.crypto.randomUUID();}
  if(action==='outline'){
   if(!model.brief.trim())throw new Error('Describí primero los trabajos de la obra');
   if(model.seeds.length&&!window.confirm('¿Reemplazar la lista de partidas nuevas y sus propuestas aún no aplicadas?'))return;
   model.busy=true;stop=false;paint();
   try{const result=await ask([{role:'user',content:'Prepará una lista de partidas y rubros para esta obra: '+model.brief+'\nRespondé JSON con answer y proposal_lines. No inventes cantidades ni precios: usá null cuando no estén dados. Máximo 60 partidas; los ACU se prepararán después.'}],JSON.stringify({currency:model.context.currency,existing_lines:model.context.lines.slice(0,40).map(l=>({description:l.description,unit:l.unit}))}),'plan');if(token!==generation)return;model.seeds=newAcuSeeds(parsePlan(result.text));model.targetIds=new Set(model.seeds.map(s=>s.id));model.rows=[];model.batchId=globalThis.crypto.randomUUID();model.notice='Paso 1 completo: lista preparada, todavía sin guardar. Seguí con 2. Generar ACU.';}
   finally{if(token===generation){model.busy=false;paint();}}
  }
  if(action==='generate'){
   if(model.referencesDirty&&model.referenceKeys.size)throw new Error('Cargá las referencias elegidas antes de consultar la IA');
   if(model.priceDateDirty)throw new Error('Actualizá los precios después de cambiar la fecha');
   const todo=pending();if(!todo.length)throw new Error('Seleccioná partidas sin propuesta');if(!model.resourceIds.size)throw new Error('Seleccioná insumos de la biblioteca para proponer consumos');
   if(!window.confirm(`Se solicitarán ${Math.ceil(todo.length/5)} consultas de IA para ${todo.length} partidas, con los insumos y ejemplos seleccionados. Puede generar cargos. ¿Preparar propuestas?`))return;
   model.busy=true;stop=false;model.notice='Generando ACU… Todavía no se guardó ningún cambio en el presupuesto.';paint();
   try{for(let offset=0;offset<todo.length&&!stop;offset+=5){
    const seeds=todo.slice(offset,offset+5),resources=selectedResources();
    model.notice=`Generando ACU: consulta ${Math.floor(offset/5)+1} de ${Math.ceil(todo.length/5)}. Se guardarán solo después de revisar y confirmar.`;
    const context=promptContext(seeds,resources,model.examples.filter(ex=>model.referenceKeys.has(ex.source_key)));
    const result=await ask([{role:'user',content:(model.operation==='append'?additionPrompt():'')+'Prepará ACU para los targets indicados. Criterios del usuario: '+(model.brief||'Completar sus insumos y consumos por unidad, usando ejemplos cuando correspondan.')+'\nRespondé JSON con answer y acu_proposals, con IDs exactos, consumos decimales como texto y supuestos explícitos. No devuelvas precios. Para cada componente incluí quantity_unit con la unidad exacta del catálogo, requested_description con el material realmente requerido y consumption_support con el fundamento del consumo; si convertiste una cantidad, incluí source_quantity y source_unit. No inventes dimensiones: si faltan, dejá measurements vacío. Usá exclusivamente resource_id incluidos en resources. Si falta un insumo necesario, indicalo por nombre y requisitos conocidos en missing_resources; no inventes IDs, unidades ni precios, y no uses otro insumo disponible como sustituto para ocultar el faltante.'}],context,'acu');
    if(token!==generation)return;addRows(model.operation==='append'?parseAcuAdditions(result.text,seeds,resources,model.brief).map(row=>mergeAcuAddition(row,resources,model.brief)):parseAcuProposals(result.text,seeds,resources));model.details.delete('targets');model.notice=`Propuestas recibidas: ${Math.min(offset+5,todo.length)} de ${todo.length}. Las propuestas nuevas quedan desmarcadas para revisar.`;paint();
   }}catch(error){if(token===generation)model.notice=`La generación se detuvo. Se conservaron ${model.rows.length} propuestas recibidas; no se guardó ningún cambio. La lista de partidas sigue disponible.`;throw error;}finally{if(token===generation){model.busy=false;request=null;paint();if(model.rows.length)showProposals();}}
  }
  if(action==='edit-price'){model.editPrice=button.dataset.resource;model.priceAmount='';}
  if(action==='cancel-price')model.editPrice=null;
  if(action==='save-price'){
   const amount=importDecimal(String(model.priceAmount||'').replace(',','.'),'decimal',true);if(amount==null)throw new Error('Ingresá el precio del insumo');
   model.busy=true;paint();try{await invoke('add_resource_price',{resourceId:model.editPrice,amount,currency:model.context.currency,effectiveDate:model.asOf,source:'Precio ingresado por el usuario desde preparación de ACU'});const context=await readContext();if(token!==generation)return;model.context.resources=context.resources;model.priceDateDirty=false;model.editPrice=null;model.rows.forEach(r=>r.selected=false);model.notice='Precio registrado en biblioteca. Revisá otra vez los costos de las recetas.';}finally{if(token===generation)model.busy=false;}
  }
  if(action==='refresh'){
   model.busy=true;paint();try{const context=await readContext();if(token!==generation)return;model.context.resources=context.resources;model.priceDateDirty=false;model.resourceIds=new Set([...model.resourceIds].filter(id=>context.resources.some(r=>r.id===id)));model.rows.forEach(r=>r.selected=false);model.notice='Catálogo y precios actualizados. Revisá otra vez las recetas; las partidas mantienen la captura original para detectar cambios concurrentes.';}finally{if(token===generation)model.busy=false;}
  }
  if(action==='load-references'){
   if(model.referenceKeys.size>3)throw new Error('Elegí hasta tres referencias por preparación');
   model.busy=true;paint();try{const keys=[...model.referenceKeys];const results=await Promise.all(keys.map(key=>invoke('assisted_acu_reference',{key})));if(token!==generation)return;model.examples=results.flatMap((list,i)=>list.map(example=>({...example,source_key:keys[i],source_title:model.choices.find(c=>c.key===keys[i])?.title||keys[i]})));model.exampleIndex=0;model.referencesDirty=false;model.notice=`Se cargaron ${model.examples.length} recetas como ejemplos. Se usan sus consumos, no sus precios históricos.`;}finally{if(token===generation)model.busy=false;}
  }
  if(action==='copy-example'){
   const example=model.examples[model.exampleIndex||0],seed=[...model.context.lines.map(acuSeed),...model.seeds].find(s=>s.id===model.copyTarget);
   if(model.referencesDirty)throw new Error('Cargá otra vez las referencias elegidas');
   if(!example||!seed)throw new Error('Elegí una receta de referencia y una partida de destino');
   if(model.rows.some(r=>r.id===seed.id))throw new Error('Ya hay una propuesta para esa partida. Descartala antes de reemplazarla');addRows([copyAcuExample(seed,example)]);
  }
  if(action==='manual')addRows(pending().map(emptyAcu));
  if(action==='add-seed'){const seed=newAcuSeeds([{description:'Partida nueva',unit:'m²',quantity:'0',section:''}])[0];model.seeds.push(seed);model.targetIds.add(seed.id);}
   if(action==='targets-missing')model.targetIds=new Set(model.operation==='append'?model.appendTargetIds:model.mode==='create'?model.seeds.map(s=>s.id):model.context.lines.filter(l=>!l.components.length).map(l=>l.id));
  if(action==='targets-none')model.targetIds.clear();
  if(action==='resources-none')model.resourceIds.clear();
  if(action==='resources-visible')for(const r of model.context.resources.filter(r=>normalize(r.code+' '+r.description+' '+r.unit).includes(normalize(model.resourceSearch))))model.resourceIds.add(r.id);
  if(action==='select-valid')model.rows.forEach(r=>r.selected=!acuTotals(r,model.context.resources).errors.length);
  if(action==='unselect-rows')model.rows.forEach(r=>r.selected=false);
  const row=model.rows[Number(button.dataset.index)];
  if(action==='discard'){model.rows.splice(Number(button.dataset.index),1);}
  if(action==='add-component'){row.components.push({resource_id:'',quantity:''});row.expanded=true;row.selected=false;}
  if(action==='remove-component'){row.components.splice(Number(button.dataset.component),1);row.expanded=true;row.selected=false;}
  if(action==='add-measure'){row.measurementExpanded=true;row.measurements.push({note:'Medición',factor:'1',length:'',width:'1',height:'',sign:1});row.expanded=true;row.selected=false;}
  if(action==='remove-measure'){row.measurements.splice(Number(button.dataset.measure),1);row.expanded=true;row.selected=false;}
  if(action==='apply'){
   if(model.priceDateDirty)throw new Error('Actualizá los precios después de cambiar la fecha');
   if(state.remoteProject||(model.newEstimate&&state.projectId!==model.newEstimate.project_id)||(!model.newEstimate&&state.estimateId!==model.estimate.id))throw new Error('El contexto del presupuesto cambió');
   if(model.operation==='append')for(const selected of model.rows.filter(row=>row.selected)){const errors=additionPreservationErrors(selected);if(!model.appendTargetIds.has(selected.id)||selected.seed.is_new)errors.push('La partida no pertenece a esta adición');if(errors.length)throw new Error(errors.join(' · '));}
   const batch=acuBatch({rows:model.rows,context:model.context,estimate:model.estimate,newEstimate:model.newEstimate,batchId:model.batchId,asOf:model.asOf});
   const replaced=model.rows.filter(r=>r.selected&&!r.seed.is_new&&r.seed.components.length).length,measured=batch.acus.filter(a=>a.measurements).length;
   if(!window.confirm(`¿Aplicar ${batch.acus.length} ACU, crear ${batch.creates.length} partidas${model.newEstimate?' y un presupuesto nuevo':''}, reemplazar ${replaced} ACU existentes y aplicar ${measured} mediciones? Los costos se calcularán con precios de ${model.context.currency}; los rubros se crearán o asignarán según la revisión.`))return;
   model.busy=true;paint();try{const result=await invoke('apply_reviewed_budget_batch',{batch});model.applied=true;drafts.delete(model.draftKey);
    const ids=new Set(batch.acus.map(a=>a.line_id)),rows=model.rows.filter(r=>!ids.has(r.id)),seeds=model.seeds.filter(s=>!ids.has(s.id)),targetIds=[...model.targetIds].filter(id=>!ids.has(id));
    model.remaining={rows,seeds,targetIds,count:new Set([...rows.map(r=>r.id),...seeds.map(s=>s.id),...targetIds]).size};
    model.lastApplied={estimateId:model.estimate.id,lineIds:[...ids]};
    model.notice=`Guardado: ${result.composed} ACU y ${result.created} ${result.created===1?'partida nueva':'partidas nuevas'}. Se seleccionó una partida guardada y su pestaña ACU.`;state.message=model.notice;
    const createdEstimate=!!model.newEstimate;model.newEstimate=null;model.draftKey=[state.projectId,model.estimate.id].join(':');model.scope=['workspace',state.projectId,model.estimate.id].join(':');
    state.search='';state.selectedLineId=model.lastApplied.lineIds[0];state.panel='acu';
    if(createdEstimate){await loadEstimates();await openEstimate(model.estimate.id,model.lastApplied.lineIds[0]);}else if(state.view==='workspace'){await loadEstimate();}else await openEstimate(model.estimate.id,model.lastApplied.lineIds[0]);}
   catch(error){model.error=(model.applied?'Se guardó el lote, pero falló el refresco de la vista. Reabrí el presupuesto. ':'')+String(error);}finally{model.busy=false;}
  }
  paint();
 }
 function updateRowDisplay(index){
  const row=model.rows[index],node=host.querySelector(`[data-acu-proposal="${row.id}"]`);if(!node)return;const totals=acuTotals(row,model.context.resources);if(row.preapproval_errors)row.preapproval_errors=acuPreapprovalErrors(row,model.context.resources);const preapproval=node.querySelector('[data-acu-preapproval-errors]');if(preapproval){preapproval.textContent=row.preapproval_errors?.length?'Pendiente de carga automática: '+row.preapproval_errors.join(' · '):'';preapproval.hidden=!row.preapproval_errors?.length;}
  node.querySelector('[data-acu-row=selected]').checked=row.selected;
  for(const [i,c] of row.components.entries()){const input=node.querySelector(`[data-acu-component=resource_id][data-component="${i}"]`),r=model.context.resources.find(r=>r.id===c.resource_id);if(input){const tr=input.closest('tr');tr.querySelector('td:first-child small').textContent=(r?.unit||'Sin insumo')+' · '+priceSource(r);tr.querySelector('td:nth-child(2) small').textContent=(r?.unit||'?')+' / '+row.seed.unit;const evidence=tr.querySelector('[data-acu-evidence]');if(evidence){evidence.textContent=consumptionEvidence(c);evidence.hidden=!consumptionEvidence(c);}tr.querySelector('td:nth-child(3)').innerHTML=r?.price==null?'Sin precio'+(r?` <button type="button" data-acu="edit-price" data-resource="${e(r.id)}">Registrar precio</button>`:''):money(r.price);}}
  node.querySelector('summary strong').textContent=priceSummary(row);node.querySelector('[data-acu-row=quantity]').value=row.apply_measurements?totals.quantity:row.seed.quantity;node.querySelector('[data-acu-total]').textContent='Total de partida: '+(totals.total==null?'sin costo completo':money(totals.total))+' '+model.context.currency;node.querySelector('[data-acu-cost]').textContent=totals.unit_cost==null?'Sin costo completo':money(totals.unit_cost);node.querySelector('[data-acu-errors]').textContent=totals.errors.join(' · ');const warnings=node.querySelector('[data-acu-warnings]');warnings.textContent=totals.warnings.join(' · ');warnings.hidden=!totals.warnings.length;
  let m;try{m=measurementQuantity(row.measurements);}catch{m='Medición incompleta';}node.querySelector('[data-acu-measure]').textContent=(m??'sin dimensiones')+' '+row.seed.unit;
 }
 host.addEventListener('click',async event=>{event.stopPropagation();const button=event.target.closest('[data-acu]');if(!button||button.disabled)return;const token=generation;try{await action(button.dataset.acu,button);}catch(error){if(token===generation){model.error=String(error);paint();}}});
 host.addEventListener('input',event=>{
  event.stopPropagation();const t=event.target;
  if(t.dataset.acuField){const field=t.dataset.acuField;if(field==='title'){model.newEstimate.title=t.value;model.estimate.title=t.value;}else if(field!=='mode'&&field!=='asOf')model[field]=t.value;}
  if(t.dataset.acuSeed){const seed=model.seeds.find(s=>s.id===t.dataset.id);seed[t.dataset.acuSeed]=t.value;}
  if(t.dataset.acuSearch){const key=t.dataset.acuSearch,position=t.selectionStart;model[key]=t.value;paint();const input=host.querySelector(`[data-acu-search="${key}"]`);input?.focus();input?.setSelectionRange(position,position);return;}
  const index=Number(t.dataset.index),row=model.rows[index];
  if(t.dataset.acuRow&&row){const f=t.dataset.acuRow;if(f==='selected'||f==='apply_measurements'||f==='missing_resolved')row[f]=t.checked;else if(['description','unit','quantity'].includes(f))row.seed[f]=t.value;else if(f==='assumptions')row.assumptions=t.value.split('\n');else if(f==='section'){const s=model.context.sections.find(s=>s.code+' · '+s.title===t.value);row.section_id=s?.id||null;row.section_title=s?'':t.value;}if(f!=='selected')row.selected=false;updateRowDisplay(index);updateWorkflow();if(f==='apply_measurements')host.querySelector(`[data-acu-row="quantity"][data-index="${index}"]`).disabled=!row.seed.is_new||row.apply_measurements;}
  if(t.dataset.acuComponent&&row){const c=row.components[Number(t.dataset.component)];if(t.dataset.acuComponent==='resource_id'){const r=model.context.resources.find(r=>r.code+' · '+r.description+' · '+r.unit===t.value);c.resource_id=r?.id||'';if(r)c.requested_description=r.description;}else c.quantity=t.value;const selectedResource=model.context.resources.find(resource=>resource.id===c.resource_id);if(selectedResource){c.quantity_unit=selectedResource.unit;c.source_quantity=c.quantity;c.source_unit=selectedResource.unit;c.consumption_support='Consumo ingresado manualmente en la unidad del insumo.';}row.selected=false;updateRowDisplay(index);updateWorkflow();const r=model.context.resources.find(r=>r.id===c.resource_id);t.closest('tr').querySelector('[data-component-partial]').textContent=r?.price==null?'—':money(safeProduct(c.quantity,r.price));}
  if(t.dataset.acuMeasurement&&row){row.measurements[Number(t.dataset.measure)][t.dataset.acuMeasurement]=t.dataset.acuMeasurement==='sign'?Number(t.value):t.value;row.selected=false;updateRowDisplay(index);updateWorkflow();}
 });
 host.addEventListener('change',event=>{
  event.stopPropagation();const t=event.target;if(!t.isConnected)return;
  if(t.dataset.acuTarget){if(model.operation==='append'&&!model.appendTargetIds.has(t.dataset.acuTarget)){t.checked=false;return;}if(t.checked)model.targetIds.add(t.dataset.acuTarget);else model.targetIds.delete(t.dataset.acuTarget);paint();}
  if(t.dataset.acuResource){if(t.checked)model.resourceIds.add(t.dataset.acuResource);else model.resourceIds.delete(t.dataset.acuResource);paint();}
  if(t.dataset.acuReference){if(t.checked)model.referenceKeys.add(t.dataset.acuReference);else model.referenceKeys.delete(t.dataset.acuReference);model.referencesDirty=true;model.notice='Cambiaste las referencias elegidas. Cargalas antes de generar propuestas.';paint();}
  if(t.dataset.acuSearch){const key=t.dataset.acuSearch,position=t.selectionStart;paint();const input=host.querySelector(`[data-acu-search="${key}"]`);input?.focus();input?.setSelectionRange(position,position);}
  if(t.dataset.acuField==='mode'){if(model.operation==='append'){t.value='fill';return;}model.mode=t.value;model.targetIds=new Set(t.value==='create'?model.seeds.map(s=>s.id):model.context.lines.filter(l=>!l.components.length).map(l=>l.id));paint();}
  if(t.dataset.acuField==='asOf'){model.asOf=t.value;model.rows.forEach(r=>r.selected=false);model.notice='Cambiaste la fecha. Usá Actualizar precios y catálogo antes de aplicar.';model.priceDateDirty=true;paint();}
  if(t.dataset.acuField==='exampleIndex')model.exampleIndex=Number(t.value);
 });
 host.addEventListener('toggle',event=>{const t=event.target;if(!t.isConnected)return;if(t.dataset.acuProposal){const row=model.rows.find(r=>r.id===t.dataset.acuProposal);if(row)row.expanded=t.open;}if(t.dataset.acuMeasureDetail){const row=model.rows.find(r=>r.id===t.dataset.acuMeasureDetail);if(row)row.measurementExpanded=t.open;}if(t.dataset.acuDetail){if(t.open)model.details.add(t.dataset.acuDetail);else model.details.delete(t.dataset.acuDetail);}},true);
 host.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape')void action('close',event.target);});
 paint();return {open,syncScope,resumeFromLibrary,runApproved,cancelApproved,showLatest:()=>open()};
}
