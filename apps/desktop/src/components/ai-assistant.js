import {e} from "./helpers.js";
import {parseAiReply,draftFromProposal,screenContext,createAiRequest} from "../services/ai-assistant.js";
const defaults={openai:"gpt-4.1-mini",anthropic:"claude-haiku-4-5"};
export function createAiAssistant({invoke,state,document,window,openModal,editable}) {
  const host=document.createElement("div");host.id="ai-assistant";document.body.append(host);
  const model={open:false,settings:false,configured:false,provider:"openai",model:defaults.openai,messages:[],question:"",busy:false,error:"",context:"",includeContext:false,contextOpen:false,consent:false,scope:"",generation:0,usage:null,notice:""};
  let activeRequest=null;
  const scope=()=>[state.view,state.projectId,state.estimateId].join(":");
  function syncContext(){
    const next=scope();
    if(model.scope!==next){activeRequest?.cancel();model.scope=next;model.generation++;model.messages=[];model.context="";model.includeContext=false;model.question="";model.error="";model.usage=null;model.notice="";}
    paint();
  }
  function allowed(p){return !state.remoteProject&&!state.modal&&(p.kind!=="line"||editable());}
  function paint(){
    const providerName=model.provider==="openai"?"OpenAI":"Claude";
    host.innerHTML=`<button class="ai-launch btn" ${model.open?"hidden":""} data-ai="toggle" aria-expanded="${model.open}" aria-controls="ai-console" title="Asistente IA">✦ IA</button>${model.open?`<section id="ai-console" class="ai-console ${model.settings||!model.configured||model.contextOpen?"ai-expanded":""}" aria-label="Consola de asistente IA"><header class="ai-bar"><strong>✦ CPOBRAS IA</strong><span>${e(providerName)} · ${e(model.model)}</span><button data-ai="settings" title="Configurar proveedor" ${model.busy?"disabled":""}>⚙ Configurar</button><button data-ai="clear" title="Limpiar conversación" ${model.busy?"disabled":""}>Limpiar</button><button data-ai="toggle" aria-label="Cerrar consola">×</button></header>
    ${model.settings||!model.configured?`<form id="ai-settings" class="ai-settings"><div class="ai-settings-fields"><label>Proveedor<select name="provider" ${model.busy?"disabled":""}><option value="openai" ${model.provider==="openai"?"selected":""}>OpenAI</option><option value="anthropic" ${model.provider==="anthropic"?"selected":""}>Claude · Anthropic</option></select></label><label>Modelo<input name="model" value="${e(model.model)}" required maxlength="120" ${model.busy?"disabled":""}></label><label>Clave de API<input name="key" type="password" autocomplete="off" placeholder="${model.configured?"Ingresá la clave para reemplazar la conexión":"Pegá tu clave de API"}" required maxlength="512" ${model.busy?"disabled":""}></label></div><p>La clave se conserva solo durante esta sesión, fuera de la base y los respaldos. El proveedor cobra el uso de API por separado de las suscripciones de chat.</p><button class="btn" ${model.busy?"disabled":""}>Usar conexión</button>${model.configured?'<button type="button" data-ai="forget" class="btn">Desconectar y borrar chat</button>':""}</form>`:""}
    <div class="ai-transcript" role="log" aria-label="Conversación IA" aria-live="polite">${!model.messages.length?'<div class="ai-welcome">Puedo ayudarte con:<br> • Explicar los datos de esta pantalla<br> • Preparar partidas e insumos para revisar<br> • Identificar datos que faltan en una carga<br><br>Las respuestas pueden contener errores. Los precios y rendimientos sugeridos requieren revisión.</div>':model.messages.map((m,index)=>`<article class="ai-message ai-${m.role}"><b>${m.role==="user"?"Vos":"Asistente"}</b><div>${e(m.answer||m.content)}</div>${m.proposal?`<div class="ai-proposal"><strong>Borrador de ${m.proposal.kind==="line"?"partida":"insumo"}</strong><p>${e(m.proposal.description)} · ${e(m.proposal.unit)}${m.proposal.quantity!=null?` · Cantidad ${e(m.proposal.quantity)}`:""}${m.proposal.unit_price!=null?` · Precio ${e(m.proposal.unit_price)}`:""}</p><button class="btn" data-ai="draft" data-index="${index}" ${allowed(m.proposal)?"":"disabled"}>Abrir formulario para revisar</button><small>Completá los campos faltantes y guardá desde el formulario habitual.${!allowed(m.proposal)?" Cerrá otros formularios; las partidas requieren un presupuesto editable.":""}</small></div>`:""}</article>`).join("")}${model.busy?`<article class="ai-message ai-user"><b>Vos</b><div>${e(model.question)}</div></article><p role="status">Consultando al proveedor… Espera máxima: 60 segundos. <button type="button" data-ai="cancel">Cancelar consulta</button></p>`:""}</div>
    <details class="ai-context" ${model.contextOpen?"open":""}><summary>Contexto de la pantalla ${model.includeContext?"· incluido":"· sin incluir"}</summary><p>Se enviarán la consulta y el historial de esta conversación. Podés agregar el texto de la vista actual; revisalo antes de compartirlo. El chat se limpia al cambiar de sección, obra o presupuesto.</p><button class="btn" data-ai="capture" ${model.busy?"disabled":""}>Capturar / actualizar vista</button><label><input type="checkbox" name="ai-include-context" ${model.includeContext?"checked":""} ${!model.context||model.busy?"disabled":""}> Incluir estos datos</label><textarea name="ai-context-text" aria-label="Datos de pantalla para enviar" maxlength="7000" ${model.busy?"disabled":""}>${e(model.context)}</textarea></details>
    <div class="ai-quick"><button data-ai="quick" data-question="Explicame los datos de esta pantalla y señalá qué información falta.">▤ Explicar pantalla</button><button data-ai="quick" data-question="Ayudame a preparar una partida. Preguntame primero qué trabajo, unidad, cantidad y precio quiero cargar.">▱ Partida</button><button data-ai="quick" data-question="Ayudame a cargar un insumo. Preguntame su descripción, tipo, unidad y precio si no los conocés.">▣ Insumo</button></div>
    <form id="ai-question"><label class="ai-consent"><input type="checkbox" name="ai-consent" ${model.consent?"checked":""} ${model.busy?"disabled":""}> Autorizo enviar la consulta, el historial y el contexto incluido a ${e(providerName)}. El uso puede generar cargos.</label><div class="ai-input-row"><label class="ai-sr-only" for="ai-prompt">Consulta al asistente</label><textarea id="ai-prompt" name="question" rows="1" placeholder="Preguntá sobre esta pantalla o pedí ayuda para cargar datos…" maxlength="2000" required ${model.busy?"disabled":""}>${e(model.question)}</textarea><button class="btn primary" ${model.busy||!model.configured||!model.consent?"disabled":""}>↵ Enviar</button></div></form>
    ${model.notice?`<small class="ai-usage" role="status">${e(model.notice)}</small>`:""}<p class="ai-error" role="alert">${e(model.error)}</p>${model.usage?`<small class="ai-usage">Última respuesta: ${model.usage.input??"—"} tokens de entrada · ${model.usage.output??"—"} de salida. Consultá los cargos en tu proveedor.</small>`:""}</section>`:""}`;
    const log=host.querySelector(".ai-transcript");if(log)log.scrollTop=log.scrollHeight;
  }
  async function send(){
    if(model.busy||!model.configured||!model.consent||!model.question.trim())return;
    const question=model.question.trim(),generation=model.generation;
    const history=model.messages.slice(-10).map(m=>({role:m.role,content:m.content}));
    const byteSize=items=>new TextEncoder().encode(items.map(m=>m.content).join("")).length;
    while(history.length&&byteSize([...history,{content:question}])>28000)history.splice(0,2);
    const messages=[...history,{role:"user",content:question}];
    const context=model.includeContext?model.context:"No se compartió contexto de la pantalla. Pedí los datos necesarios.";
    model.busy=true;model.error="";model.notice="";
    let request;
    try {
      request=createAiRequest(invoke,{messages,context});activeRequest=request;paint();
      const result=await request.promise;
      if(generation!==model.generation)return;
      const parsed=parseAiReply(result.text);
      model.messages.push({role:"user",content:question},{role:"assistant",content:result.text,...parsed});model.messages=model.messages.slice(-10);model.question="";model.notice=`Conexión con ${model.provider==="openai"?"OpenAI":"Claude"} verificada: se recibió una respuesta.`;model.usage={input:result.input_tokens,output:result.output_tokens};
    }catch(error){if(generation===model.generation)model.error=String(error);}
    finally{if(!request||activeRequest===request){activeRequest=null;model.busy=false;paint();host.querySelector("#ai-prompt")?.focus();}}
  }
  host.addEventListener("click",async event=>{
    event.stopPropagation();const button=event.target.closest("[data-ai]");if(!button||button.disabled)return;
    const action=button.dataset.ai;model.error="";
    try{
      if(action==="cancel")activeRequest?.cancel();
      if(action==="toggle"){
        model.open=!model.open;
        if(model.open&&!model.configured){const status=await invoke("ai_status");Object.assign(model,status);}
      }
      if(action==="settings")model.settings=!model.settings;
      if(action==="clear"&&!model.busy){model.generation++;model.messages=[];model.usage=null;model.question="";model.context="";model.includeContext=false;model.contextOpen=false;}
      if(action==="capture"&&!model.busy){model.context=screenContext(document);model.includeContext=false;model.contextOpen=true;}
      if(action==="forget"&&!model.busy){await invoke("ai_forget");Object.assign(model,{configured:false,settings:true,messages:[],question:"",context:"",includeContext:false,contextOpen:false,consent:false,usage:null,notice:""});model.generation++;}
      if(action==="quick"&&!model.busy)model.question=button.dataset.question;
      if(action==="draft"){
        const proposal=model.messages[Number(button.dataset.index)]?.proposal;
        if(!proposal||!allowed(proposal))throw new Error("Abrí un presupuesto editable y cerrá otros formularios antes de usar la propuesta");
        const draft=draftFromProposal(proposal);openModal(draft.kind,draft.record);state.modalDirty=true;model.open=false;
      }
    }catch(error){model.error=String(error);}
    paint();
  });
  host.addEventListener("toggle",event=>{if(event.target.isConnected&&event.target.matches?.(".ai-context"))model.contextOpen=event.target.open;},true);
  host.addEventListener("input",event=>{event.stopPropagation();const t=event.target;if(t.name==="question")model.question=t.value;if(t.name==="ai-context-text")model.context=t.value;});
  host.addEventListener("change",event=>{
    event.stopPropagation();const t=event.target;
    if(t.name==="ai-consent"){model.consent=t.checked;const button=host.querySelector('#ai-question button');if(button)button.disabled=model.busy||!model.configured||!model.consent;}
    if(t.name==="ai-include-context"){model.includeContext=t.checked;host.querySelector(".ai-context summary").textContent=`Contexto de la pantalla · ${model.includeContext?"incluido":"sin incluir"}`;}
    if(t.name==="provider")host.querySelector('[name="model"]').value=defaults[t.value];
  });
  host.addEventListener("keydown",event=>{event.stopPropagation();if(event.key==="Escape"){model.open=false;paint();}if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)&&event.target.name==="question"){event.preventDefault();void send();}});
  host.addEventListener("submit",async event=>{
    event.preventDefault();event.stopPropagation();
    if(event.target.id==="ai-question"){await send();return;}
    if(event.target.id!=="ai-settings"||model.busy)return;
    const form=event.target,provider=form.elements.provider.value,name=form.elements.model.value,key=form.elements.key.value;
    model.busy=true;form.elements.key.value="";
    try{const status=await invoke("ai_configure",{provider,model:name,key});Object.assign(model,status,{settings:false,messages:[],consent:false,error:"",usage:null,notice:"Clave cargada para esta sesión. La conexión se verificará al enviar una consulta."});model.generation++;}
    catch(error){model.error=String(error);}finally{model.busy=false;paint();}
  });
  syncContext();
  return {syncContext};
}
