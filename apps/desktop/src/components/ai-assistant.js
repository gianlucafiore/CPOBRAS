import {createAcuWorkbench} from "./ai-acu-workbench.js";
import {createAiBudgetImport} from "./ai-budget-import.js";
import {e} from "./helpers.js";
import {parseAiReply,draftFromProposal,screenContext,createAiRequest,budgetScreenContext} from "../services/ai-assistant.js";
const defaults={openai:"gpt-4.1-mini",anthropic:"claude-haiku-4-5"};
export function createAiAssistant({invoke,state,document,window,openModal,editable,loadEstimate,loadEstimates,openEstimate}) {
  const host=document.createElement("div");host.id="ai-assistant";document.body.append(host);
  const model={open:false,settings:false,configured:false,provider:"openai",model:defaults.openai,messages:[],question:"",busy:false,error:"",context:"",includeContext:true,contextMode:"screen",contextOpen:false,consent:false,scope:"",generation:0,usage:null,notice:""};
  const budgetImport=createAiBudgetImport({invoke,state,document,window,editable,loadEstimate,loadEstimates,openEstimate,canUseAi:()=>model.configured&&model.consent&&!model.busy});
  const acuWorkbench=createAcuWorkbench({invoke,state,document,window,loadEstimate,loadEstimates,openEstimate,canUseAi:()=>model.configured&&model.consent&&!model.busy});
  let activeRequest=null;
  const scope=()=>[state.view,state.projectId,state.estimateId].join(":");
  function syncContext(){
    budgetImport.syncScope();
    acuWorkbench.syncScope();
    const next=scope();
    if(model.scope!==next){activeRequest?.cancel();model.scope=next;model.generation++;model.messages=[];model.context="";model.includeContext=true;model.contextMode="screen";model.question="";model.error="";model.usage=null;model.notice="";}
    if(model.open&&model.contextMode==="screen"&&!state.navigating)model.context=captureContext();
    paint();
  }
  const captureContext=()=>budgetScreenContext(state,screenContext(document));
  const proposalBrief=index=>model.question.trim()||model.messages[index-1]?.content||"";
  const canPlan=()=>!!state.projectId&&!state.modal&&!state.pageDirty&&!state.remoteProject&&!state.projects.find(p=>p.id===state.projectId)?.read_only;
  function allowed(p){return !state.remoteProject&&!state.modal&&(p.kind!=="line"||editable());}
  function paint(){
    const providerName=model.provider==="openai"?"OpenAI":"Claude";
    host.innerHTML=`<button class="ai-launch btn" ${model.open?"hidden":""} data-ai="toggle" aria-expanded="${model.open}" aria-controls="ai-console" title="Asistente IA">✦ IA</button>${model.open?`<section id="ai-console" class="ai-console ${model.settings||!model.configured||model.contextOpen?"ai-expanded":""}" aria-label="Consola de asistente IA"><header class="ai-bar"><strong>✦ CPOBRAS IA</strong><span>${e(providerName)} · ${e(model.model)}</span><button data-ai="settings" title="Configurar proveedor" ${model.busy?"disabled":""}>⚙ Configurar</button><button data-ai="clear" title="Limpiar conversación" ${model.busy?"disabled":""}>Limpiar</button><button data-ai="toggle" aria-label="Cerrar consola">×</button></header>
    ${model.settings||!model.configured?`<form id="ai-settings" class="ai-settings"><div class="ai-settings-fields"><label>Proveedor<select name="provider" ${model.busy?"disabled":""}><option value="openai" ${model.provider==="openai"?"selected":""}>OpenAI</option><option value="anthropic" ${model.provider==="anthropic"?"selected":""}>Claude · Anthropic</option></select></label><label>Modelo<input name="model" value="${e(model.model)}" required maxlength="120" ${model.busy?"disabled":""}></label><label>Clave de API<input name="key" type="password" autocomplete="off" placeholder="${model.configured?"Dejá vacío para conservar la clave guardada":"Pegá tu clave de API"}" ${model.configured?"":"required"} maxlength="512" ${model.busy?"disabled":""}></label></div><p>El proveedor, modelo y clave se guardan en el llavero de credenciales del sistema, fuera de los proyectos y sus respaldos. El proveedor cobra el uso de API por separado de las suscripciones de chat.</p><button class="btn" ${model.busy?"disabled":""}>Guardar configuración</button>${model.configured?'<button type="button" data-ai="forget" class="btn">Borrar clave guardada y chat</button>':""}</form>`:""}
    <div class="ai-transcript" role="log" aria-label="Conversación IA" aria-live="polite">${!model.messages.length?'<div class="ai-welcome">Puedo ayudarte con:<br> • Explicar los datos de esta pantalla<br> • Preparar partidas e insumos para revisar<br> • Identificar datos que faltan en una carga<br><br>Las respuestas pueden contener errores. Los precios y rendimientos sugeridos requieren revisión.</div>':model.messages.map((m,index)=>`<article class="ai-message ai-${m.role}"><b>${m.role==="user"?"Vos":"Asistente"}</b><div>${e(m.answer||m.content)}</div>${m.planRows||m.changeProposals?`<div class="ai-proposal"><strong>${(m.planRows?.length||0)+(m.changeProposals?.length||0)} partidas / cambios propuestos</strong><p>Revisá cantidades, precios y rubros antes de crear las partidas.</p><button type="button" data-ai="review-plan" data-index="${index}" ${canPlan()&&!model.busy?"":"disabled"}>Revisar propuesta</button>${m.planRows?`<button type="button" data-ai="review-acu-plan" data-index="${index}" ${canPlan()&&!model.busy?"":"disabled"}>Preparar ACU con insumos</button>`:""}</div>`:""}${m.proposal?`<div class="ai-proposal"><strong>Borrador de ${m.proposal.kind==="line"?"partida":"insumo"}</strong><p>${e(m.proposal.description)} · ${e(m.proposal.unit)}${m.proposal.quantity!=null?` · Cantidad ${e(m.proposal.quantity)}`:""}${m.proposal.unit_price!=null?` · Precio ${e(m.proposal.unit_price)}`:""}</p><button class="btn" data-ai="draft" data-index="${index}" ${allowed(m.proposal)?"":"disabled"}>Abrir formulario para revisar</button><small>Completá los campos faltantes y guardá desde el formulario habitual.${!allowed(m.proposal)?" Cerrá otros formularios; las partidas requieren un presupuesto editable.":""}</small></div>`:""}</article>`).join("")}${model.busy?`<article class="ai-message ai-user"><b>Vos</b><div>${e(model.question)}</div></article><p role="status">Consultando al proveedor… Espera máxima: 60 segundos. <button type="button" data-ai="cancel">Cancelar consulta</button></p>`:""}</div>
    <details class="ai-context" ${model.contextOpen?"open":""}><summary>Contexto de la pantalla ${model.includeContext?(model.contextMode==="screen"?"· automático":"· editado"):"· sin incluir"}</summary><p>Se enviarán la consulta y el historial de esta conversación. Se incluye automáticamente la vista actual y, en Presupuesto, su resumen de partidas. Podés desactivarlo o editar el texto antes de enviar. El chat se limpia al cambiar de sección, obra o presupuesto.</p><button class="btn" data-ai="capture" ${model.busy?"disabled":""}>Capturar / actualizar vista</button><label><input type="checkbox" name="ai-include-context" ${model.includeContext?"checked":""} ${model.busy?"disabled":""}> Incluir estos datos</label><textarea name="ai-context-text" aria-label="Datos de pantalla para enviar" maxlength="7000" ${model.busy?"disabled":""}>${e(model.context)}</textarea></details>
    <div class="ai-quick"><button data-ai="acu-workbench" ${model.busy||!canPlan()?"disabled":""}>▦ ACU · rendimientos y metrado</button><button data-ai="manage-import" ${model.busy||!editable()||state.remoteProject?"disabled":""}>✎ Editar / eliminar partidas</button><button data-ai="budget-import" ${model.busy||!editable()||state.remoteProject?"disabled":""}>▤ Cargar precios · texto / Excel</button><button data-ai="plan-import" ${model.busy||!canPlan()?"disabled":""}>＋ Crear partidas con ACU</button><button data-ai="quick" data-question="Explicame los datos de esta pantalla y señalá qué información falta.">▤ Explicar pantalla</button><button data-ai="quick" data-question="Ayudame a preparar una partida. Preguntame primero qué trabajo, unidad, cantidad y precio quiero cargar.">▱ Partida</button><button data-ai="quick" data-question="Ayudame a cargar un insumo. Preguntame su descripción, tipo, unidad y precio si no los conocés.">▣ Insumo</button></div>
    <form id="ai-question"><label class="ai-consent"><input type="checkbox" name="ai-consent" ${model.consent?"checked":""} ${model.busy?"disabled":""}> Autorizo enviar la consulta, el historial y los datos de pantalla incluidos a ${e(providerName)}. El uso puede generar cargos.</label><div class="ai-input-row"><label class="ai-sr-only" for="ai-prompt">Consulta al asistente</label><textarea id="ai-prompt" name="question" rows="1" placeholder="Preguntá sobre esta pantalla o pedí ayuda para cargar datos…" maxlength="2000" required ${model.busy?"disabled":""}>${e(model.question)}</textarea><button class="btn primary" ${model.busy||!model.configured||!model.consent?"disabled":""}>↵ Enviar</button></div></form>
    ${model.notice?`<small class="ai-usage" role="status">${e(model.notice)}</small>`:""}<p class="ai-error" role="alert">${e(model.error)}</p>${model.usage?`<small class="ai-usage">Última respuesta: ${model.usage.input??"—"} tokens de entrada · ${model.usage.output??"—"} de salida. Consultá los cargos en tu proveedor.</small>`:""}</section>`:""}`;
    const log=host.querySelector(".ai-transcript");if(log)log.scrollTop=log.scrollHeight;
  }
  async function send(){
    if(model.busy||!model.configured||!model.consent||!model.question.trim())return;
    const question=model.question.trim(),generation=model.generation;
    const normalized=question.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    if(canPlan()&&/^(?:(?:podes|podrias|por favor)\s+)?(?:arma(?:me)?|armar|completa(?:me)?|completar|crea(?:me)?|crear|carga(?:me)?|cargar|calcula(?:me)?|calcular|dimensiona(?:me)?|dimensionar|rellena(?:me)?|rellenar)\b/.test(normalized)&&/\b(?:acu|rendimientos?|insumos?|revoques?|mamposteria|dosificacion|metrado)\b/.test(normalized)){
      try{await acuWorkbench.open(question);model.notice="Revisá las partidas y los insumos en el panel de ACU; desde allí se preparan las propuestas.";}catch(error){model.error=String(error);}paint();return;
    }
    const history=model.messages.slice(-10).map(m=>({role:m.role,content:m.content}));
    const byteSize=items=>new TextEncoder().encode(items.map(m=>m.content).join("")).length;
    while(history.length&&byteSize([...history,{content:question}])>28000)history.splice(0,2);
    const messages=[...history,{role:"user",content:question}];
    if(model.includeContext&&model.contextMode==="screen")model.context=captureContext();
    const context=model.includeContext?model.context:"No se compartió contexto de la pantalla. Pedí los datos necesarios.";
    model.busy=true;model.error="";model.notice="";
    let request;
    try {
      const mode=/(?:edit[aá]|modific[aá]|cambi[aá]|elimin[aá]|borr[aá]|quit[aá]).{0,60}partidas|partidas.{0,60}(?:eliminar|editar|borrar)/i.test(question)?"manage":/(?:cre[aá]r?|gener[aá]r?|arm[aá]r?|prepar[aá]r?|propon[eé]r?).{0,60}partidas|partidas.{0,60}(?:necesarias|obra nueva)/i.test(question)?"plan":undefined;
      request=createAiRequest(invoke,{messages,context,...(mode?{mode}:{})});activeRequest=request;paint();
      const result=await request.promise;
      if(generation!==model.generation)return;
      const parsed=parseAiReply(result.text);
      model.messages.push({role:"user",content:question},{role:"assistant",content:new TextEncoder().encode(result.text).length>11000?JSON.stringify({answer:parsed.answer.slice(0,2000),proposed_lines:parsed.planRows?.length||0}):result.text,...parsed});model.messages=model.messages.slice(-10);model.question="";model.notice=`Conexión con ${model.provider==="openai"?"OpenAI":"Claude"} verificada: se recibió una respuesta.`;model.usage={input:result.input_tokens,output:result.output_tokens};
    }catch(error){if(generation===model.generation)model.error=String(error);}
    finally{if(!request||activeRequest===request){activeRequest=null;model.busy=false;paint();host.querySelector("#ai-prompt")?.focus();}}
  }
  host.addEventListener("click",async event=>{
    event.stopPropagation();const button=event.target.closest("[data-ai]");if(!button||button.disabled)return;
    const action=button.dataset.ai;model.error="";
    try{
      if(action==="acu-workbench"&&!model.busy)await acuWorkbench.open(model.question);
      if(action==="review-acu-plan"&&!model.busy)await acuWorkbench.open(proposalBrief(Number(button.dataset.index)),model.messages[Number(button.dataset.index)]?.planRows||[]);
      if(action==="manage-import"&&!model.busy)budgetImport.open("manage",model.question);
      if(action==="budget-import"&&!model.busy)budgetImport.open("prices",model.question);
      if(action==="plan-import"&&!model.busy)await acuWorkbench.open(model.question,null,"create");
      if(action==="review-plan"&&!model.busy){const message=model.messages[Number(button.dataset.index)];if(message?.planRows&&!message?.changeProposals)await acuWorkbench.open(proposalBrief(Number(button.dataset.index)),message.planRows);else budgetImport.openPlanRows(message?.planRows||[],message?.changeProposals||[]);}
      if(action==="cancel")activeRequest?.cancel();
      if(action==="toggle"){
        model.open=!model.open;
        if(model.open&&model.contextMode==="screen")model.context=captureContext();
        if(model.open&&!model.configured){model.notice="Leyendo configuración guardada…";paint();const status=await invoke("ai_status");Object.assign(model,status);model.notice=status.configured?"Configuración de IA restaurada desde el llavero del sistema.":"";if(status.storage_error)model.error=status.storage_error;}
      }
      if(action==="settings")model.settings=!model.settings;
      if(action==="clear"&&!model.busy){model.generation++;model.messages=[];model.usage=null;model.question="";model.context="";model.includeContext=true;model.contextMode="screen";model.contextOpen=false;}
      if(action==="capture"&&!model.busy){model.context=captureContext();model.includeContext=true;model.contextMode="screen";model.contextOpen=true;}
      if(action==="forget"&&!model.busy){await invoke("ai_forget");Object.assign(model,{configured:false,settings:true,messages:[],question:"",context:"",includeContext:true,contextMode:"screen",contextOpen:false,consent:false,usage:null,notice:""});model.generation++;}
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
  host.addEventListener("keydown",event=>{event.stopPropagation();if(event.key==="Escape"){model.open=false;paint();}if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)&&event.target.name==="question"){event.preventDefault();void send();}});
  host.addEventListener("submit",async event=>{
    event.preventDefault();event.stopPropagation();
    if(event.target.id==="ai-question"){await send();return;}
    if(event.target.id!=="ai-settings"||model.busy)return;
    const form=event.target,provider=form.elements.provider.value,name=form.elements.model.value,key=form.elements.key.value;
    model.busy=true;form.elements.key.value="";
    try{const status=await invoke("ai_configure",{provider,model:name,key});Object.assign(model,status,{settings:false,messages:[],consent:false,error:"",usage:null,notice:"Configuración guardada en el llavero del sistema. Se restaurará al abrir CPOBRAS. La conexión se verificará al enviar una consulta."});model.generation++;}
    catch(error){model.error=String(error);}finally{model.busy=false;paint();}
  });
  syncContext();
  return {syncContext};
}
