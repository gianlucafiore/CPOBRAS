import {createAcuWorkbench} from "./ai-acu-workbench.js";
import {createApprovedPlanRunner} from "../services/ai-approved-plan.js";
import {createAiBudgetImport} from "./ai-budget-import.js";
import {e,dateToday} from "./helpers.js";
import {buildCatalogContext,parseCatalogQuery} from "../services/ai-catalog-context.js";
import {appendRequest} from "../services/ai-acu-addition.js";
import {reviewAiResourceRows} from "../services/ai-resource-import.js";
import {conversationIntent,proposalPrompt,parseConversationProposal,describeConversationProposal,isConversationApproval,isConversationCancel} from "../services/ai-conversation-workflows.js";
import {parseAiReply,draftFromProposal,screenContext,createAiRequest,budgetScreenContext,acuChatRequest,resolvedPendingApproval,isApprovalReply} from "../services/ai-assistant.js";
const defaults={openai:"gpt-4.1-mini",anthropic:"claude-haiku-4-5"};
export function createAiAssistant({invoke,state,document,window,openModal,editable,loadEstimate,loadEstimates,openEstimate,openResourceLibrary,render}) {
  const host=document.createElement("div");host.id="ai-assistant";document.body.append(host);
  const model={open:false,settings:false,configured:false,provider:"openai",model:defaults.openai,messages:[],question:"",busy:false,error:"",context:"",includeContext:true,contextMode:"screen",contextOpen:false,consent:false,scope:"",generation:0,usage:null,notice:"",approvedRun:null,lastApprovedId:null,lastAction:null,pendingAction:null,catalogLoading:false,chatDraft:null,chatPreparing:false};
  const budgetImport=createAiBudgetImport({invoke,state,document,window,editable,loadEstimate,loadEstimates,openEstimate,canUseAi:()=>model.configured&&model.consent&&!model.busy});
  const acuWorkbench=createAcuWorkbench({invoke,state,document,window,loadEstimate,loadEstimates,openEstimate,openResourceLibrary,canUseAi:()=>model.configured&&model.consent&&(!model.busy||model.approvedRun?.running||model.chatPreparing)});
  const approvedPlans=createApprovedPlanRunner({invoke,state,loadEstimate,loadEstimates,openEstimate});
  let activeRequest=null,queryToken=0;
  const scope=()=>[state.view,state.projectId,state.estimateId].join(":");
  function syncContext(){
    budgetImport.syncScope();
    acuWorkbench.syncScope();
    if(state.navigating)cancelApprovedRun();
    if(state.modal){cancelApprovedRun();model.open=false;}
    const next=scope();
    if(model.scope!==next&&model.approvedRun?.running&&model.approvedRun.phase==='saving'&&state.projectId===model.approvedRun.projectId&&state.estimateId===model.approvedRun.estimateId&&state.view==='workspace'){model.scope=next;model.approvedRun.scope=next;}
    if(model.scope!==next){cancelApprovedRun();activeRequest?.cancel();activeRequest=null;queryToken++;if(!model.approvedRun)model.busy=false;model.catalogLoading=false;model.scope=next;model.generation++;model.messages=[];model.lastAction=null;model.pendingAction=null;model.chatDraft=null;model.context="";model.includeContext=true;model.contextMode="screen";model.question="";model.error="";model.usage=null;model.notice="";}
    if(model.open&&model.contextMode==="screen"&&!state.navigating)model.context=captureContext();
    paint();
  }
  const captureContext=()=>budgetScreenContext(state,screenContext(document));
  const fold=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isAction=message=>!!(message?.acuRequest||message?.planRows||message?.changeProposals||message?.proposal?.kind==='line'||message?.actionError);
  function addReply(question,message){
    message.role='assistant';message.originalQuestion=question;
    const content={answer:message.answer};
    if(message.acuRequest)content.acu_request={mode:message.acuRequest.mode,brief:message.acuRequest.brief,...(message.acuRequest.mode==='fill'?{line_ids:message.acuRequest.lineIds}:{})};
    if(message.planRows)content.proposal_lines=message.planRows.map(row=>({description:row.description,unit:row.unit,quantity:row.quantity??null,unit_price:row.unit_price??null,section:row.section||''}));
    if(message.changeProposals)content.proposal_changes=message.changeProposals;
    if(message.proposal)content.proposal=message.proposal;
    if(message.chatPreview)content.conversation_proposal={kind:message.chatPreview.kind,rows:message.chatPreview.rows};
    message.content=JSON.stringify(content);
    if(new TextEncoder().encode(message.content).length>11000)message.content=JSON.stringify({answer:message.answer.slice(0,2000),proposed_lines:message.planRows?.length||0});
    model.messages.push({role:'user',content:question},message);model.messages=model.messages.slice(-10);
    if(isAction(message)){model.lastAction=message;model.pendingAction=!message.actionError&&!message.approval&&!message.changeProposals?message:null;}else if(!message.actionStatus)model.pendingAction=null;
    model.question='';return message;
  }
  function actionContext(){
    const message=model.lastAction;if(!message)return '\nESTADO DE CARGAS DE CPOBRAS: no hay una ejecución registrada en este chat.';
    const approval=message.approval,result=approval?.result;
    return '\nESTADO DE CARGAS REGISTRADO POR CPOBRAS (no es una afirmación del modelo):\n'+JSON.stringify({state:approval?.state||(message.actionError?'rejected':'pending'),committed:result?.committed===true,created:result?.created||0,saved:result?.saved||0,pending:result?.pending||0,estimate_id:result?.estimateId||null,line_ids:result?.lineIds||[],message:approval?.message||message.actionError||'La propuesta no se ejecutó. Espera aprobación.'});
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

  // The chat's draft belongs to this exact screen. Only a fresh, explicit user
  // message can authorize a native write. Model text is NEVER executed as a command.
  const conversationScope=()=>scope();
  const conversationalRevision=q=>/\b(?:cambi[áa]|modific[áa]|correg[íi]|quit[áa]|sac[áa]|elimin[áa]|agreg[áa]|sum[áa]|reemplaz[áa]|ajust[áa]|dej[áa]|pon[ée]|inclu[íi]|exclu[íi]|en vez|mejor|falt[óo]|rendimiento|cantidad|precio|unidad|tipo)\b/i.test(q);
  const snapshotResources=(catalog,question,previous)=>{
    const words=String(question+' '+(previous?JSON.stringify(previous.rows):'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>=4);
    const extras=['cemento','arena','cal','ladrillo','hormigon','mortero','adhesivo','agua','oficial','ayudante','pintura','revoque','porcelanato','hierro','acero','encofrado','impermeabilizante'];
    const scored=catalog.resources.filter(r=>r.active!==false).map((resource,index)=>{
      const text=(resource.code+' '+resource.description).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const score=words.reduce((value,word)=>value+(text.includes(word)?8:0),0)+extras.reduce((value,word)=>value+(text.includes(word)?1:0),0)+(resource.price!=null?1:0);
      return {resource,index,score};
    });
    scored.sort((a,b)=>b.score-a.score||a.index-b.index);
    return scored.slice(0,90).map(x=>x.resource);
  };
  function stageConversation(question,draft){
    model.chatDraft={...draft,origin:conversationScope(),id:globalThis.crypto.randomUUID(),status:'pending'};
    const preview={kind:draft.kind,rows:draft.rows,summary:describeConversationProposal(draft)};
    addReply(question,{answer:draft.answer+'\n\nPropuesta sin guardar:\n'+preview.summary,chatPreview:preview});
    model.notice='Podés corregir la propuesta conversando. Solo se guarda después de tu aprobación explícita.';
    paint();
  }
  async function proposeConversation(question,kind,previous=null){
    const token=++queryToken,generation=model.generation;
    model.busy=true;model.error='';model.notice='Preparando una propuesta sin guardar…';
    let request=null;
    try{
      const catalog=await invoke('ai_catalog_context',{projectId:null,estimateId:null,asOf:dateToday(),currency:'ARS'});
      if(token!==queryToken||generation!==model.generation)return;
      const selected=kind==='generic_acu'?snapshotResources(catalog,question,previous):[];
      const taskContext={task:kind,view:state.view,as_of:dateToday(),currency:'ARS',resources:kind==='generic_acu'?selected.map(r=>({id:r.id,code:r.code,description:r.description,unit:r.unit,kind:r.kind,price:r.price})):[],rules:'Solo los UUID reales de resources son utilizables. No ejecutar cambios.'};
      if(kind==='resources')taskContext.existing_count=(state.resources||[]).length;
      const text=proposalPrompt(kind,question,previous?previous.rows:null);
      request=createAiRequest(invoke,{messages:[{role:'user',content:text}],context:JSON.stringify(taskContext),mode:kind==='resources'?'resources':'generic_acu'});
      activeRequest=request;
      const result=await request.promise;
      if(token!==queryToken||generation!==model.generation)return;
      const draft=parseConversationProposal(kind,result.text,{resources:selected},state.view==='resources'?state.resources||[]:state.analyses||[]);
      stageConversation(question,draft);
      model.usage={input:result.input_tokens,output:result.output_tokens};
    }catch(error){
      if(token===queryToken&&generation===model.generation)model.error='No se modificó la base. '+String(error);
    }finally{
      if(activeRequest===request)activeRequest=null;
      if(token===queryToken&&generation===model.generation){model.busy=false;paint();}
    }
  }

  async function proposeBudget(question,acuRequest,previous=null){
    const generation=model.generation,token=++queryToken;
    const request={...acuRequest};
    if(previous){
      const prior=previous.rows.slice(0,5).map(row=>({description:row.description,unit:row.unit,components:row.components.map(c=>({insumo:c.description,consumo:c.quantity,unidad:c.unit})),pendientes:row.missing_resources}));
      request.brief=[previous.request.brief,'PROPUESTA ANTERIOR: '+JSON.stringify(prior),'CORRECCIÓN SOLICITADA: '+question,'Conservá todos los demás rendimientos, insumos y partidas.'].join('\n\n').slice(0,3000);
    }
    model.busy=true;model.chatPreparing=true;model.error='';model.notice='Generando la composición y consumos ANTES de aprobar. No se guarda nada.';
    try{
      const result=await acuWorkbench.runApproved(request,{dryRun:true});
      if(generation!==model.generation||token!==queryToken)return;
      if(!result.draftId||!result.previews?.length)throw new Error('No se pudo preparar ninguna receta de ACU. No se guardó nada.');
      const errors=result.previews.flatMap((row,i)=>row.errors.map(error=>(i+1)+': '+error));
      stageConversation(question,{kind:'budget_acu',answer:'Preparé '+result.previews.length+' ACU para el presupuesto: '+result.ready+' completos y '+result.pending+' pendientes. Los precios y consumos se leyeron del catálogo local. Podés corregir cualquier material o rendimiento escribiéndomelo.',rows:result.previews,errors,request,draftId:result.draftId,ready:result.ready});
    }catch(error){
      if(generation===model.generation&&token===queryToken)model.error='No se modificó el presupuesto. '+String(error);
    }finally{
      if(generation===model.generation&&token===queryToken){model.busy=false;model.chatPreparing=false;paint();}
    }
  }
  async function commitConversation(question){
    const draft=model.chatDraft;
    if(!draft||draft.status!=='pending'||draft.origin!==conversationScope())return;
    // Freeze the proposal before the first native write. Never auto-retry a possibly committed request.
    draft.status='writing';model.busy=true;model.error='';model.question='';paint();
    let created=0,uncertain=false;
    try{
      if(state.remoteProject||state.modal||state.pageDirty||state.navigating)throw new Error('Cerrá los formularios y guardá los cambios pendientes antes de cargar');
      if(draft.kind==='resources'){
        if(state.view!=='resources'||state.projectId)throw new Error('La propuesta pertenece a la biblioteca de Insumos');
        const current=await invoke('list_resources');
        const checked=reviewAiResourceRows(draft.rows.map(row=>({...row,price:'',selected:true})),current);
        const invalid=checked.flatMap((row,index)=>row.errors.map(error=>(index+1)+': '+error));
        if(invalid.length)throw new Error('Hay insumos incompletos o repetidos: '+invalid.join(' · '));
        const rows=checked.map(row=>({code:'',description:row.description,unit:row.unit,kind:row.kind,price:null}));
        uncertain=true;
        const result=await invoke('import_resources',{rows,effectiveDate:dateToday(),source:'Alta aprobada por mensaje en el chat IA de CPObras'});
        uncertain=false;created=result.created;
        state.resources=await invoke('list_resources');
      }else if(draft.kind==='budget_acu'){
        if(!canPlan()||!draft.ready)throw new Error('No hay ACU completos para cargar o el presupuesto ya no admite cambios.');
        uncertain=true;
        const result=await acuWorkbench.commitChatPrepared(draft.draftId);
        uncertain=false;created=result.saved+result.created;
        draft.status='committed';model.chatDraft=null;
        addReply(question,{answer:'Guardado confirmado por CPObras: '+result.saved+' ACU y '+result.created+' partidas nuevas.'+(result.pending?' Pendientes: '+result.pending+'.':'')+(result.refreshError?' El guardado se confirmó, pero falló la actualización de la pantalla: '+result.refreshError:''),actionStatus:true});
        render?.();return;
      }else if(draft.kind==='generic_acu'){
        if(state.view!=='analyses'||state.projectId)throw new Error('La propuesta pertenece a la biblioteca de ACU genéricos');
        if(draft.errors.length)throw new Error('La propuesta tiene datos pendientes: '+draft.errors.join(' · '));
        const [currentResources,currentAnalyses]=await Promise.all([invoke('list_resources'),invoke('list_analyses')]);
        const catalog=new Map(currentResources.map(r=>[r.id,r]));
        for(const row of draft.rows){
          if(currentAnalyses.some(a=>String(a.description).toLowerCase()===row.description.toLowerCase()&&String(a.unit).toLowerCase()===row.unit.toLowerCase()))throw new Error('Ya existe el ACU: '+row.description);
          for(const c of row.components){
            const current=catalog.get(c.resource_id);
            if(!current||current.active===false||current.unit!==c.unit||current.price==null||String(current.price)!==c.unit_price)throw new Error('Cambió el precio o identidad de '+c.description+'. Solicitá actualizar la propuesta antes de aprobar.');
          }
        }
        for(const row of draft.rows){
          uncertain=true;
          await invoke('create_analysis',{code:'',description:row.description,unit:row.unit,components:row.components.map(c=>({resource_id:c.resource_id,quantity:c.quantity,unit_price:c.unit_price}))});
          created++;uncertain=false;
        }
        state.analyses=await invoke('list_analyses');
      }else throw new Error('La propuesta no tiene una operación permitida');
      draft.status='committed';model.chatDraft=null;
      addReply(question,{answer:'Guardado confirmado por CPObras: '+created+' '+(draft.kind==='resources'?'insumos en la biblioteca.':'ACU genéricos en la biblioteca.')+' No se repitió la operación.',actionStatus:true});
      render?.();
    }catch(error){
      draft.status='failed';model.chatDraft=null;
      addReply(question,{answer:(uncertain||created?'No se reintentará automáticamente: puede haber cambios guardados ('+created+' confirmados). Revisá la biblioteca antes de solicitar otra carga. ':'No se guardó esta propuesta. ')+String(error),actionStatus:true});
    }finally{model.busy=false;paint();}
  }
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
    const resolved=request||{mode:'create',brief,lineIds:[]},addition=resolved.mode==='fill'?appendRequest(resolved.brief,state.lines,state.selectedLineId):null;
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
    if(message.changeProposals)return '';
    const name=state.estimates.find(e=>e.id===state.estimateId)?.title||'un presupuesto nuevo de esta obra';
    const resolved=acuMessageRequest(index),isAcu=resolved.isAcu;
    const request=resolved.request,targets=request?.lineIds?.length?request.lineIds.map(id=>state.lines.find(line=>line.id===id)?.description||id):[];
    const scopeHint=isAcu?(request?.mode==='create'?'Se crearán partidas nuevas con su ACU.':targets.length?'Partidas indicadas: '+targets.join(', ')+(request.operation==='append'?'. Se agregarán los insumos solicitados conservando la composición actual.':'. Si ya tienen ACU, se reemplazará su composición.'):'Se completarán las partidas que todavía no tengan ACU.'):'';
    return `<p>${isAcu?'La autorización permite generar y cargar los ACU de este pedido; las cantidades y los metrados existentes se conservan.':'La autorización agrega estas partidas nuevas. Cantidades o precios sin informar se cargan en 0.'} Destino: ${e(name)}. ${e(scopeHint)} Podés ajustar los datos después.</p><button type="button" class="ai-approve" data-ai="approve-load" data-index="${index}" ${canPlan()&&model.configured&&model.consent&&!model.busy?'':'disabled'}>Sí, aprobar y cargar</button>`;
  }
  async function approveMessage(index){
    const message=model.messages[index];
    if(!message||message.approval||message.changeProposals||!canPlan()||!model.configured||!model.consent||model.busy)return;
    const resolved=acuMessageRequest(index),planRows=message.planRows||(message.proposal?.kind==='line'?[{description:message.proposal.description,unit:message.proposal.unit,quantity:message.proposal.quantity??null,unit_price:message.proposal.unit_price??null,section:''}]:null),kind=planRows&&!resolved.isAcu?'plan':'acu';
    if(resolved.request.error){model.error=resolved.request.error;message.actionError=model.error;model.lastAction=message;paint();return;}
    if(kind==='acu'&&!message.acuRequest){message.acuRequest=resolved.request;delete message.planRows;if(message.proposal?.kind==='line')message.proposal=null;}
    const run={id:globalThis.crypto.randomUUID(),kind,running:true,scope:scope(),projectId:state.projectId,estimateId:state.estimateId,phase:'preparing'};
    model.approvedRun=run;model.lastApprovedId=run.id;model.lastAction=message;model.pendingAction=null;model.busy=true;model.error='';
    message.answer='Autorización recibida. La carga se ejecuta desde el chat, sin abrir el formulario de revisión.';message.approval={id:run.id,kind,state:'running',message:'Preparando la carga autorizada…'};paint();
    const onProgress=event=>{if(model.approvedRun!==run||!run.running)return;run.phase=event.phase;if(event.estimateId)run.estimateId=event.estimateId;message.approval.message=event.message;paint();};
    try{
      const result=kind==='plan'?await approvedPlans.run(planRows,{onProgress}):await acuWorkbench.runApproved({...resolved.request,outline:resolved.outline},{onProgress});
      if(model.approvedRun!==run||run.scope!==scope())return;
      const saved=result.saved||0,created=result.created||0,pending=result.pending||0;
      const counts=[saved?`${saved} ACU ${saved===1?'cargado':'cargados'}`:'',created?`${created} ${created===1?'partida nueva creada':'partidas nuevas creadas'}`:''].filter(Boolean).join(' y ');
      const summary=result.committed?`Carga terminada: ${counts||'guardado confirmado'}${pending?`; ${pending} ${pending===1?'pendiente':'pendientes'}`:''}.`:`${result.cancelled?'Carga detenida. ':''}No hay un guardado confirmado para este pedido${pending?`; ${pending} ${pending===1?'pendiente':'pendientes'}`:''}.`;
      const notice=[summary,result.error,result.refreshError].filter(Boolean).join(' ');
      message.answer=notice;message.approval={...message.approval,state:'done',message:notice,result};
      message.content=JSON.stringify({answer:message.answer+'\nResultado registrado por CPOBRAS: '+notice});model.notice=notice;
    }catch(error){if(run.scope===scope()){message.answer='La carga se detuvo: '+String(error);message.approval={...message.approval,state:'stopped',message:message.answer};message.content=JSON.stringify({answer:message.answer});}}
    finally{run.running=false;if(model.approvedRun===run){model.approvedRun=null;model.busy=false;paint();}}
  }
  function allowed(p){return !state.remoteProject&&!state.modal&&(p.kind!=="line"||editable());}
  function paint(){
    const providerName=model.provider==="openai"?"OpenAI":"Claude";
    host.innerHTML=`<button class="ai-launch btn" ${model.open?"hidden":""} data-ai="toggle" aria-expanded="${model.open}" aria-controls="ai-console" title="Asistente IA">✦ IA</button>${model.open?`<section id="ai-console" class="ai-console ${model.settings||!model.configured||model.contextOpen?"ai-expanded":""}" aria-label="Consola de asistente IA"><header class="ai-bar"><strong>✦ CPOBRAS IA</strong><span>${e(providerName)} · ${e(model.model)}</span><button data-ai="settings" title="Configurar proveedor" ${model.busy?"disabled":""}>⚙ Configurar</button><button data-ai="clear" title="Limpiar conversación" ${model.busy?"disabled":""}>Limpiar</button><button data-ai="toggle" aria-label="Cerrar consola">×</button></header>
    ${model.settings||!model.configured?`<form id="ai-settings" class="ai-settings"><div class="ai-settings-fields"><label>Proveedor<select name="provider" ${model.busy?"disabled":""}><option value="openai" ${model.provider==="openai"?"selected":""}>OpenAI</option><option value="anthropic" ${model.provider==="anthropic"?"selected":""}>Claude · Anthropic</option></select></label><label>Modelo<input name="model" value="${e(model.model)}" required maxlength="120" ${model.busy?"disabled":""}></label><label>Clave de API<input name="key" type="password" autocomplete="off" placeholder="${model.configured?"Dejá vacío para conservar la clave guardada":"Pegá tu clave de API"}" ${model.configured?"":"required"} maxlength="512" ${model.busy?"disabled":""}></label></div><p>El proveedor, modelo y clave se guardan en el llavero de credenciales del sistema, fuera de los proyectos y sus respaldos. El proveedor cobra el uso de API por separado de las suscripciones de chat.</p><button class="btn" ${model.busy?"disabled":""}>Guardar configuración</button>${model.configured?'<button type="button" data-ai="forget" class="btn">Borrar clave guardada y chat</button>':""}</form>`:""}
    <div class="ai-transcript" role="log" aria-label="Conversación IA" aria-live="polite">${!model.messages.length?'<div class="ai-welcome">Puedo ayudarte con:<br> • Explicar los datos de esta pantalla<br> • Preparar partidas e insumos para revisar<br> • Identificar datos que faltan en una carga<br><br>Las respuestas pueden contener errores. Los precios se consultan en el catálogo local. Podés aprobar una carga desde el chat y ajustar después los rendimientos estimados.</div>':model.messages.map((m,index)=>`<article class="ai-message ai-${m.role}"><b>${m.role==="user"?"Vos":"Asistente"}</b><div>${m.chatPreview?`<span style="white-space:pre-wrap">${e(m.answer||m.content)}</span>`:e(m.answer||m.content)}</div>${m.actionStatus?approvalMarkup(m,index):''}${m.acuRequest?`<div class="ai-proposal"><strong>${m.acuRequest.mode==='fill'?'Completar ACU de partidas existentes':'Preparar partidas nuevas con ACU'}</strong>${approvalMarkup(m,index)}${!m.approval?`<button type="button" data-ai="review-acu-request" data-index="${index}" ${canPlan()&&!model.busy?'':'disabled'}>Revisar antes de cargar</button>`:''}</div>`:''}${m.planRows||m.changeProposals?`<div class="ai-proposal"><strong>${(m.planRows?.length||0)+(m.changeProposals?.length||0)} partidas / cambios propuestos</strong>${m.planRows&&!m.changeProposals?`<details class="ai-plan-preview"><summary>Ver partidas propuestas</summary><ul>${m.planRows.map(r=>`<li>${e(r.description)} · ${e(r.unit)} · Cantidad: ${e(r.quantity??'sin informar')} · Precio: ${e(r.unit_price??'sin informar')}${r.section?' · '+e(r.section):''}</li>`).join('')}</ul></details>${approvalMarkup(m,index)}`:'<p>Revisá los cambios antes de aplicarlos.</p>'}${!m.approval?`<button type="button" data-ai="review-plan" data-index="${index}" ${canPlan()&&!model.busy?"":"disabled"}>Revisar propuesta</button>`:''}${m.planRows&&!m.approval?`<button type="button" data-ai="review-acu-plan" data-index="${index}" ${canPlan()&&!model.busy?"":"disabled"}>Preparar ACU con insumos</button>`:""}</div>`:""}${m.proposal?`<div class="ai-proposal"><strong>Borrador de ${m.proposal.kind==="line"?"partida":"insumo"}</strong><p>${e(m.proposal.description)} · ${e(m.proposal.unit)}${m.proposal.quantity!=null?` · Cantidad ${e(m.proposal.quantity)}`:""}${m.proposal.unit_price!=null?` · Precio ${e(m.proposal.unit_price)}`:""}</p>${m.proposal.kind==='line'?approvalMarkup(m,index):''}${!m.approval?`<button class="btn" data-ai="draft" data-index="${index}" ${allowed(m.proposal)&&!m.approval?"":"disabled"}>Abrir formulario para revisar</button><small>Completá los campos faltantes y guardá desde el formulario habitual.${!allowed(m.proposal)?" Cerrá otros formularios; las partidas requieren un presupuesto editable.":""}</small>`:''}</div>`:""}</article>`).join("")}${model.busy&&!model.approvedRun?`<article class="ai-message ai-user"><b>Vos</b><div>${e(model.question)}</div></article><p role="status">${model.catalogLoading?'Consultando el catálogo local…':'Consultando al proveedor… Espera máxima: 60 segundos.'} <button type="button" data-ai="cancel">Cancelar consulta</button></p>`:""}${model.approvedRun?`<p role="status">Carga en curso. <button type="button" data-ai="stop-approved" ${model.approvedRun.phase==='saving'?'disabled':''}>${model.approvedRun.phase==='saving'?'Guardando…':'Detener carga'}</button></p>`:''}</div>
    <details class="ai-context" ${model.contextOpen?"open":""}><summary>Contexto de la pantalla ${model.includeContext?(model.contextMode==="screen"?"· automático":"· editado"):"· sin incluir"}</summary><p>Se enviarán la consulta y el historial de esta conversación. Se incluyen la vista actual y las coincidencias del catálogo local con sus unidades, precios y fecha. En Presupuesto también se incluye el resumen de partidas. Podés desactivarlo o editar el texto antes de enviar. El chat se limpia al cambiar de sección, obra o presupuesto.</p><button class="btn" data-ai="capture" ${model.busy?"disabled":""}>Capturar / actualizar vista</button><label><input type="checkbox" name="ai-include-context" ${model.includeContext?"checked":""} ${model.busy?"disabled":""}> Incluir vista y catálogo local</label><textarea name="ai-context-text" aria-label="Datos de pantalla para enviar" maxlength="7000" ${model.busy?"disabled":""}>${e(model.context)}</textarea></details>
    <div class="ai-quick"><button data-ai="acu-workbench" ${model.busy||!canPlan()?"disabled":""}>▦ ACU · rendimientos y metrado</button><button data-ai="manage-import" ${model.busy||!editable()||state.remoteProject?"disabled":""}>✎ Editar / eliminar partidas</button><button data-ai="budget-import" ${model.busy||!editable()||state.remoteProject?"disabled":""}>▤ Cargar precios · texto / Excel</button><button data-ai="plan-import" ${model.busy||!canPlan()?"disabled":""}>＋ Crear partidas con ACU</button><button data-ai="quick" data-question="Explicame los datos de esta pantalla y señalá qué información falta.">▤ Explicar pantalla</button><button data-ai="quick" data-question="Ayudame a preparar una partida. Preguntame primero qué trabajo, unidad, cantidad y precio quiero cargar.">▱ Partida</button><button data-ai="quick" data-question="Ayudame a cargar un insumo. Preguntame su descripción, tipo, unidad y precio si no los conocés.">▣ Insumo</button></div>
    <form id="ai-question"><label class="ai-consent"><input type="checkbox" name="ai-consent" ${model.consent?"checked":""} ${model.busy?"disabled":""}> Autorizo enviar la consulta, el historial y los datos de pantalla incluidos a ${e(providerName)}. El uso puede generar cargos.</label><div class="ai-input-row"><label class="ai-sr-only" for="ai-prompt">Consulta al asistente</label><textarea id="ai-prompt" name="question" rows="1" placeholder="Preguntá sobre esta pantalla o pedí ayuda para cargar datos…" maxlength="2000" required ${model.busy?"disabled":""}>${e(model.question)}</textarea><button class="btn primary" ${model.busy||!model.configured||!model.consent?"disabled":""}>↵ Enviar</button></div></form>
    ${model.notice?`<small class="ai-usage" role="status">${e(model.notice)}</small>`:""}<p class="ai-error" role="alert">${e(model.error)}</p>${model.usage?`<small class="ai-usage">Última respuesta: ${model.usage.input??"—"} tokens de entrada · ${model.usage.output??"—"} de salida. Consultá los cargos en tu proveedor.</small>`:""}</section>`:""}`;
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
  async function send(){
    if(model.busy||!model.configured||!model.consent||!model.question.trim())return;
    const question=model.question.trim(),generation=model.generation;
    if(model.chatDraft?.status==='pending'&&model.chatDraft.origin===conversationScope()){
      if(isConversationCancel(question)){model.chatDraft=null;addReply(question,{answer:'Propuesta descartada. No se guardó ningún cambio.'});paint();return;}
      if(isConversationApproval(question)){await commitConversation(question);return;}
      if(conversationalRevision(question)||conversationIntent(state.view,question)){
        const draft=model.chatDraft;
        if(draft.kind==='budget_acu')await proposeBudget(question,draft.request,draft);
        else await proposeConversation(question,draft.kind,draft);
        return;
      }
    }
    const newWorkflow=conversationIntent(state.view,question);
    if(newWorkflow){await proposeConversation(question,newWorkflow);return;}

    const statusQuestion=/^(?:no (?:la|lo|las|los) (?:veo|encuentro)|no (?:veo|encuentro) (?:la partida|el acu|el pedido)|no (?:me )?aparece(?: la partida| el acu| el pedido)?|(?:y )?(?:se guardo|se cargo|se creo|la creaste|lo cargaste|donde quedo|donde esta)(?: la partida| el acu| el pedido)?)(?: en (?:la lista|la tabla|el presupuesto))?$/.test(fold(question));
    if(statusQuestion){if(!showActionState(question)){addReply(question,{answer:'No hay un guardado registrado en este chat. Indicame qué partida buscás para identificarla; no se realizará otra carga al consultar su estado.'});paint();}return;}
    const pendingApproval=resolvedPendingApproval(question,model.messages);
    if(pendingApproval!==null){model.question='';if(canPlan())await approveMessage(pendingApproval);else{model.error='Abrí un presupuesto propio en elaboración y cerrá los formularios pendientes para cargar este pedido.';paint();}return;}
    const last=model.messages.at(-1);
    if(last?.role==='assistant'&&last.approval&&isApprovalReply(question)){model.question='';model.notice=last.approval.message||'Este pedido ya fue procesado.';paint();return;}
    if(last?.actionError&&isApprovalReply(question)){model.question='';model.error='No hay un pedido ejecutable ni un guardado confirmado: '+last.actionError;paint();return;}
    if(model.pendingAction&&isApprovalReply(question)&&resolvedPendingApproval(question,[{role:'user',content:model.pendingAction.originalQuestion||''},model.pendingAction])!==null){
      if(!canPlan()){model.question='';model.error='Abrí un presupuesto propio en elaboración para cargar el pedido pendiente.';paint();return;}
      let index=model.messages.indexOf(model.pendingAction);
      if(index<0){model.messages.push({role:'user',content:model.pendingAction.originalQuestion},model.pendingAction);model.messages=model.messages.slice(-10);index=model.messages.length-1;}
      model.question='';await approveMessage(index);return;
    }
    const acuRequest=acuChatRequest(question,model.messages);
    if(canPlan()&&acuRequest){await proposeBudget(question,acuRequest);return;}
    if(isApprovalReply(question)&&(/\b(?:aprueb|aproba|aprobado|carga|aplica|guarda)/.test(fold(question))||model.lastAction)){
      if(!showActionState(question)){addReply(question,{answer:'No hay un pedido listo para cargar ni un guardado confirmado. Indicame qué partida querés crear o completar.'});paint();}return;
    }
    const history=model.messages.slice(-10).map(m=>({role:m.role,content:m.content}));
    const byteSize=items=>new TextEncoder().encode(items.map(m=>m.content).join("")).length;
    while(history.length&&byteSize([...history,{content:question}])>28000)history.splice(0,2);
    const messages=[...history,{role:"user",content:question}];
    if(model.includeContext&&model.contextMode==='screen')model.context=captureContext();
    const baseContext=actionContext()+'\n'+(model.includeContext?model.context:'No se compartieron datos de pantalla ni del catálogo. Pedí únicamente la información imprescindible.');
    model.busy=true;model.error='';model.notice='';const token=++queryToken;
    let request,catalogSnapshot=null;
    try {
      let context=baseContext;
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
        catalogSnapshot=catalog;context=groundedContext(baseContext,catalog,question,model.messages);
        model.catalogLoading=false;model.notice='Catálogo local consultado: se incluyen coincidencias reales, unidades y precios vigentes.';
      }
      if(token!==queryToken||generation!==model.generation)return;
      const mode=/(?:edit[aá]|modific[aá]|cambi[aá]|elimin[aá]|borr[aá]|quit[aá]).{0,60}partidas|partidas.{0,60}(?:eliminar|editar|borrar)/i.test(question)?"manage":/(?:cre[aá]r?|gener[aá]r?|arm[aá]r?|prepar[aá]r?|propon[eé]r?).{0,60}partidas|partidas.{0,60}(?:necesarias|obra nueva)/i.test(question)?"plan":undefined;
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
      if(catalogSnapshot&&/no (?:tengo|dispongo de|cuento con) acceso.{0,50}(?:cat[aá]logo|biblioteca)|no puedo acceder.{0,40}(?:cat[aá]logo|biblioteca)/i.test(parsed.answer)){parsed={answer:catalogAnswer(catalogSnapshot,question,model.messages),proposal:null};result.text=JSON.stringify(parsed);}
      const executionClaim=/\b(?:agregue|anadi|incorpore|cargue|guarde|cree|aplique)\b|\bse (?:creo|crearon|agrego|agregaron|cargo|cargaron|guardo|guardaron|incorporo|incorporaron|aplico|aplicaron)\b|\b(?:fue|fueron|ha sido|han sido) (?:cread[oa]s?|cargad[oa]s?|guardad[oa]s?|agregad[oa]s?)\b/.test(fold(parsed.answer));
      const loadTurn=isAction(parsed)||/\b(?:crea|crear|agrega|agregar|carga|cargar|completa|completar|incorpora|incorporar|aplica|aplicar)\b/.test(fold(question));
      if(executionClaim&&loadTurn&&!parsed.actionError){
        if(isAction(parsed))parsed.answer='La propuesta está preparada, pero todavía no se guardó. Podés aprobar su carga desde el chat.';
        else parsed={answer:'No hay un guardado confirmado para este pedido. La respuesta de la IA no incluyó una acción ejecutable; no se realizó una carga desde el chat.',proposal:null,actionError:'No se recibió una propuesta ejecutable.'};
      }
      addReply(question,parsed);model.notice=`Conexión con ${model.provider==="openai"?"OpenAI":"Claude"} verificada: se recibió una respuesta.`;model.usage={input:result.input_tokens,output:result.output_tokens};
    }catch(error){if(generation===model.generation&&token===queryToken)model.error=String(error);}
    finally{if(token===queryToken&&(!request||activeRequest===request)){activeRequest=null;model.busy=false;model.catalogLoading=false;paint();host.querySelector("#ai-prompt")?.focus();}}
  }
  host.addEventListener("click",async event=>{
    event.stopPropagation();const button=event.target.closest("[data-ai]");if(!button||button.disabled)return;
    const action=button.dataset.ai;model.error="";
    try{
      if(action==="acu-workbench"&&!model.busy){const request=acuChatRequest(model.question,model.messages);if(request)await openAcuRequest(request);else await acuWorkbench.open(model.question);}
      if((action==="review-acu-plan"||action==="review-acu-request")&&!model.busy)await reviewAcuMessage(Number(button.dataset.index));
      if(action==="manage-import"&&!model.busy)budgetImport.open("manage",model.question);
      if(action==="budget-import"&&!model.busy)budgetImport.open("prices",model.question);
      if(action==="plan-import"&&!model.busy)await acuWorkbench.open(model.question,null,"create");
      if(action==="review-plan"&&!model.busy){const message=model.messages[Number(button.dataset.index)];if(message?.planRows&&!message?.changeProposals)await reviewAcuMessage(Number(button.dataset.index));else budgetImport.openPlanRows(message?.planRows||[],message?.changeProposals||[]);}
      if(action==='approve-load')await approveMessage(Number(button.dataset.index));
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
      if(action==="clear"&&!model.busy){model.generation++;model.messages=[];model.lastAction=null;model.pendingAction=null;model.chatDraft=null;model.usage=null;model.question="";model.context="";model.includeContext=true;model.contextMode="screen";model.contextOpen=false;}
      if(action==="capture"&&!model.busy){model.context=captureContext();model.includeContext=true;model.contextMode="screen";model.contextOpen=true;}
      if(action==="forget"&&!model.busy){await invoke("ai_forget");Object.assign(model,{configured:false,settings:true,messages:[],lastAction:null,pendingAction:null,chatDraft:null,question:"",context:"",includeContext:true,contextMode:"screen",contextOpen:false,consent:false,usage:null,notice:""});model.generation++;}
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
    try{const status=await invoke("ai_configure",{provider,model:name,key});Object.assign(model,status,{settings:false,messages:[],lastAction:null,pendingAction:null,chatDraft:null,consent:false,error:"",usage:null,notice:"Configuración guardada en el llavero del sistema. Se restaurará al abrir CPOBRAS. La conexión se verificará al enviar una consulta."});model.generation++;}
    catch(error){model.error=String(error);}finally{model.busy=false;paint();}
  });
  syncContext();
  return {syncContext,isBusy:()=>model.busy,resumeAcuFromLibrary:()=>acuWorkbench.resumeFromLibrary(),configure:async()=>{
    if(model.busy)return;model.open=true;model.settings=true;model.error='';
    try{Object.assign(model,await invoke('ai_status'));}catch(error){model.error=String(error);}paint();
  }};
}
