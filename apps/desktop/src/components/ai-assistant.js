import {canSaveLibraryAcu,libraryAcuContext,readLibraryAcuIntent,readLibraryAcus,saveLibraryAcu} from "../services/ai-library-acu.js";
import {selectedAcuSnapshot,selectedAcuSnapshotMatches,readSelectedAcuEdit,canApplySelectedAcuEdit,applySelectedAcuEdit} from "../services/ai-selected-acu-edit.js";
import {libraryAcuConversationState,requestedAddedMaterials} from "../services/ai-library-conversation.js";
import {invokeReviewedAiAction} from '../services/ai-view-api-contracts.js';
import {conversationStore,conversationAcuRequest,structuredConversationContext} from '../services/ai-conversation-context.js';
import {createAcuWorkbench} from "./ai-acu-workbench.js";
import {executeBudgetTool,budgetPreparationRequest} from '../services/ai-budget-tools.js';
import {aiDomainContext,budgetReviewIntent} from '../services/ai-domain-context.js';
import {focusedAppSnapshot} from '../services/ai-workspace-reader.js';
import {prepareSectionEdits} from '../services/ai-budget-sections.js';
import {recentCreatedSectionSources} from '../services/ai-section-operations.js';
import {createApprovedPlanRunner} from "../services/ai-approved-plan.js";
import {createAiBudgetImport} from "./ai-budget-import.js";
import {e,dateToday} from "./helpers.js";
import {buildCatalogContext,parseCatalogQuery,constructionCatalogAdvice,constructionAdviceText} from "../services/ai-catalog-context.js";
import {appendRequest} from "../services/ai-acu-addition.js";
import {productivityEditRequest} from "../services/ai-acu-productivity.js";
import {parseAiReply,draftFromProposal,screenContext,createAiRequest,budgetScreenContext,acuChatRequest,resolvedPendingApproval,isApprovalReply,materialAdditionFollowup,materialAdditionConfirmation,selectedAcuRequest,affirmativeMissingMaterialRequest,contextualAcuLine,availableCatalogFollowup} from "../services/ai-assistant.js";
const defaults={openai:"gpt-4.1-mini",anthropic:"claude-haiku-4-5"};
export function createAiAssistant({invoke,state,document,window,openModal,editable,loadEstimate,loadEstimates,openEstimate,openResourceLibrary,reloadCatalog,refreshAnalysis,render}) {
  const host=document.createElement("div");host.id="ai-assistant";document.body.append(host);
  const model={open:false,settings:false,configured:false,provider:"openai",model:defaults.openai,messages:[],question:"",busy:false,error:"",context:"",includeContext:true,contextMode:"screen",contextOpen:false,consent:false,scope:"",generation:0,usage:null,notice:"",approvedRun:null,lastApprovedId:null,lastAction:null,pendingAction:null,catalogLoading:false,focusLineId:null,lastCatalogAdvice:null,recentCreatedLineIds:[],recentCreatedEstimateId:null};
  const budgetImport=createAiBudgetImport({invoke,state,document,window,editable,loadEstimate,loadEstimates,openEstimate,canUseAi:()=>model.configured&&model.consent&&!model.busy});
  const acuWorkbench=createAcuWorkbench({invoke,state,document,window,loadEstimate,loadEstimates,openEstimate,openResourceLibrary,canUseAi:()=>model.configured&&model.consent&&(!model.busy||model.approvedRun?.running)});
  const approvedPlans=createApprovedPlanRunner({invoke,state,loadEstimate,loadEstimates,openEstimate});
  let activeRequest=null,queryToken=0;
  // User-only working notes, scoped by active SQLite database + ACU ID.
  // Keeps technical decisions through the small UI history window; it never
  // grants approval or stores provider-generated content.
  const acuWorkingNotes=new Map();
  const acuWorkingKey=()=>JSON.stringify([state.database?.scope??null,state.selectedAnalysisId||null]);
  function rememberAcuTurn(question){
    if(state.view!=="analyses"||!state.selectedAnalysisId)return [];
    const key=acuWorkingKey(),items=acuWorkingNotes.get(key)||[];
    if(items.at(-1)!==question)items.push(String(question).slice(0,240));
    const recent=items.slice(-16);acuWorkingNotes.set(key,recent);
    return recent;
  }
  let pendingIntent=null;
  // The assistant is task-scoped, not a chat archive. Existing stored chats
  // are cleared and no new conversational transcript is persisted on disk.
  const store=()=>conversationStore(window.localStorage,state.projectId,state.estimateId,state.database?.scope);
  function finishTaskSession(summary,{approval=null,savedCode=null}={}){
    const answer=String(summary||"Operación completada.").slice(0,2500).trim()+
      "\n\n¿Necesitás hacer algo más?";
    const message={role:"assistant",answer,content:JSON.stringify({answer}),
      taskCompleted:true,...(approval?{approval}:{}),
      ...(savedCode?{libraryAcuSaved:savedCode}:{})};
    pendingIntent=null;
    acuWorkingNotes.clear();
    model.messages=[message];
    model.lastAction=null;
    model.pendingAction=null;
    model.focusLineId=null;
    model.lastCatalogAdvice=null;
    model.recentCreatedLineIds=[];
    model.recentCreatedEstimateId=null;
    model.question="";
    model.error="";
    // Do not trigger an additional AI request merely to ask if work remains.
    store().clear();
  }
  // Keep conversational referents across tabs of the same budget. The ACU
  // executor maintains its own stricter view/editability scope for writes.
  const scope=()=>[state.projectId,state.estimateId].join(":");
  function syncContext(){
    budgetImport.syncScope();
    acuWorkbench.syncScope();
    if(state.navigating)cancelApprovedRun();
    if(state.modal){cancelApprovedRun();model.open=false;}
    const next=scope();
    if(model.scope!==next&&model.approvedRun?.running&&model.approvedRun.phase==='saving'&&state.projectId===model.approvedRun.projectId&&state.estimateId===model.approvedRun.estimateId&&state.view==='workspace'){model.scope=next;model.approvedRun.scope=next;}
    if(model.scope!==next){
      if(model.scope) { const [projectId,estimateId]=model.scope.split(":"); conversationStore(window.localStorage,projectId,estimateId,state.database?.scope).clear(); }
      cancelApprovedRun();activeRequest?.cancel();activeRequest=null;queryToken++;if(!model.approvedRun)model.busy=false;model.catalogLoading=false;model.scope=next;model.generation++;model.messages=[];model.lastAction=null;model.pendingAction=null;model.focusLineId=null;model.lastCatalogAdvice=null;model.recentCreatedLineIds=[];model.recentCreatedEstimateId=null;model.context="";model.includeContext=true;model.contextMode="screen";model.question="";model.error="";model.usage=null;model.notice="";
      // Purge any legacy conversation saved by earlier CPObras versions.
      // A new screen starts a fresh task using the current selected data.
      store().clear();pendingIntent=null;
    }
    if(model.open&&model.contextMode==="screen"&&!state.navigating)model.context=captureContext();
    paint();
  }
  const captureContext=()=>budgetScreenContext(state,screenContext(document));
  const fold=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isAction=message=>!!(message?.acuRequest||message?.sectionPreview||message?.planRows||message?.changeProposals||message?.proposal?.kind==='line'||message?.actionError);
  function addReply(question,message){
    message.role='assistant';message.originalQuestion=question;
    const content={answer:message.answer};
    if(message.sectionPreview)content.section_plan=message.sectionPreview.display;
    if(message.acuRequest)content.acu_request={mode:message.acuRequest.mode,brief:message.acuRequest.brief,...(message.acuRequest.mode==='fill'?{line_ids:message.acuRequest.lineIds}:{}) ,...(message.acuRequest.reviewBudget?{review_budget:true}:{})};
    if(message.planRows)content.proposal_lines=message.planRows.map(row=>({description:row.description,unit:row.unit,quantity:row.quantity??null,unit_price:row.unit_price??null,section:row.section||''}));
    if(message.changeProposals)content.proposal_changes=message.changeProposals;
    if(message.proposal)content.proposal=message.proposal;
    message.content=JSON.stringify(content);
    if(new TextEncoder().encode(message.content).length>11000)message.content=JSON.stringify({answer:message.answer.slice(0,2000),proposed_lines:message.planRows?.length||0});
    model.messages.push({role:'user',content:question},message);model.messages=model.messages.slice(-10);
    if(isAction(message)){model.lastAction=message;model.pendingAction=!message.actionError&&!message.approval&&!message.changeProposals?message:null;}else if(!message.actionStatus)model.pendingAction=null;
    model.question='';return message;
  }
  function actionContext(){
    const message=model.lastAction;if(!message)return '\nESTADO DE CARGAS DE CPOBRAS: no hay una ejecución registrada en este chat.';
    const approval=message.approval,result=approval?.result;
    return '\nESTADO DE CARGAS REGISTRADO POR CPOBRAS (no es una afirmación del modelo):\n'+JSON.stringify({state:approval?.state||(message.actionError?'rejected':'pending'),committed:result?.committed===true,created:result?.created||0,saved:result?.saved||0,organized:result?.organized||0,pending:result?.pending||0,estimate_id:result?.estimateId||null,line_ids:result?.lineIds||[],warnings:result?.warnings||[],message:approval?.message||message.actionError||'La propuesta no se ejecutó. Espera aprobación.'});
  }
  function showActionState(question){
    const message=model.lastAction;
    if(!message)return false;
    const approval=message.approval;
    if(approval){
      addReply(question,{answer:approval.message||'No hay un guardado confirmado para este pedido.',actionStatus:true,approval});
    }else{
      model.notice=message.actionError?'No hay un guardado confirmado: '+message.actionError:message.changeProposals?'Los cambios todavía no se cargaron. Revisalos desde su propuesta antes de aplicarlos.':model.pendingAction===message?'La propuesta todavía no se cargó. Podés aprobarla desde su tarjeta o responder «apruebo directamente».':'La propuesta anterior no se cargó. La última respuesta no contiene un pedido listo para ejecutar. Si querés cargar la propuesta anterior, usá su botón «Sí, aprobar y cargar».';
      model.question='';
    }
    paint();return true;
  }
  const canPlan=()=>!!state.projectId&&!state.modal&&!state.pageDirty&&!state.remoteProject&&!state.projects.find(p=>p.id===state.projectId)?.read_only&&!state.estimates.find(e=>e.id===state.estimateId)?.issued;
  async function openAcuRequest(request){
    if(request.error)throw new Error(request.error);
    await acuWorkbench.open(request.brief,null,request.mode,request.lineIds,null,request.operation||null);
    model.notice=request.mode==='fill'?'Se abrió la preparación para completar los ACU de las partidas existentes. Generá, revisá y guardá las propuestas.':'Se abrió la preparación de partidas nuevas con ACU. Generá, revisá y guardá las propuestas.';
  }
  function acuMessageRequest(index){
    const message=model.messages[index],original=message?.originalQuestion||model.messages[index-1]?.content||'',brief=original,history=model.messages.slice(0,index+1);
    const originalTopic=original.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const asksComposition=/\b(?:acus?|rendimientos?|consumos?|composicion|dosificacion|metrado)\b|\binsumos?\b.*\bpartidas?\b|\bpartidas?\b.*\binsumos?\b/.test(originalTopic);
    const request=message?.acuRequest||acuChatRequest(brief,history)||(asksComposition?acuChatRequest('cargalos',history):null);
    const resolved=request||{mode:'create',brief,lineIds:[]},addition=resolved.mode==='fill'&&!resolved.lineIds?.length&&!resolved.reviewBudget?appendRequest(resolved.brief,state.lines,state.selectedLineId):null;
    return {request:addition?{...resolved,...addition}:resolved,isAcu:!!request,outline:request?.mode==='fill'?null:message?.planRows||(message?.proposal?.kind==='line'?[{description:message.proposal.description,unit:message.proposal.unit,quantity:message.proposal.quantity??null,unit_price:message.proposal.unit_price??null,section:''}]:null)};
  }
  async function reviewAcuMessage(index){
    const {request,outline}=acuMessageRequest(index);
    if(outline)await acuWorkbench.open(request.brief,outline,'create');
    else await openAcuRequest(request);
  }
  function cancelApprovedRun(){
    const run=model.approvedRun;if(!run?.running)return;
    if(run.kind==='plan')approvedPlans.cancel();else acuWorkbench.cancelApproved();
  }
  function approvalMarkup(message,index){
    const approval=message.approval;
    if(approval)return `<p class="ai-approval-status" role="status">${e(approval.message||'Preparando carga…')}</p>${approval.result?.pendingReasons?.length?`<ul class="ai-pending-reasons">${approval.result.pendingReasons.map(item=>`<li>${e(item.description)}: ${item.reasons.map(e).join(' · ')}</li>`).join('')}</ul>`:''}${approval.state!=='running'&&approval.result?.committed&&approval.result.estimateId?`<button type="button" data-ai="approved-result" data-index="${index}" ${model.busy?'disabled':''}>Ver en presupuesto</button>`:''}${approval.state!=='running'&&approval.result?.pending&&approval.kind==='acu'&&approval.id===model.lastApprovedId?`<button type="button" data-ai="approved-pending" data-index="${index}" ${model.busy?'disabled':''}>Ver pendientes</button>`:''}`;
    if(message.sectionPreview){
      const plan=message.sectionPreview;
      return `<div class="ai-ingredient-preview"><strong>Rubros que se modificarán</strong><ul>${plan.display.map(item=>`<li>${e(item)}</li>`).join('')}</ul>${plan.warnings.map(item=>`<p class="ai-warning">⚠ ${e(item)}</p>`).join('')}<button type="button" class="ai-approve" data-ai="approve-section" data-index="${index}" ${canPlan()&&model.configured&&model.consent&&!model.busy?'':'disabled'}>Aprobar cambios de rubros</button><button type="button" data-ai="discard-section" data-index="${index}">Descartar</button></div>`;
    }
    if(message.preview){
      const preview=message.preview;
      const rows=preview.rows||[];
      const list=rows.map(row=>`<div class="ai-ingredient-group"><b>${e(row.description)} · por ${e(row.unit)}</b><ul>${row.items.slice(0,12).map(item=>`<li>${e(item.description)}: <b>${e(item.quantity)} ${e(item.unit)}</b>${item.previous_quantity!=null?' (antes: '+e(item.previous_quantity)+')':''}${item.price!=null?' · precio de catálogo: '+e(item.price):' · sin precio'}</li>`).join('')}${row.items.length>12?`<li>+ ${row.items.length-12} insumos adicionales; abrí la revisión detallada.</li>`:''}</ul>${row.preserved?.length?`<details class="ai-preserved"><summary>Se conservan ${row.preserved.length} insumos existentes</summary><ul>${row.preserved.map(item=>`<li>${e(item.description)} · ${e(item.quantity)} ${e(item.unit)}</li>`).join('')}</ul></details>`:''}${row.warnings.map(w=>`<p class="ai-warning">⚠ ${e(w)}</p>`).join('')}</div>`).join('');
      const pending=(preview.pendingReasons||[]).map(row=>`<p class="ai-warning">Pendiente: ${e(row.description)} — ${e(row.reasons.join(' · '))}</p>`).join('');
      const organized=(preview.movedSections||[]).map(row=>`<li>${e(row.description)}: ${e(row.from)} → ${e(row.to)}${row.reason?' · '+e(row.reason):''}</li>`).join('');
      const sectionList=organized?`<div class="ai-ingredient-group"><strong>Partidas que cambiarán de rubro</strong><ul>${organized}</ul></div>`:'';
      const sectionPending=(preview.sectionPending||[]).map(item=>`<p class="ai-warning">Pendiente de clasificación: ${e(item)}</p>`).join('');
      const hasChanges=rows.length>0||(preview.movedSections||[]).length>0;
      return `<div class="ai-ingredient-preview"><strong>Cambios preparados para el presupuesto</strong>${list}${sectionList}${pending}${sectionPending}${hasChanges?`<button type="button" class="ai-approve" data-ai="approve-load" data-index="${index}" ${canPlan()&&model.configured&&model.consent&&!model.busy?'':'disabled'}>Sí, aprobar y cargar esta lista</button>`:'<p>Sin cambios válidos para aprobar.</p>'}<button type="button" data-ai="discard-preview" data-index="${index}">Descartar</button></div>`;
    }
    if(message.changeProposals)return '';
    const name=state.estimates.find(e=>e.id===state.estimateId)?.title||'un presupuesto nuevo de esta obra';
    const resolved=acuMessageRequest(index),isAcu=resolved.isAcu;
    const request=resolved.request,targets=request?.lineIds?.length?request.lineIds.map(id=>state.lines.find(line=>line.id===id)?.description||id):[];
    const planned=message.planRows||(message.proposal?.kind==='line'?[message.proposal]:[]);
    const planList=planned.length?`<div class="ai-ingredient-preview"><strong>Partidas que se crearán</strong><ul>${planned.slice(0,8).map(row=>`<li>${e(row.description)} · ${e(row.quantity??'cantidad pendiente')} ${e(row.unit)}</li>`).join('')}</ul>${planned.length>8?`<details><summary>Ver otras ${planned.length-8} partidas</summary><ul>${planned.slice(8).map(row=>`<li>${e(row.description)} · ${e(row.quantity??'cantidad pendiente')} ${e(row.unit)}</li>`).join('')}</ul></details>`:''}</div>`:'';
    const scopeHint=isAcu?(request?.mode==='create'?'Se crearán partidas nuevas con su ACU.':targets.length?'Partidas indicadas: '+targets.join(', ')+(request.operation==='append'?'. Se agregarán los insumos solicitados conservando la composición actual.':request.operation==='productivity'?'. Se ajustará solo el consumo del equipo indicado; los demás insumos se conservan. Si la unidad del catálogo no coincide con el uso por día, se guardará una advertencia.':'. Si ya tienen ACU, se reemplazará su composición.'):'Se completarán las partidas que todavía no tengan ACU.'):'';
    return `<p>${isAcu?'Primero se generará una lista real de insumos, cantidades y advertencias. Se guardará solamente después de aprobarla.':'Revisá las partidas antes de crearlas.'} Destino: ${e(name)}. ${e(scopeHint)}</p>${isAcu?'':planList}<button type="button" class="ai-approve" data-ai="approve-load" data-index="${index}" ${canPlan()&&model.configured&&model.consent&&!model.busy?'':'disabled'}>${isAcu?'Preparar listado de insumos':'Sí, aprobar y crear partidas'}</button>`;
  }
  async function approveSectionMessage(index){
    const message=model.messages[index],plan=message?.sectionPreview;
    if(!plan||message.approval||!canPlan()||model.busy||!model.configured||!model.consent)return;
    if(plan.projectId!==state.projectId||plan.estimateId!==state.estimateId){
      model.error='Cambió el presupuesto. Prepará nuevamente los cambios de rubros.';paint();return;
    }
    model.busy=true;model.error='';
    message.approval={kind:'sections',state:'running',message:'Guardando los rubros aprobados…'};
    paint();
    let persisted=false;
    try{
      const result=await invokeReviewedAiAction(invoke,'workspace','apply_reviewed_section_batch',{batch:plan.batch},{approved:true});
      persisted=true;
      delete message.sectionPreview;
      model.pendingAction=null;
      const summary=[
        result.created?result.created+' creados':'',
        result.renamed?result.renamed+' editados':'',
        result.deleted?result.deleted+' borrados':'',
        result.converted?result.converted+' partidas genéricas convertidas':''
      ].filter(Boolean).join(', ');
      const safety=plan.warnings.join(' · ');
      message.answer='Rubros actualizados: '+summary+'.'+(safety?' '+safety+'.':'');
      message.approval={kind:'sections',state:'done',message:message.answer,result:{...result,committed:true,estimateId:plan.estimateId}};
      model.lastAction=message;
      message.content=JSON.stringify({answer:message.answer});
      try{await loadEstimate();}catch(error){message.answer+=' Guardado confirmado; no se pudo refrescar la vista: '+String(error);message.approval.message=message.answer;}
    }catch(error){
      if(!persisted){
        message.answer='No se modificaron los rubros: '+String(error);
        message.approval={kind:'sections',state:'stopped',message:message.answer,result:{committed:false}};
      }
    }finally{model.busy=false;paint();}
  }

  async function approveMessage(index){
    const message=model.messages[index];
    if(!message||message.approval||message.changeProposals||!canPlan()||!model.configured||!model.consent||model.busy)return;
    const resolved=acuMessageRequest(index),planRows=message.planRows||(message.proposal?.kind==='line'?[{description:message.proposal.description,unit:message.proposal.unit,quantity:message.proposal.quantity??null,unit_price:message.proposal.unit_price??null,section:''}]:null),kind=planRows&&!resolved.isAcu?'plan':'acu';
    if(resolved.request.error){model.error=resolved.request.error;message.actionError=model.error;model.lastAction=message;paint();return;}
    if(kind==='acu'&&!message.acuRequest){message.acuRequest=resolved.request;delete message.planRows;if(message.proposal?.kind==='line')message.proposal=null;}
    if(kind==='acu'&&resolved.request.mode==='fill'&&resolved.request.lineIds?.length===1){
      pendingIntent={mode:'fill',lineIds:[...resolved.request.lineIds],brief:resolved.request.brief,...(resolved.request.operation?{operation:resolved.request.operation}:{})};
      model.focusLineId=pendingIntent.lineIds[0];
    }
    const run={id:globalThis.crypto.randomUUID(),kind,running:true,scope:scope(),projectId:state.projectId,estimateId:state.estimateId,phase:'preparing'};
    model.approvedRun=run;model.lastApprovedId=run.id;model.lastAction=message;model.pendingAction=null;model.busy=true;model.error='';
    message.answer=message.preview?'Guardando los insumos aprobados…':'Preparando la lista de insumos para revisar, sin guardar…';message.approval={id:run.id,kind,state:'running',message:message.answer};paint();
    const onProgress=event=>{if(model.approvedRun!==run||!run.running)return;run.phase=event.phase;if(event.estimateId)run.estimateId=event.estimateId;message.approval.message=event.message;paint();};
    try{
      const result=message.preview?await acuWorkbench.commitPrepared(message.preview.id,{onProgress}):
       kind==='plan'?await approvedPlans.run(planRows,{onProgress}):
       await acuWorkbench.runApproved({...resolved.request,outline:resolved.outline},{onProgress,previewOnly:true});
      if(result.previewReady){
       message.preview=result.preview;
       message.answer='Revisá los insumos y cantidades antes de aprobar. Todavía no se guardó nada.';
       message.content=JSON.stringify({answer:message.answer});
       message.approval=null;delete message.approval;
       model.pendingAction=message;model.notice=message.answer;
       return;
      }
      if(model.approvedRun!==run||run.scope!==scope())return;
      delete message.preview;
      if(result.committed){model.lastCatalogAdvice=null;pendingIntent=null;}
      else if(kind==='acu'&&pendingIntent){model.pendingAction=message;}
      if(result.committed&&kind==='plan'&&result.created>0&&Array.isArray(result.lineIds)){
        model.recentCreatedLineIds=[...result.lineIds];model.recentCreatedEstimateId=result.estimateId;
      }
       const saved=result.saved||0,created=result.created||0,organized=result.organized||0,pending=result.pending||0;
      const counts=[saved?`${saved} ACU ${saved===1?'cargado':'cargados'}`:'',created?`${created} ${created===1?'partida nueva creada':'partidas nuevas creadas'}`:'',organized?`${organized} ${organized===1?'partida organizada por rubro':'partidas organizadas por rubro'}`:''].filter(Boolean).join(' y ');
      const summary=result.committed?`Carga terminada: ${counts||'guardado confirmado'}${pending?`; ${pending} ${pending===1?'pendiente':'pendientes'}`:''}.`:`${result.cancelled?'Carga detenida. ':''}No hay un guardado confirmado para este pedido${pending?`; ${pending} ${pending===1?'pendiente':'pendientes'}`:''}.`;
      const notice=[summary,...(result.warnings||[]),...(result.sectionPending||[]).map(item=>'Pendiente: '+item),result.error,result.refreshError].filter(Boolean).join(' ');
      message.answer=notice;message.approval={...message.approval,state:'done',message:notice,result};
      message.content=JSON.stringify({answer:message.answer+'\nResultado registrado por CPOBRAS: '+notice});model.notice=notice;
    }catch(error){if(run.scope===scope()){message.answer='La carga se detuvo: '+String(error);message.approval={...message.approval,state:'stopped',message:message.answer};message.content=JSON.stringify({answer:message.answer});}}
    finally{run.running=false;if(model.approvedRun===run){model.approvedRun=null;model.busy=false;paint();}}
  }
  function allowed(p){return !state.remoteProject&&!state.modal&&(p.kind!=="line"||editable());}
  let launcherPosition = null, launcherDrag = null, suppressLauncherClick = false;
  function positionLauncher(button, x, y) {
    const left = Math.max(0, Math.min(x, window.innerWidth - button.offsetWidth));
    const top = Math.max(0, Math.min(y, window.innerHeight - button.offsetHeight));
    launcherPosition = {left, top};
    Object.assign(button.style, {left:`${left}px`, top:`${top}px`, right:"auto", bottom:"auto"});
  }
  function restoreLauncherPosition() {
    const button = host.querySelector(".ai-launch");
    if (button && !button.hidden && launcherPosition) {
      positionLauncher(button, launcherPosition.left, launcherPosition.top);
    }
  }
  window.addEventListener?.("resize", restoreLauncherPosition);
  host.addEventListener("pointerdown", event => {
    const button = event.target.closest(".ai-launch");
    if (!button || event.button !== 0 || !event.isPrimary) return;
    const rect = button.getBoundingClientRect();
    suppressLauncherClick = false;
    launcherDrag = {id:event.pointerId, button, x:event.clientX, y:event.clientY, left:rect.left, top:rect.top};
    button.setPointerCapture(event.pointerId);
  });
  host.addEventListener("pointermove", event => {
    const drag = launcherDrag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!suppressLauncherClick && Math.hypot(dx, dy) < 5) return;
    suppressLauncherClick = true;
    positionLauncher(drag.button, drag.left + dx, drag.top + dy);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    host.addEventListener(eventName, event => {
      if (launcherDrag?.id === event.pointerId) launcherDrag = null;
    });
  }
  function paint(){
    const providerName=model.provider==="openai"?"OpenAI":"Claude";
    host.innerHTML=`<button class="ai-launch btn" ${model.open?"hidden":""} data-ai="toggle" aria-expanded="${model.open}" aria-controls="ai-console" title="Asistente IA" aria-label="Asistente IA"><span class="ai-launch-dot" aria-hidden="true"></span><span>IA</span><span class="ai-launch-caret" aria-hidden="true">|</span></button>${model.open?`<section id="ai-console" class="ai-console ${model.settings||!model.configured||model.contextOpen?"ai-expanded":""}" aria-label="Consola de asistente IA"><header class="ai-bar"><strong>✦ CPOBRAS IA</strong><span>${e(providerName)} · ${e(model.model)}</span><button data-ai="settings" title="Configurar proveedor" ${model.busy?"disabled":""}>⚙ Configurar</button><button data-ai="clear" title="Limpiar conversación" ${model.busy?"disabled":""}>Limpiar</button><button data-ai="toggle" aria-label="Cerrar consola">×</button></header>
    ${model.settings||!model.configured?`<form id="ai-settings" class="ai-settings"><div class="ai-settings-fields"><label>Proveedor<select name="provider" ${model.busy?"disabled":""}><option value="openai" ${model.provider==="openai"?"selected":""}>OpenAI</option><option value="anthropic" ${model.provider==="anthropic"?"selected":""}>Claude · Anthropic</option></select></label><label>Modelo<input name="model" value="${e(model.model)}" required maxlength="120" ${model.busy?"disabled":""}></label><label>Clave de API<input name="key" type="password" autocomplete="off" placeholder="${model.configured?"Dejá vacío para conservar la clave guardada":"Pegá tu clave de API"}" ${model.configured?"":"required"} maxlength="512" ${model.busy?"disabled":""}></label></div><p>El proveedor, modelo y clave se guardan en el llavero de credenciales del sistema, fuera de los proyectos y sus respaldos. El proveedor cobra el uso de API por separado de las suscripciones de chat.</p><button class="btn" ${model.busy?"disabled":""}>Guardar configuración</button>${model.configured?'<button type="button" data-ai="forget" class="btn">Borrar clave guardada y chat</button>':""}</form>`:""}
    <div class="ai-transcript" role="log" aria-label="Conversación IA" aria-live="polite">${!model.messages.length?'<div class="ai-welcome">Puedo ayudarte con:<br> • Explicar los datos de esta pantalla<br> • Preparar partidas e insumos para revisar<br> • Identificar datos que faltan en una carga<br><br>Las respuestas pueden contener errores. Los precios se consultan en el catálogo local. Podés aprobar una carga desde el chat y ajustar después los rendimientos estimados.</div>':model.messages.map((m,index)=>`<article class="ai-message ai-${m.role}"><b>${m.role==="user"?"Vos":"Asistente"}</b><div>${e(m.answer||m.content)}</div>${libraryDraftMarkup(m,index)}${libraryEditMarkup(m,index)}${m.actionStatus?approvalMarkup(m,index):''}${m.sectionPreview||m.approval?.kind==='sections'?`<div class="ai-proposal">${approvalMarkup(m,index)}</div>`:''}${m.acuRequest?`<div class="ai-proposal"><strong>${m.acuRequest.mode==='fill'?'Completar ACU de partidas existentes':'Preparar partidas nuevas con ACU'}</strong>${approvalMarkup(m,index)}${!m.approval?`<button type="button" data-ai="review-acu-request" data-index="${index}" ${canPlan()&&!model.busy?'':'disabled'}>Revisar antes de cargar</button>`:''}</div>`:''}${m.planRows||m.changeProposals?`<div class="ai-proposal"><strong>${(m.planRows?.length||0)+(m.changeProposals?.length||0)} partidas / cambios propuestos</strong>${m.planRows&&!m.changeProposals?`<details class="ai-plan-preview"><summary>Ver partidas propuestas</summary><ul>${m.planRows.map(r=>`<li>${e(r.description)} · ${e(r.unit)} · Cantidad: ${e(r.quantity??'sin informar')} · Precio: ${e(r.unit_price??'sin informar')}${r.section?' · '+e(r.section):''}</li>`).join('')}</ul></details>${approvalMarkup(m,index)}`:'<p>Revisá los cambios antes de aplicarlos.</p>'}${!m.approval?`<button type="button" data-ai="review-plan" data-index="${index}" ${canPlan()&&!model.busy?"":"disabled"}>Revisar propuesta</button>`:''}${m.planRows&&!m.approval?`<button type="button" data-ai="review-acu-plan" data-index="${index}" ${canPlan()&&!model.busy?"":"disabled"}>Preparar ACU con insumos</button>`:""}</div>`:""}${m.proposal?`<div class="ai-proposal"><strong>Borrador de ${m.proposal.kind==="line"?"partida":"insumo"}</strong><p>${e(m.proposal.description)} · ${e(m.proposal.unit)}${m.proposal.quantity!=null?` · Cantidad ${e(m.proposal.quantity)}`:""}${m.proposal.unit_price!=null?` · Precio ${e(m.proposal.unit_price)}`:""}</p>${m.proposal.kind==='line'?approvalMarkup(m,index):''}${!m.approval?`<button class="btn" data-ai="draft" data-index="${index}" ${allowed(m.proposal)&&!m.approval?"":"disabled"}>Abrir formulario para revisar</button><small>Completá los campos faltantes y guardá desde el formulario habitual.${!allowed(m.proposal)?" Cerrá otros formularios; las partidas requieren un presupuesto editable.":""}</small>`:''}</div>`:""}</article>`).join("")}${model.busy&&!model.approvedRun?`<article class="ai-message ai-user"><b>Vos</b><div>${e(model.question)}</div></article><p role="status">${model.catalogLoading?'Consultando el catálogo local…':'Consultando al proveedor… Espera máxima: 60 segundos.'} <button type="button" data-ai="cancel">Cancelar consulta</button></p>`:""}${model.approvedRun?`<p role="status">Carga en curso. <button type="button" data-ai="stop-approved" ${model.approvedRun.phase==='saving'?'disabled':''}>${model.approvedRun.phase==='saving'?'Guardando…':'Detener carga'}</button></p>`:''}</div>
    <details class="ai-context" ${model.contextOpen?"open":""}><summary>Contexto de la pantalla ${model.includeContext?(model.contextMode==="screen"?"· automático":"· editado"):"· sin incluir"}</summary><p>Se enviarán la consulta, los mensajes necesarios de la tarea actual y los datos de la pantalla seleccionados. Tras confirmar un guardado, el contexto conversacional se reinicia y queda solo el resultado. Las conversaciones no se almacenan como historial local; la próxima solicitud vuelve a consultar el ACU o presupuesto seleccionado. Podés desactivar o editar el contexto antes de enviar.</p><button class="btn" data-ai="capture" ${model.busy?"disabled":""}>Capturar / actualizar vista</button><label><input type="checkbox" name="ai-include-context" ${model.includeContext?"checked":""} ${model.busy?"disabled":""}> Incluir vista y catálogo local</label><textarea name="ai-context-text" aria-label="Datos de pantalla para enviar" maxlength="7000" ${model.busy?"disabled":""}>${e(model.context)}</textarea></details>
    <div class="ai-quick"><button data-ai="acu-workbench" ${model.busy||!canPlan()?"disabled":""}>▦ ACU · rendimientos y metrado</button><button data-ai="manage-import" ${model.busy||!editable()||state.remoteProject?"disabled":""}>✎ Editar / eliminar partidas</button><button data-ai="budget-import" ${model.busy||!editable()||state.remoteProject?"disabled":""}>▤ Cargar precios · texto / Excel</button><button data-ai="plan-import" ${model.busy||!canPlan()?"disabled":""}>＋ Crear partidas con ACU</button><button data-ai="quick" data-question="Explicame los datos de esta pantalla y señalá qué información falta.">▤ Explicar pantalla</button><button data-ai="quick" data-question="Ayudame a preparar una partida. Preguntame primero qué trabajo, unidad, cantidad y precio quiero cargar.">▱ Partida</button><button data-ai="quick" data-question="Ayudame a cargar un insumo. Preguntame su descripción, tipo, unidad y precio si no los conocés.">▣ Insumo</button></div>
    <form id="ai-question"><label class="ai-consent"><input type="checkbox" name="ai-consent" ${model.consent?"checked":""} ${model.busy?"disabled":""}> Autorizo enviar la consulta, el contexto temporal de la tarea y los datos de pantalla incluidos a ${e(providerName)}. El uso puede generar cargos.</label><div class="ai-input-row"><label class="ai-sr-only" for="ai-prompt">Consulta al asistente</label><textarea id="ai-prompt" name="question" rows="1" placeholder="Preguntá sobre esta pantalla o pedí ayuda para cargar datos…" maxlength="2000" required ${model.busy?"disabled":""}>${e(model.question)}</textarea><button class="btn primary" ${model.busy||!model.configured||!model.consent?"disabled":""}>↵ Enviar</button></div></form>
    ${model.notice?`<small class="ai-usage" role="status">${e(model.notice)}</small>`:""}<p class="ai-error" role="alert">${e(model.error)}</p>${model.usage?`<small class="ai-usage">Última respuesta: ${model.usage.input??"—"} tokens de entrada · ${model.usage.output??"—"} de salida. Consultá los cargos en tu proveedor.</small>`:""}</section>`:""}`;
    restoreLauncherPosition();
    const log=host.querySelector(".ai-transcript");if(log)log.scrollTop=log.scrollHeight;
  }
  function catalogAnswer(catalog,query,messages=[]){
    const evidence=JSON.parse(buildCatalogContext({question:query,messages,resources:catalog.resources,currency:catalog.currency,asOf:catalog.as_of}));
    const rows=[...evidence.matches,...evidence.related],labels={material:'Material',labor:'Mano de obra',equipment:'Equipo',subcontract:'Subcontrato'};
    if(!rows.length)return 'Consulté el catálogo local y no encontré coincidencias para «'+query+'». Indicame un nombre o código más específico y lo busco desde acá.';
    return 'Consulté el catálogo local al '+catalog.as_of+':\n'+rows.slice(0,8).map(row=>row.description+' · '+(labels[row.kind]||row.kind)+' · '+row.unit+' · '+(row.price===null?'Sin precio cargado':row.price+' '+row.currency+' por '+row.unit)+(row.effective_date?' · Fecha del precio: '+row.effective_date:'')+(row.price_source==='presupuesto'?' · Precio fijado en el presupuesto':'')).join('\n')+(rows.length>8||evidence.truncated?'\nMostré las primeras coincidencias; puedo buscar un nombre o código más específico.':'');
  }
  function groundedContext(base,catalog,question,messages){
    const grounded=buildCatalogContext({question,messages,resources:catalog.resources,currency:catalog.currency,asOf:catalog.as_of});
    const encoder=new TextEncoder();let visible='',size=0;for(const char of base){const bytes=encoder.encode(char).length;if(size+bytes>5700)break;visible+=char;size+=bytes;}
    if(visible!==base)visible+='\n[Texto de pantalla recortado; el catálogo se consulta por separado.]';
    return visible+'\nCATÁLOGO LOCAL CONSULTADO AHORA POR CPOBRAS (datos reales de solo lectura):\n'+grounded;
  }
  const canDraftLibraryAcu = () => state.view === "analyses" && !state.projectId &&
    !state.remoteProject && !state.modal && !state.navigating && !state.pageDirty;
  // Only the most recent library transaction may be approved. In
  // particular, an older edit must not win over a newer CREATE proposal.
  const latestLibraryProposal=()=>model.messages.findLast(message=>
    message.libraryEdit || message.libraryAcus?.some(Boolean) || message.libraryAcuSaved);
  const pendingLibraryAcu=()=>{
    const message=latestLibraryProposal();
    return message?.libraryAcus?.some(Boolean)?message:null;
  };
  const pendingLibraryEdit=()=>{
    const edit=latestLibraryProposal()?.libraryEdit;
    return edit&&!edit.applied&&!edit.spent&&edit.baseline?.id===state.selectedAnalysisId &&
      edit.databaseScope===(state.database?.scope??null)?edit:null;
  };
  // Free-form user language is classified by the model. Only explicit approval
  // of a displayed proposal authorizes the separate, validated native write.

  function libraryDraftMarkup(message, index) {
    return (message.libraryAcus ?? []).map((draft, draftIndex) => draft ? `<div class="ai-proposal" data-library-acu-preview>
      <strong>ACU para la biblioteca</strong><p>${e(draft.description)} · por ${e(draft.unit)}</p>
      <ul>${draft.components.map(row => `<li>${e(row.description)}: ${e(row.quantity)} ${e(row.unit)}
        ${row.conversion ? ` (equivale a ${e(row.conversion)})` : ""}
        · ${row.unit_price === "" ? "sin precio" : "ARS " + e(row.unit_price) + " por " + e(row.unit)}</li>`).join("")}</ul>
      ${draft.aiWarnings.map(item => `<p class="ai-warning">Pendiente: ${e(item)}</p>`).join("")}
      ${canSaveLibraryAcu(draft) ? "<p>Podés pedir cambios o autorizar el guardado con tus propias palabras.</p>" : "<p>Hay datos por verificar. Podés corregirlos conversando o revisar el ACU antes de guardar.</p>"}
      <button type="button" data-ai="review-library-acu" data-index="${index}" data-draft="${draftIndex}" ${canDraftLibraryAcu() && !model.busy ? "" : "disabled"}>Revisar y guardar ACU</button>
    </div>` : "").join("");
  }

  function libraryEditMarkup(message,index){
    const edit=message.libraryEdit;
    if(!edit)return "";
    const target=edit.draft;
    const current=state.view==="analyses" && state.selectedAnalysisId===edit.baseline.id &&
      edit.databaseScope===(state.database?.scope??null);
    const valid=!edit.spent&&!edit.applied&&current&&canApplySelectedAcuEdit(edit);
    return `<div class="ai-proposal" data-selected-acu-edit>
      <strong>Editar ACU seleccionado: ${e(edit.baseline.code)}</strong>
      <p>${e(edit.baseline.description)} · ${e(edit.baseline.unit)} · ${e(edit.changes.length)} cambios</p>
      <ul>${edit.changes.map(item=>`<li>${e(item)}</li>`).join("")}</ul>
      ${edit.warnings.map(item=>`<p class="ai-warning">Pendiente: ${e(item)}</p>`).join("")}
      ${edit.applied?"<p>Edición guardada.</p>":edit.spent?"<p>Guardado pendiente de verificación; no se reintentará.</p>":!current?"<p>Seleccioná nuevamente este ACU para continuar; la propuesta no se aplicará a otro.</p>":!valid?"<p>La propuesta requiere resolver los pendientes antes de guardarla.</p>":"<p>Los demás componentes y precios se conservan.</p>"}
      <button type="button" data-ai="approve-selected-acu-edit" data-index="${index}" ${valid&&!model.busy?"":"disabled"}>Aprobar y actualizar ACU</button>
      <button type="button" data-ai="review-selected-acu-edit" data-index="${index}" ${current&&!edit.spent&&!model.busy?"":"disabled"}>Revisar en el editor</button>
    </div>`;
  }

  async function confirmSelectedAcuEdit(question,message){
    const proposal=message?.libraryEdit;
    if(!proposal||proposal.spent||proposal.applied)return;
    if(!canApplySelectedAcuEdit(proposal)){
      addReply(question,{answer:"Quedan conversiones o precios pendientes en esta edición. Podemos resolverlos en la conversación o en el editor."});
      paint();return;
    }
    if(!canDraftLibraryAcu()||state.selectedAnalysisId!==proposal.baseline.id||
       (state.database?.scope??null)!==proposal.databaseScope){
      addReply(question,{answer:"La selección o base activa cambió. Volvé a seleccionar el ACU y prepará la modificación nuevamente."});
      paint();return;
    }
    proposal.spent=true;model.busy=true;model.error="";paint();
    try{
      const saved=await applySelectedAcuEdit(invoke,proposal,{
        selectedAnalysisId:state.selectedAnalysisId,selectedDatabaseScope:state.database?.scope??null
      });
      proposal.applied=true;
      addReply(question,{answer:"Actualicé el ACU existente «"+saved.description+"» ("+saved.code+"). "+
        proposal.changes.length+(proposal.changes.length===1?" cambio guardado.":" cambios guardados.")+" Los ACU de presupuestos ya emitidos no se modificaron.",
        libraryAcuSaved:saved.code});
      try{await reloadCatalog();if(canDraftLibraryAcu())await refreshAnalysis();render();}
      catch(error){model.notice="El ACU se actualizó, pero no pude refrescar la lista: "+String(error);}
    }catch(error){
      model.error="No pude confirmar la actualización del ACU: "+String(error)+
        ". No se volverá a enviar automáticamente esta modificación.";
    }finally{model.busy=false;paint();}
  }

  async function confirmLibraryAcu(question, message) {
    const drafts = message.libraryAcus.filter(Boolean);
    if (drafts.length !== 1) {
      addReply(question, {answer:"Hay varias propuestas. Elegí el ACU que querés revisar y guardar."});
      paint();
      return;
    }
    const draft = drafts[0];
    if (!canSaveLibraryAcu(draft)) {
      // Acknowledging an incomplete draft can open the existing native editor,
      // but never writes without its fully validated form submission.
      openModal("analysis",draft,()=>{message.libraryAcus=[];});
      addReply(question, {answer:"Abrí el editor del ACU con los componentes verificados. Quedan insumos o precios por completar antes del guardado."});
      paint();
      return;
    }
    model.busy = true;
    model.error = "";
    model.notice = "Guardando el ACU aprobado…";
    paint();
    try {
      const saved = await saveLibraryAcu(invoke, draft);
      message.libraryAcus = [];
      addReply(question, {answer:`Guardé «${saved.description}» (${saved.code}) en la biblioteca de ACU.`, libraryAcuSaved:saved.code});
      state.selectedAnalysisId = saved.id;
      try {
        await reloadCatalog();
        if (canDraftLibraryAcu()) await refreshAnalysis();
        render();
      } catch (error) {
        model.notice = "El ACU se guardó. No se pudo actualizar la lista: " + String(error);
      }
    } catch (error) {
      model.error = "No se pudo guardar el ACU: " + String(error);
    } finally {
      model.busy = false;
      if (model.notice === "Guardando el ACU aprobado…") model.notice = "";
      paint();
    }
  }
  async function prepareSelectedAcuEdit(question,prior=null,interaction="edit") {
    const selectedId=state.selectedAnalysisId;
    if(!selectedId||!canDraftLibraryAcu()){
      addReply(question,{answer:"Seleccioná un ACU de la biblioteca para poder modificar su composición."});
      paint();return;
    }
    if(!model.includeContext){
      model.error="Para editar el ACU desde IA, activá el contexto de pantalla y catálogo.";
      paint();return;
    }
    const databaseScope=state.database?.scope??null;
    const token=++queryToken,generation=model.generation;
    const current=()=>token===queryToken && generation===model.generation &&
      canDraftLibraryAcu()&&state.selectedAnalysisId===selectedId&&
      (state.database?.scope??null)===databaseScope;
    const remembered=acuWorkingNotes.get(acuWorkingKey())||[];
    const recentUserTurns=remembered.length?remembered.slice(-12):
      model.messages.filter(message=>message.role==="user").slice(-6)
        .map(message=>String(message.content||"").slice(0,450));
    const requestedMaterialPhrases=requestedAddedMaterials([...recentUserTurns,question]);
    const brief=question;
    const send=async(messages,context)=>{
      activeRequest=createAiRequest(invoke,{mode:"library_acu_edit",messages,context});
      model.catalogLoading=false;paint();
      return activeRequest.promise;
    };
    model.busy=true;model.catalogLoading=true;model.error="";model.notice="";paint();
    try{
      const [detail,catalog]=await Promise.all([
        invoke("get_analysis_details",{analysisId:selectedId}),
        invoke("ai_catalog_context",{projectId:null,estimateId:null,currency:"ARS",asOf:dateToday()})
      ]);
      if(!current())return;
      const fresh=selectedAcuSnapshot(selectedId,detail);
      const pending=prior?.libraryEdit?.baseline?.id===selectedId ? prior.libraryEdit : null;
      if(pending && !selectedAcuSnapshotMatches(pending.baseline,fresh))
        throw new Error("El ACU fue editado desde otra vista. Tenés que preparar una propuesta actualizada.");
      const evidence=libraryAcuContext(brief+" "+requestedMaterialPhrases.flat().join(" ")+" "+fresh.description,catalog);
      let resources=evidence.resources;
      const selectedResourceIds=new Set(fresh.components.map(row=>row.resource_id));
      resources=[...new Map([...resources,
        ...catalog.resources.filter(row=>selectedResourceIds.has(row.id))].map(row=>[row.id,row])).values()];
      const baseline=pending?.baseline||fresh;
      const contextFor=items=>JSON.stringify({
        task:"library_acu_edit",interaction,requested_change:brief,
        conversation:libraryAcuConversationState({
          messages:model.messages,history:recentUserTurns,selectedAnalysis:baseline,
          pendingEdit:pending,currentQuestion:question,
        }),
        requested_material_names:requestedMaterialPhrases,
        currency:catalog.currency,as_of:catalog.as_of,resources:items.slice(0,80),
        selected_analysis:baseline,
        pending_edit:pending?{description:pending.draft.description,unit:pending.draft.unit,
          components:pending.draft.components,
          changes:pending.changes}:null,
        policy:"Proponer SOLO operaciones para los componentes nombrados. Ninguna modificación se guarda sin aprobación."
      });
      const messages=[...recentUserTurns.map(content=>({role:"user",content})),
        {role:"user",content:brief.slice(0,3000)}].slice(-7);
      let response=await send(messages,contextFor(resources));
      if(!current())return;
      // Incomplete provider JSON is repaired by the typed-edit retry below.
      // Catalog-query parsing must not abort that recovery early.
      let query=null;
      try{query=parseCatalogQuery(response.text);}
      catch{query=null;}
      if(query){
        const addition=libraryAcuContext(query,catalog);
        resources=[...new Map([...resources,...addition.resources].map(row=>[row.id,row])).values()];
        response=await send([...messages,
          {role:"assistant",content:"Consulté los recursos solicitados para editar el ACU."},
          {role:"user",content:"Con las coincidencias del catálogo, devolvé analysis_edit con operaciones puntuales y cantidades verificables. Conservá todos los componentes no mencionados."}
        ],contextFor(resources));
        if(!current())return;
      }
      let parsed;
      try{
        parsed=readSelectedAcuEdit(response.text,{baseline,resources:catalog.resources,previous:pending,requestedMaterialPhrases});
      }catch(firstError){
        const repaired=await send([...messages,
          {role:"assistant",content:"No se pudo verificar la edición: "+String(firstError).slice(0,240)},
          {role:"user",content:"Devolvé JSON con answer y analysis_edit:{changes:[{operation:'set'|'add'|'remove',resource_id,quantity,quantity_unit,catalog_quantity,conversion_basis,unit_price}],description,unit}. Cambiá solamente lo que pidió el usuario; no inventes IDs ni precios y preservá insumos no mencionados. Si falta un dato necesario, devolvé needs_details:true con una pregunta concreta."}
        ],contextFor(resources));
        if(!current())return;
        response=repaired;
        parsed=readSelectedAcuEdit(response.text,{baseline,resources:catalog.resources,previous:pending,requestedMaterialPhrases});
      }
      if(!parsed.proposal){
        addReply(question,{answer:parsed.answer,libraryAcuClarification:true,
          libraryAcuBrief:brief.slice(0,3000)});
      }else{
        parsed.proposal.databaseScope=databaseScope;
        if(prior?.libraryEdit)prior.libraryEdit=null;
        addReply(question,{answer:"Preparé los cambios sobre el ACU seleccionado, sin guardar. "+parsed.answer,
          libraryEdit:parsed.proposal,libraryAcuBrief:brief.slice(0,3000)});
      }
      model.usage={input:response.input_tokens,output:response.output_tokens};
    }catch(error){
      if(current())addReply(question,{answer:"No se modificó el ACU seleccionado. "+
        String(error?.message||error).slice(0,220)+
        ". Podés seguir describiendo el ajuste; la composición guardada sigue intacta.",
        libraryAcuClarification:true,libraryAcuBrief:brief.slice(0,3000)});
    }finally{
      if(token===queryToken){
        activeRequest=null;model.busy=false;model.catalogLoading=false;paint();
      }
    }
  }

  async function prepareLibraryAcu(question, prior, requestedWork = question, action = "new") {
    if (!model.includeContext) {
      model.error = "Incluí el contexto de la pantalla para que el asistente pueda consultar los insumos de la biblioteca.";
      paint();
      return;
    }
    const originalWork = prior?.libraryAcuBrief || requestedWork;
    const brief = originalWork === requestedWork ? originalWork :
      `${originalWork}\nAclaración del usuario: ${requestedWork}`;
    const token = ++queryToken;
    const generation = model.generation;
    const current = () => token === queryToken && generation === model.generation && canDraftLibraryAcu();
    const sendRequest = async (messages, context) => {
      activeRequest = createAiRequest(invoke, {messages, context, mode:"library_acu"});
      model.catalogLoading = false;
      paint();
      return activeRequest.promise;
    };
    model.busy = true;
    model.error = "";
    model.notice = "";
    model.catalogLoading = true;
    paint();
    try {
      const catalog = await invoke("ai_catalog_context", {
        projectId:null, estimateId:null, currency:"ARS", asOf:dateToday(),
      });
      if (!current()) return;
      const existing = prior?.libraryAcus?.filter(Boolean) ?? [];
      const search = [brief, ...existing.map(draft => draft.description)].filter(Boolean).join(" ");
      let evidence = libraryAcuContext(search, catalog);
      const messages = prior ? model.messages.slice(-8).map(message => ({
        role:message.role, content:message.content.slice(0, 2000),
      })) : [];
      const currentDrafts = existing.map(draft => ({
        description:draft.description, unit:draft.unit, missing:draft.aiWarnings,
        components:draft.components.map(row => ({
          resource_id:row.resource_id, description:row.description, quantity:row.quantity, quantity_unit:row.unit,
          conversion:row.conversion||null,
        })),
      }));
      const contextWithDraft = context => JSON.stringify({
        ...JSON.parse(context), requested_work:brief, action, current_library_acus:currentDrafts,
      });
      messages.push({role:"user", content:brief.slice(0, 4000)});
      let result = await sendRequest(messages, contextWithDraft(evidence.context));
      if (!current()) return;
      let resources = evidence.resources;
      const additional = parseCatalogQuery(result.text);
      if (additional) {
        evidence = libraryAcuContext(additional, catalog);
        // Preserve already discovered records while adding precisely the new
        // candidates requested by the model. The model gets the actual combined
        // catalog, not an assumed material recipe.
        resources = [...new Map([...resources,...evidence.resources].map(row=>[row.id,row])).values()];
        const mergedContext=JSON.stringify({...JSON.parse(evidence.context),resources:resources.slice(0,80)});
        result = await sendRequest([...messages, {
          role:"assistant", content:"Consulté el catálogo por los insumos que identificaste: " + additional,
        }, {
          role:"user",
          content:"Conservá los insumos del contexto completo y prepará la composición con cantidades y unidades de compra razonadas; indicá los pendientes reales sin inventar datos.",
        }], contextWithDraft(mergedContext));
        if (!current()) return;
      }
      const retainedIds = new Set(existing.flatMap(draft => draft.components.map(row => row.resource_id)));
      resources.push(...catalog.resources.filter(row => retainedIds.has(row.id)));
      const read = response => {
        const parsed = readLibraryAcus(response.text, resources);
        if (parsed.keepDraft !== (action === "question" && existing.length > 0)) {
          throw new Error("La respuesta no corresponde a la acción solicitada.");
        }
        if (!parsed.drafts.length && !parsed.keepDraft && parsed.missingField === "work") {
          throw new Error("El pedido ya indica el trabajo que se debe analizar.");
        }
        return parsed;
      };
      let parsed;
      try {
        parsed = read(result);
      } catch (firstError) {
        // Internal one-shot repair: preserve the exact user's work, and ask the
        // model for a valid proposal without forcing any "magic" retry phrase.
        result = await sendRequest([...messages, {
          role:"assistant", content:"La respuesta no produjo un ACU validable: " + String(firstError?.message || firstError).slice(0, 260),
        }, {
          role:"user",
          content:action === "question"
            ? "Explicá el ACU actualmente propuesto y devolvé JSON {answer,keep_draft:true} sin cambiar los componentes."
            : "El trabajo YA está indicado en requested_work. Generá ahora library_acus con description,unit y components usando ÚNICAMENTE IDs del catálogo. Se admite components:[] y missing:[descripciones concretas] si los insumos aún no están disponibles. No inventes IDs, precios ni conversiones. Cantidades decimales positivas. Si falta una decisión técnica imprescindible, preguntá solo eso, pero no vuelvas a pedir el nombre del trabajo.",
        }], contextWithDraft(evidence.context));
        if (!current()) return;
        parsed = read(result);
      }
      // If the model omitted or miscalculated a catalog-unit conversion, ask
      // the same model to reason over the verified presentation once more.
      // This is not a product-specific conversion performed by the UI.
      if (action !== "question" && parsed.drafts.some(draft=>draft.conversionPending)) {
        try {
          const correction=await sendRequest([...messages,
            {role:"assistant",content:result.text.slice(0,3500)},
            {role:"user",content:"Revisá la conversión de las cantidades a la unidad de COMPRA de cada insumo. Leé la descripción real del catálogo: calculá catalog_quantity; si es bolsa, bolsón u otra presentación con capacidad declarada, adjuntá conversion_basis con per_unit_quantity y per_unit_unit tal como aparece en ese insumo. Justificá las cuentas. Nunca supongas presentaciones ni densidades. Conservá los insumos admitidos, las exclusiones pedidas y la composición previa. Entregá la propuesta completa en library_acus."}
          ],contextWithDraft(evidence.context));
          if(!current())return;
          const corrected=read(correction);
          const pendingCount=value=>value.drafts.reduce((n,d)=>n+d.aiWarnings.length,0);
          if(corrected.drafts.length && pendingCount(corrected)<pendingCount(parsed)){
            parsed=corrected;result=correction;
          }
        }catch{
          // Keep the original explicit pending warnings if the correction fails.
        }
      }
      const {answer, drafts} = parsed;
      if (existing.length === 1 && drafts.length === 1 && action === "add") {
        const previous = new Map(existing[0].components.map(row => [row.resource_id, row]));
        const added = drafts[0].components.filter(row => !previous.has(row.resource_id));
        drafts[0].components = [...previous.values(), ...added];
      }
      if (action === "question" && existing.length) {
        addReply(question, {answer});
      } else {
        if (prior) {
          prior.libraryAcus = [];
          prior.libraryAcuClarification = false;
        }
        if (!prior) {
          for (const message of model.messages) {
            if (message.libraryAcus) message.libraryAcus = [];
            message.libraryAcuClarification = false;
          }
        }
        addReply(question, {
          answer:drafts.length ? "Preparé la composición para revisar. " + answer : answer,
          libraryAcus:drafts,
          libraryAcuClarification:drafts.length === 0,
          libraryAcuBrief:brief.slice(0, 3000),
        });
      }
      model.usage = {input:result.input_tokens, output:result.output_tokens};
    } catch (error) {
      if (current()) {
        // Explain failures instead of hiding them behind a generic scripted
        // answer. Follow-ups may naturally refine the original work.
        const reason = String(error?.message || error).slice(0, 220);
        addReply(question, {
          answer:"No pude preparar todavía un ACU válido para «" + originalWork.slice(0, 120) +
            "». No se guardó nada. Motivo: " + reason +
            ". Conservo el trabajo que pediste; podés seguir aclarando o cambiando lo que necesites.",
          libraryAcuRetry:brief.slice(0, 3000),
          libraryAcuBrief:brief.slice(0, 3000),
        });
      }
    } finally {
      if (token === queryToken) {
        activeRequest = null;
        model.busy = false;
        model.catalogLoading = false;
        paint();
      }
    }
  }
  async function handleLibraryTurn(question) {
    rememberAcuTurn(question);
    const proposal = pendingLibraryAcu();
    const editProposal = pendingLibraryEdit();
    const last = model.messages.at(-1);
    const followup = proposal || (last?.libraryAcuClarification || last?.libraryAcuRetry ? last : null);
    const token = ++queryToken;
    const generation = model.generation;
    model.busy = true;
    model.error = "";
    model.notice = "";
    paint();
    let intent;
    try {
      // Read the actual selected ACU before classifying this utterance.
      // Preserve conversational referents but NEVER treat prior messages or
      // catalog strings as approval for a new database write.
      let selected=null;
      if(state.selectedAnalysisId){
        const detail=await invoke("get_analysis_details",{analysisId:state.selectedAnalysisId});
        selected={id:state.selectedAnalysisId,code:detail?.code,
          description:detail?.description,unit:detail?.unit,
          components:detail?.components||[]};
      }
      if (token !== queryToken || generation !== model.generation || !canDraftLibraryAcu()) return true;
      const conversation=libraryAcuConversationState({
        messages:model.messages,history:acuWorkingNotes.get(acuWorkingKey())||[],
        selectedAnalysis:selected,pendingEdit:editProposal,currentQuestion:question,
      });
      activeRequest = createAiRequest(invoke, {
        messages:[{role:"user", content:question}],
        context:JSON.stringify({
          pending_proposal:Boolean(proposal||editProposal),
          pending_edit:Boolean(editProposal),
          selected_analysis:Boolean(selected),
          selected_analysis_context:conversation.selected_analysis,
          recent_user_turns:conversation.recent_user_turns,
          earlier_user_decisions:conversation.earlier_user_decisions,
          current_question:conversation.current_question,
          pending_request:Boolean(followup),
          known_work:Boolean(followup?.libraryAcuBrief),
          last_saved:Boolean(last?.libraryAcuSaved),
          grounding:conversation.grounding,
        }),
        mode:"library_acu_intent",
      });
      const response = await activeRequest.promise;
      if (token !== queryToken || generation !== model.generation || !canDraftLibraryAcu()) return true;
      intent = readLibraryAcuIntent(response.text);
    } catch (error) {
      if (token === queryToken) model.error = "No pude interpretar el pedido de ACU: " + String(error);
      return true;
    } finally {
      if (token === queryToken) {
        activeRequest = null;
        model.busy = false;
        paint();
      }
    }
    switch (intent.action) {
      case "general":
        return false;
      case "question":
        if(state.selectedAnalysisId){
          await prepareSelectedAcuEdit(question,editProposal?
            model.messages.findLast(message=>message.libraryEdit===editProposal):null,"question");
        }else if(followup){
          await prepareLibraryAcu(question,followup,question,"question");
        }else{
          return false;
        }
        break;
      case "show":
        if(editProposal){
          model.question="";
          model.notice="Los cambios propuestos están detallados en la tarjeta del ACU seleccionado.";
          paint();
          host.querySelector("[data-selected-acu-edit]")?.scrollIntoView({block:"nearest"});
        }else if (proposal) {
          model.question = "";
          model.notice = "La propuesta y sus insumos están disponibles en la conversación.";
          paint();
          host.querySelector("[data-library-acu-preview]")?.scrollIntoView({block:"nearest"});
        } else if (last?.libraryAcuRetry) {
          await prepareLibraryAcu(question, last, question, "clarify");
        } else {
          addReply(question, last?.libraryAcuSaved
            ? {answer:`El ACU ${last.libraryAcuSaved} está en Inicio → ACU.`, libraryAcuSaved:last.libraryAcuSaved}
            : {answer:"Todavía no hay una propuesta para mostrar. Decime qué trabajo querés analizar.", libraryAcuClarification:true});
          paint();
        }
        break;
      case "review":
        if(editProposal){
          openModal("analysis",{...editProposal.draft,
            components:editProposal.draft.components},()=>{editProposal.spent=true;});
          addReply(question,{answer:"Abrí la edición del ACU seleccionado, conservando su identificación y componentes."});
          paint();
        } else if (proposal && proposal.libraryAcus.filter(Boolean).length===1) {
          const drafts=proposal.libraryAcus,draft=drafts.find(Boolean);
          openModal("analysis",draft,()=>{proposal.libraryAcus=[];});
          addReply(question,{answer:"Abrí el editor con la composición actual para que puedas ajustar cantidades, insumos y precios antes de guardarla."});
          paint();
        } else if (followup?.libraryAcuRetry) {
          await prepareLibraryAcu(question,followup,question,"clarify");
        } else {
          addReply(question,{answer:"Todavía no hay un único ACU para revisar. Describime el trabajo que querés preparar."});
          paint();
        }
        break;
      case "approve":
        if(editProposal)await confirmSelectedAcuEdit(question,
          model.messages.findLast(message=>message.libraryEdit===editProposal));
        else if (proposal) await confirmLibraryAcu(question, proposal);
        else {
          addReply(question, {answer:"Primero necesitás una composición visible para poder aprobarla. Decime qué trabajo querés analizar.", libraryAcuClarification:true,
            libraryAcuBrief:followup?.libraryAcuBrief, libraryAcuRetry:followup?.libraryAcuRetry});
          paint();
        }
        break;
      case "discard":
        if(editProposal)editProposal.spent=true;
        if (followup) {
          followup.libraryAcus = [];
          followup.libraryAcuClarification = false;
          followup.libraryAcuRetry = null;
        }
        addReply(question, {answer:followup||editProposal ? "Descarté la propuesta pendiente sin cambiar el ACU." : "No hay un pedido pendiente para descartar."});
        paint();
        break;
      case "edit":
        if(state.selectedAnalysisId)await prepareSelectedAcuEdit(question,editProposal?
          model.messages.findLast(message=>message.libraryEdit===editProposal):null);
        else{
          addReply(question,{answer:"Seleccioná primero el ACU existente que querés modificar."});
          paint();
        }
        break;
      case "new":
        for (const message of model.messages) {
          if (message.libraryAcus) message.libraryAcus = [];
          message.libraryAcuClarification = false;
          message.libraryAcuRetry = null;
        }
        if (intent.work) await prepareLibraryAcu(question, null, intent.work);
        else if (followup?.libraryAcuBrief) await prepareLibraryAcu(question, followup, question, "clarify");
        else {
          addReply(question, {answer:"¿Para qué trabajo querés crear el ACU de biblioteca?", libraryAcuClarification:true});
          paint();
        }
        break;
      default:
        if(editProposal&&["add","revise","clarify"].includes(intent.action)){
          await prepareSelectedAcuEdit(question,model.messages.findLast(message=>message.libraryEdit===editProposal));
        }else if(state.selectedAnalysisId&&["add","revise"].includes(intent.action)){
          await prepareSelectedAcuEdit(question);
        }else if(state.selectedAnalysisId&&intent.action==="clarify"){
          await prepareSelectedAcuEdit(question,last);
        }else if (followup) await prepareLibraryAcu(question, followup, question, intent.action);
        else {
          addReply(question, {answer:"Decime qué trabajo querés analizar para preparar un ACU de biblioteca.", libraryAcuClarification:true});
          paint();
        }
    }
    return true;
  }

  async function send(){
    if(model.busy||!model.configured||!model.consent||!model.question.trim())return;
    const question=model.question.trim(),generation=model.generation;
    if (canDraftLibraryAcu() && await handleLibraryTurn(question)) return;
    const statusQuestion=/^(?:no (?:la|lo|las|los) (?:veo|encuentro)|no (?:veo|encuentro) (?:la partida|el acu|el pedido)|no (?:me )?aparece(?: la partida| el acu| el pedido)?|(?:y )?(?:se guardo|se cargo|se creo|la creaste|lo cargaste|donde quedo|donde esta)(?: la partida| el acu| el pedido)?)(?: en (?:la lista|la tabla|el presupuesto))?$/.test(fold(question));
    if(statusQuestion){if(!showActionState(question)){addReply(question,{answer:'No hay un guardado registrado en este chat. Indicame qué partida buscás para identificarla; no se realizará otra carga al consultar su estado.'});paint();}return;}
    const continuation=conversationAcuRequest(question,state,pendingIntent);
    if(continuation?.error){model.error=continuation.error;paint();return;}
    const ready=model.messages.at(-1)?.preview;
    if(continuation&&!(ready&&isApprovalReply(question))){
      acuWorkbench.cancelPrepared();
      for(const message of model.messages.filter(m=>m.preview)){
        delete message.preview;message.actionError='Propuesta reemplazada por una nueva preparación.';
      }
      addReply(question,{answer:'Preparando la partida '+(state.lines.find(l=>l.id===continuation.lineIds[0])?.description||continuation.lineIds[0])+' con los criterios indicados. Revisá la propuesta antes de guardar.',acuRequest:continuation});
      await approveMessage(model.messages.length-1);return;
    }
    const pendingSection=model.messages.findLast(m=>m?.sectionPreview&&!m?.approval);
    if(pendingSection&&isApprovalReply(question)){
      model.question='';
      await approveSectionMessage(model.messages.indexOf(pendingSection));
      return;
    }
    const pendingApproval=resolvedPendingApproval(question,model.messages);
    if(pendingApproval!==null){model.question='';if(canPlan())await approveMessage(pendingApproval);else{model.error='Abrí un presupuesto propio en elaboración y cerrá los formularios pendientes para cargar este pedido.';paint();}return;}
    const last=model.messages.at(-1);
    const priorPreview=model.messages.findLast(m=>m?.preview);
    const priorSection=model.messages.findLast(m=>m?.sectionPreview);
    if(priorSection&&!isApprovalReply(question)){
      delete priorSection.sectionPreview;
      priorSection.actionError='Propuesta de rubros sustituida por una solicitud nueva.';
      priorSection.answer='Propuesta de rubros descartada. No se modificó el presupuesto.';
      model.pendingAction=null;
    }
    if(priorPreview&&!isApprovalReply(question)){
      acuWorkbench.cancelPrepared();delete priorPreview.preview;priorPreview.actionError='Listado descartado por una nueva solicitud.';
      priorPreview.answer='Listado anterior descartado: no se guardó nada.';model.pendingAction=null;
    }
    if(last?.role==='assistant'&&last.approval&&isApprovalReply(question)){model.question='';model.notice=last.approval.message||'Este pedido ya fue procesado.';paint();return;}
    if(last?.actionError&&isApprovalReply(question)){model.question='';model.error='No hay un pedido ejecutable ni un guardado confirmado: '+last.actionError;paint();return;}
    if(model.pendingAction&&isApprovalReply(question)&&resolvedPendingApproval(question,[{role:'user',content:model.pendingAction.originalQuestion||''},model.pendingAction])!==null){
      if(!canPlan()){model.question='';model.error='Abrí un presupuesto propio en elaboración para cargar el pedido pendiente.';paint();return;}
      let index=model.messages.indexOf(model.pendingAction);
      if(index<0){model.messages.push({role:'user',content:model.pendingAction.originalQuestion},model.pendingAction);model.messages=model.messages.slice(-10);index=model.messages.length-1;}
      model.question='';await approveMessage(index);return;
    }
    if(canPlan()&&budgetReviewIntent(question)){
      if(!state.estimateId)throw new Error('Abrí el presupuesto que querés revisar antes de solicitar la organización y los ACU.');
      const lines=state.lines||[];
      if(!lines.length){addReply(question,{answer:'Este presupuesto no contiene partidas. No hay ACU para completar ni partidas para reorganizar; no se modificó nada.'});paint();return;}
      const missing=lines.filter(line=>!line.analysis_id&&!(line.components||[]).length).map(line=>line.id).slice(0,60);
      const review={mode:'fill',brief:question.slice(0,3000),lineIds:missing,reviewBudget:true};
      addReply(question,{answer:`Revisión de ${lines.length} partidas y ${(state.sections||[]).length} rubros. Prepararé cambios de rubros y ACU con precios reales; lo que falte quedará pendiente. Todavía no se guardó nada.`,acuRequest:review});
      await approveMessage(model.messages.length-1);return;
    }
    const selectedLine=contextualAcuLine(question,{selectedLineId:state.selectedLineId,focusLineId:model.focusLineId,lines:state.lines});
    const additionContext={selectedLineId:selectedLine?.id||null,lines:state.lines,lastAction:model.lastAction};
    const askMissing=/\b(?:que|cuales|cual)\b.{0,40}\b(?:falta|faltan|necesito|agregar)\b|\b(?:otros insumos|materiales faltantes|insumos faltantes)\b/.test(fold(question));
    if(askMissing&&selectedLine&&model.includeContext){
      model.busy=true;model.catalogLoading=true;paint();
      try{
       const catalog=await invoke('ai_catalog_context',{projectId:state.projectId||null,estimateId:state.estimateId||null,asOf:dateToday(),currency:null});
       const advice=constructionCatalogAdvice(selectedLine,catalog.resources||[]);
       if(advice){
        model.focusLineId=selectedLine.id;model.lastCatalogAdvice=advice;
        addReply(question,{answer:constructionAdviceText(advice)});
        model.notice='Biblioteca consultada. No se modificó el presupuesto.';
        return;
       }
      }catch(error){model.notice='No se pudo completar la comparación local; continúo con la consulta general: '+String(error);}
      finally{model.busy=false;model.catalogLoading=false;paint();}
    }
    const productivity=productivityEditRequest(question,selectedLine);
    const selectedRequest=productivity?null:selectedAcuRequest(question,selectedLine,model.messages);
    const advised=productivity||selectedRequest?null:availableCatalogFollowup(question,model.lastCatalogAdvice?.line_id===selectedLine?.id?model.lastCatalogAdvice:null);
    const conversationalAdd=productivity||selectedRequest||advised?null:affirmativeMissingMaterialRequest(question,model.messages,selectedLine);
    const addition=productivity||selectedRequest||conversationalAdd||advised?null:materialAdditionFollowup(question,model.messages,additionContext);
    const recovered=addition?null:materialAdditionConfirmation(question,model.messages,additionContext);
    const acuRequest=productivity||selectedRequest||advised||conversationalAdd||addition||recovered||acuChatRequest(question,model.messages);
    if(canPlan()&&acuRequest){
      const answer=productivity?'Rendimiento identificado. Voy a ajustar solo el equipo seleccionado; cualquier diferencia de unidad se informará. Falta aprobar.':'Pedido listo para revisar o aprobar. No se guardó nada todavía.';
      addReply(question,{answer,acuRequest});model.notice='Buscando insumos en la biblioteca; aún no se guardó ningún cambio.';
      if(acuRequest.mode==='fill'&&acuRequest.lineIds?.length===1){
       if(model.focusLineId!==acuRequest.lineIds[0])model.lastCatalogAdvice=null;
       model.focusLineId=acuRequest.lineIds[0];
      }
      // Preparation is read-only and begins directly from the request. Only
      // a separate approval of the exact proposed items can write to the DB.
      await approveMessage(model.messages.length-1);return;
    }
    if(isApprovalReply(question)){
      if(!showActionState(question)){addReply(question,{answer:'No hay un pedido listo para cargar ni un guardado confirmado. Indicame qué partida querés crear o completar.'});paint();}return;
    }
    const history=model.messages.slice(-10).map(m=>({role:m.role,content:m.content}));
    const byteSize=items=>new TextEncoder().encode(items.map(m=>m.content).join("")).length;
    while(history.length&&byteSize([...history,{content:question}])>28000)history.splice(0,2);
    const messages=[...history,{role:"user",content:question}];
    if(model.includeContext&&model.contextMode==='screen')model.context=captureContext();
    const focusedLine=state.lines.find(line=>line.id===model.focusLineId);
    const pinnedContext=model.includeContext&&focusedLine?'\nPARTIDA ACTIVA DE ESTA CONVERSACIÓN (tiene prioridad sobre la selección visual hasta que el usuario elija expresamente otra): '+JSON.stringify({line_id:focusedLine.id,description:focusedLine.description,unit:focusedLine.unit,quantity:focusedLine.quantity,existing_component_ids:(focusedLine.components||[]).map(c=>c.resource_id)})+'\n':'';
    const baseContext=(model.includeContext?JSON.stringify(structuredConversationContext(state,pendingIntent))+'\n':'')+aiDomainContext(state,question)+'\n'+actionContext()+pinnedContext+'\n'+(model.includeContext?model.context:'No se compartieron datos de pantalla ni del catálogo. Pedí únicamente la información imprescindible.');
    model.busy=true;model.error='';model.notice='';const token=++queryToken;
    let request,catalogSnapshot=null;
    try {
      let context=baseContext;
      // Optional, bounded snapshots from approved read-only native adapters.
      // Never let failures in secondary modules prevent the main chat request.
      if(model.includeContext&&/\b(?:estado|situacion|resumen|cuantos?|cuantas?|listado|listar|pendientes?|consultar|mostrame|mostrar|tengo|hay)\b/i.test(fold(question))){
       try{
        const evidence=await focusedAppSnapshot(question,{invoke,state});
        if(evidence)context=evidence+'\n'+context;
       }catch(error){model.notice='Algunos datos del módulo no pudieron verificarse: '+String(error).slice(0,140);}
      }
      if(token!==queryToken||generation!==model.generation)return;
      if(model.includeContext){
        model.catalogLoading=true;paint();
        let catalog;
        try{
          const wantsUsd=/\b(?:usd|d[oó]lares)\b|u\$s/i.test(question),wantsArs=/\b(?:ars|pesos)\b/i.test(question),currency=wantsUsd!==wantsArs?(wantsUsd?'USD':'ARS'):null;
          const localCurrency=String(state.estimates.find(estimate=>estimate.id===state.estimateId)?.currency||state.projects.find(project=>project.id===state.projectId)?.currency||'ARS').toUpperCase();
          const globalCatalog=state.remoteProject||currency&&currency!==localCurrency;
          catalog=await invoke('ai_catalog_context',{projectId:globalCatalog?null:state.projectId||null,estimateId:globalCatalog?null:state.estimateId||null,asOf:dateToday(),currency});
        }
        catch(error){throw new Error('No se pudo consultar el catálogo local: '+String(error)+'. Si actualizaste el código, cerrá y reiniciá CPOBRAS para cargar el comando nuevo.');}
        if(token!==queryToken||generation!==model.generation)return;
        catalogSnapshot=catalog;context=groundedContext(context,catalog,question,model.messages);
        model.catalogLoading=false;model.notice='Catálogo local consultado: se incluyen coincidencias reales, unidades y precios vigentes.';
      }
      if(token!==queryToken||generation!==model.generation)return;
      const mode=/(?:edit[aá]|modific[aá]|cambi[aá]|elimin[aá]|borr[aá]|quit[aá]).{0,60}partidas|partidas.{0,60}(?:eliminar|editar|borrar)/i.test(question)?"manage":/(?:presupuest[aá]m[eé]|cotiz[aá]m[eé]|arm[aá]m[eé] un presupuesto|cre[aá]r?|gener[aá]r?|arm[aá]r?|prepar[aá]r?|propon[eé]r?).{0,80}(?:vivienda|casa|galp[oó]n|edificio|partidas|presupuesto)|partidas.{0,60}(?:necesarias|obra nueva)/i.test(question)?"plan":undefined;
      request=createAiRequest(invoke,{messages,context,...(mode?{mode}:{})});activeRequest=request;paint();
      let result=await request.promise;
      if(generation!==model.generation||token!==queryToken)return;
      const additional=catalogSnapshot?parseCatalogQuery(result.text):null;
      if(additional){
        const followup=messages.slice();while(followup.length>9)followup.splice(0,2);
        followup.push({role:'assistant',content:JSON.stringify({answer:'Se consulta el catálogo local con estos términos: '+additional})},{role:'user',content:'CPOBRAS incluye las coincidencias adicionales del catálogo real en el contexto. Respondé ahora a mi consulta original: '+question+'\nUsá los resultados reales, diferenciá material y mano de obra, y no pidas otra búsqueda ni confirmación para leer precios. No devuelvas catalog_query en esta respuesta final.'});
        while(followup.length>3&&byteSize(followup)>28000)followup.splice(0,2);
        model.notice='Buscando coincidencias adicionales en el catálogo local…';
        context=groundedContext(baseContext,catalogSnapshot,additional,[]);
        request=createAiRequest(invoke,{messages:followup,context,...(mode?{mode}:{})});activeRequest=request;paint();
        const next=await request.promise;if(generation!==model.generation||token!==queryToken)return;
        result={...next,input_tokens:result.input_tokens!=null&&next.input_tokens!=null?result.input_tokens+next.input_tokens:undefined,output_tokens:result.output_tokens!=null&&next.output_tokens!=null?result.output_tokens+next.output_tokens:undefined};
        try{if(parseCatalogQuery(result.text))result.text=JSON.stringify({answer:catalogAnswer(catalogSnapshot,additional)});}catch{result.text=JSON.stringify({answer:catalogAnswer(catalogSnapshot,additional)});}
      }
      let parsed=parseAiReply(result.text);
      // A model that misclassifies "rubros" as proposal_lines must never
      // create budget lines just because the user approved the response.
      const rubroIntent=/\b(?:crea(?:r|lo|los)?|converti(?:r|los)?|renombra(?:r|lo|los)?|borra(?:r|lo|los)?|elimina(?:r|lo|los)?|edita(?:r|lo|los)?)\b.{0,75}\b(?:rubros?|subrubros?)\b|\b(?:rubros?|subrubros?)\b.{0,75}\b(?:crear|convertir|renombrar|borrar|eliminar|editar)\b/.test(fold(question));
      if(rubroIntent&&parsed.planRows?.length){
       throw new Error('La IA interpretó rubros como partidas. Se descartó esa propuesta; no se creó ninguna partida. Repetí el pedido de rubros.');
      }
      if(parsed.toolCall){
        if(parsed.toolCall.name==='manage_sections'){
          if(!canPlan())throw Error('Abrí un presupuesto editable para modificar sus rubros.');
          const createdIds=model.recentCreatedEstimateId===state.estimateId&&model.recentCreatedLineIds.length?model.recentCreatedLineIds:recentCreatedSectionSources(model.messages,state.estimateId);
          const plan=prepareSectionEdits(parsed.toolCall.args,state,createdIds,question);
          if(generation!==model.generation||token!==queryToken)return;
          addReply(question,{answer:'Revisá el cambio de rubros propuesto. No se guardó nada.',sectionPreview:plan});
          model.notice='Los cambios quedan pendientes de una sola aprobación.';
          return;
        }
        if(parsed.toolCall.name==='review_budget'){
          if(!canPlan()||!state.estimateId)throw new Error('Abrí un presupuesto propio en elaboración para revisar sus rubros y ACU.');
          const missing=(state.lines||[]).filter(line=>!line.analysis_id&&!(line.components||[]).length).map(line=>line.id).slice(0,60);
          const review={mode:'fill',brief:parsed.toolCall.args.brief,lineIds:missing,reviewBudget:true};
          addReply(question,{answer:'Prepararé la revisión, clasificación por rubros y ACU con insumos reales. Nada se guardó todavía.',acuRequest:review});
          model.busy=false;model.catalogLoading=false;
          await approveMessage(model.messages.length-1);return;
        }
        if(parsed.toolCall.name==='prepare_budget'||parsed.toolCall.name==='prepare_acu'){
          if(!canPlan())throw new Error('Abrí un presupuesto propio en elaboración y cerrá los formularios pendientes para preparar esta carga');
          const request=budgetPreparationRequest(parsed.toolCall,{state,focusedLineId:model.focusLineId,userQuestion:question});
          if(generation!==model.generation||token!==queryToken)return;
          const answer='Estoy preparando el presupuesto y su composición para revisar. Todavía no se guardó nada.';
          addReply(question,{answer,acuRequest:request});
          if(request.mode==='fill'&&request.lineIds.length===1)model.focusLineId=request.lineIds[0];
          model.busy=false;model.catalogLoading=false;
          await approveMessage(model.messages.length-1);
          return;
        }
        // The model chooses an intent; Rust/JS services perform read-only
        // operations with typed arguments and verified local data.
        const operation=await executeBudgetTool(parsed.toolCall,{invoke,state,today:dateToday()});
        if(generation!==model.generation||token!==queryToken)return;
        parsed={answer:operation.answer,proposal:null};
      }
      if(catalogSnapshot&&/no (?:tengo|dispongo de|cuento con) acceso.{0,50}(?:cat[aá]logo|biblioteca)|no puedo acceder.{0,40}(?:cat[aá]logo|biblioteca)/i.test(parsed.answer)){parsed={answer:catalogAnswer(catalogSnapshot,question,model.messages),proposal:null};result.text=JSON.stringify(parsed);}
      const executionClaim=/\b(?:agregue|anadi|incorpore|cargue|guarde|cree|aplique)\b|\bse (?:creo|crearon|agrego|agregaron|cargo|cargaron|guardo|guardaron|incorporo|incorporaron|aplico|aplicaron)\b|\b(?:fue|fueron|ha sido|han sido) (?:cread[oa]s?|cargad[oa]s?|guardad[oa]s?|agregad[oa]s?)\b/.test(fold(parsed.answer));
      const progressClaim=/\b(?:estoy|estamos|voy a|vamos a|procedo a|se estan)\s+(?:cargando|cargar|agregando|agregar|guardando|guardar|incorporando|incorporar|aplicando|aplicar|creando|crear)\b/.test(fold(parsed.answer));
      const loadTurn=isAction(parsed)||isApprovalReply(question)||/\b(?:crea(?:r|lo|la|los|las)?|agrega(?:r|lo|la|los|las)?|carga(?:r|lo|la|los|las)?|completa(?:r|lo|la|los|las)?|incorpora(?:r|lo|la|los|las)?|aplica(?:r|lo|la|los|las)?)\b/.test(fold(question));
      if((executionClaim||progressClaim)&&loadTurn&&!parsed.actionError){
        if(isAction(parsed))parsed.answer='La propuesta está preparada, pero todavía no se guardó. Podés aprobar su carga desde el chat.';
        else parsed={answer:'No se inició ninguna carga: la respuesta de la IA no incluyó una acción ejecutable. Para agregar insumos a una partida con ACU existente, pedí «Agregá los materiales a esta partida seleccionada»; CPOBRAS preparará una propuesta antes de aprobarla.',proposal:null,actionError:'No se recibió una propuesta ejecutable.'};
      }
      addReply(question,parsed);model.notice=`Conexión con ${model.provider==="openai"?"OpenAI":"Claude"} verificada: se recibió una respuesta.`;model.usage={input:result.input_tokens,output:result.output_tokens};
    }catch(error){if(generation===model.generation&&token===queryToken)model.error=String(error);}
    finally{if(token===queryToken&&(!request||activeRequest===request)){activeRequest=null;model.busy=false;model.catalogLoading=false;paint();host.querySelector("#ai-prompt")?.focus();}}
  }
  host.addEventListener("click",async event=>{
    event.stopPropagation();const button=event.target.closest("[data-ai]");if(!button||button.disabled)return;
    const action=button.dataset.ai;
    if (action === "toggle" && button.matches(".ai-launch") && suppressLauncherClick && event.detail !== 0) {
      suppressLauncherClick = false;
      return;
    }
    model.error="";
    try{
      if (action === "approve-selected-acu-edit" && canDraftLibraryAcu() && !model.busy){
        const message=model.messages[Number(button.dataset.index)];
        if(message?.libraryEdit)await confirmSelectedAcuEdit("Aprobación de la propuesta visible",message);
      }
      if (action === "review-selected-acu-edit" && canDraftLibraryAcu() && !model.busy){
        const message=model.messages[Number(button.dataset.index)];
        const edit=message?.libraryEdit;
        if(edit&&!edit.applied&&!edit.spent&&edit.baseline.id===state.selectedAnalysisId){
          openModal("analysis",{...edit.draft,components:edit.draft.components},()=>{edit.spent=true;});
        }
      }
      if (action === "review-library-acu" && canDraftLibraryAcu() && !model.busy) {
        const drafts = model.messages[Number(button.dataset.index)]?.libraryAcus;
        const index = Number(button.dataset.draft);
        const draft = drafts?.[index];
        if (draft) {
          openModal("analysis", draft, () => { drafts[index] = null; });
        }
      }
      if(action==="acu-workbench"&&!model.busy){const request=acuChatRequest(model.question,model.messages);if(request)await openAcuRequest(request);else await acuWorkbench.open(model.question);}
      if((action==="review-acu-plan"||action==="review-acu-request")&&!model.busy)await reviewAcuMessage(Number(button.dataset.index));
      if(action==="manage-import"&&!model.busy)budgetImport.open("manage",model.question);
      if(action==="budget-import"&&!model.busy)budgetImport.open("prices",model.question);
      if(action==="plan-import"&&!model.busy)await acuWorkbench.open(model.question,null,"create");
      if(action==="review-plan"&&!model.busy){const message=model.messages[Number(button.dataset.index)];if(message?.planRows&&!message?.changeProposals)await reviewAcuMessage(Number(button.dataset.index));else budgetImport.openPlanRows(message?.planRows||[],message?.changeProposals||[]);}
      if(action==='approve-load')await approveMessage(Number(button.dataset.index));
       if(action==='approve-section')await approveSectionMessage(Number(button.dataset.index));
       if(action==='discard-section'&&!model.busy){
        const message=model.messages[Number(button.dataset.index)];
        if(message?.sectionPreview){delete message.sectionPreview;message.answer='Propuesta de rubros descartada; no se modificó el presupuesto.';message.actionError='Descartada';model.pendingAction=null;}
       }
       if(action==='discard-preview'&&!model.busy){
        const message=model.messages[Number(button.dataset.index)];
        if(message?.preview){acuWorkbench.cancelPrepared();delete message.preview;message.answer='Propuesta descartada. No se modificó el presupuesto.';message.actionError='Propuesta descartada.';model.pendingAction=null;}
       }
      if(action==='stop-approved')cancelApprovedRun();
      if(action==='approved-pending'&&!model.busy)await acuWorkbench.showLatest();
      if(action==='approved-result'&&!model.busy){const result=model.messages[Number(button.dataset.index)]?.approval?.result;if(result?.estimateId)await openEstimate(result.estimateId,result.lineIds?.[0]||null);}
      if(action==='cancel'){activeRequest?.cancel();activeRequest=null;queryToken++;model.busy=false;model.catalogLoading=false;model.error='Consulta cancelada.';}
      if(action==="toggle"){
        if(model.open)cancelApprovedRun();
        model.open=!model.open;
        if(model.open&&model.contextMode==="screen")model.context=captureContext();
        if(model.open&&!model.configured){model.notice="Leyendo configuración guardada…";paint();const status=await invoke("ai_status");Object.assign(model,status);model.notice=status.configured?"Configuración de IA restaurada desde el llavero del sistema.":"";if(status.storage_error)model.error=status.storage_error;}
      }
      if(action==="settings")model.settings=!model.settings;
      if(action==="clear"&&!model.busy){pendingIntent=null;store().clear();acuWorkbench.cancelPrepared();model.generation++;model.messages=[];model.lastAction=null;model.pendingAction=null;model.focusLineId=null;model.lastCatalogAdvice=null;model.recentCreatedLineIds=[];model.recentCreatedEstimateId=null;model.usage=null;model.question="";model.context="";model.includeContext=true;model.contextMode="screen";model.contextOpen=false;}
      if(action==="capture"&&!model.busy){model.context=captureContext();model.includeContext=true;model.contextMode="screen";model.contextOpen=true;}
      if(action==="forget"&&!model.busy){pendingIntent=null;store().clear();await invoke("ai_forget");Object.assign(model,{configured:false,settings:true,messages:[],lastAction:null,pendingAction:null,question:"",context:"",includeContext:true,contextMode:"screen",contextOpen:false,consent:false,usage:null,notice:""});model.generation++;}
      if(action==="quick"&&!model.busy){
        model.question=button.dataset.question;
        if(button.dataset.question.startsWith("Explicame")){
          if(model.contextMode==="screen")model.context=captureContext();
          model.includeContext=true;
          model.notice="Se incluirá el contexto de esta pantalla al enviar la consulta. Podés revisarlo en Contexto de la pantalla.";
        }
      }
      if(action==="draft"){
        const proposal=model.messages[Number(button.dataset.index)]?.proposal;
        if(!proposal||!allowed(proposal))throw new Error("Abrí un presupuesto editable y cerrá otros formularios antes de usar la propuesta");
        const draft=draftFromProposal(proposal);openModal(draft.kind,draft.record);state.modalDirty=true;model.open=false;
      }
    }catch(error){model.error=String(error);}
    paint();
  });
  host.addEventListener("toggle",event=>{if(event.target.isConnected&&event.target.matches?.(".ai-context"))model.contextOpen=event.target.open;},true);
  host.addEventListener("input",event=>{event.stopPropagation();const t=event.target;if(t.name==="question")model.question=t.value;if(t.name==="ai-context-text"){model.context=t.value;model.contextMode="edited";host.querySelector(".ai-context summary").textContent=`Contexto de la pantalla · ${model.includeContext?"editado":"sin incluir"}`;}});
  host.addEventListener("change",event=>{
    event.stopPropagation();const t=event.target;
    if(t.name==="ai-consent"){model.consent=t.checked;const button=host.querySelector('#ai-question button');if(button)button.disabled=model.busy||!model.configured||!model.consent;}
    if(t.name==="ai-include-context"){model.includeContext=t.checked;if(t.checked&&model.contextMode==="screen"){model.context=captureContext();host.querySelector('[name="ai-context-text"]').value=model.context;}host.querySelector(".ai-context summary").textContent=`Contexto de la pantalla · ${model.includeContext?"incluido":"sin incluir"}`;}
    if(t.name==="provider"){host.querySelector('[name="model"]').value=defaults[t.value];host.querySelector('[name="key"]').required=t.value!==model.provider||!model.configured;}
  });
  host.addEventListener("keydown",event=>{event.stopPropagation();if(event.key==="Escape"){cancelApprovedRun();model.open=false;paint();}if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)&&event.target.name==="question"){event.preventDefault();void send();}});
  host.addEventListener("submit",async event=>{
    event.preventDefault();event.stopPropagation();
    if(event.target.id==="ai-question"){await send();return;}
    if(event.target.id!=="ai-settings"||model.busy)return;
    const form=event.target,provider=form.elements.provider.value,name=form.elements.model.value,key=form.elements.key.value;
    model.busy=true;form.elements.key.value="";
    try{const status=await invoke("ai_configure",{provider,model:name,key});Object.assign(model,status,{settings:false,messages:[],lastAction:null,pendingAction:null,consent:false,error:"",usage:null,notice:"Configuración guardada en el llavero del sistema. Se restaurará al abrir CPOBRAS. La conexión se verificará al enviar una consulta."});model.generation++;}
    catch(error){model.error=String(error);}finally{model.busy=false;paint();}
  });
  syncContext();
  return {syncContext,isBusy:()=>model.busy || budgetImport.isBusy() || acuWorkbench.isBusy(),hasDraft:()=>Boolean(model.question || model.messages.some(message => message.libraryAcus?.some(Boolean)) || budgetImport.hasDraft() || acuWorkbench.hasDraft()),resumeAcuFromLibrary:()=>acuWorkbench.resumeFromLibrary(),configure:async()=>{
    if(model.busy)return;model.open=true;model.settings=true;model.error='';
    try{Object.assign(model,await invoke('ai_status'));}catch(error){model.error=String(error);}paint();
  }};
}
