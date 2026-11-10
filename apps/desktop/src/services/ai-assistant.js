// Only this allowlist can become a draft. Never execute model output as code/HTML.
export function parseAiReply(text) {
  let value;
  try { value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"")); } catch { return {answer:text,proposal:null}; }
  if (!value || typeof value!=="object" || typeof value.answer!=="string") return {answer:text,proposal:null};
  const raw=value.proposal;
  if (!raw || !["line","resource"].includes(raw.kind) || typeof raw.description!=="string" || !raw.description.trim() || raw.description.length>500 || typeof raw.unit!=="string" || !raw.unit.trim() || raw.unit.length>30) return {answer:value.answer,proposal:null};
  const proposal={kind:raw.kind,description:raw.description.trim(),unit:raw.unit.trim()};
  for (const key of ["quantity","unit_price"]) {
    if (raw[key]==null) continue;
    const val=String(raw[key]);
    if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(val)) return {answer:value.answer,proposal:null};
    proposal[key]=val;
  }
  if (raw.resource_type!=null) {
    if (!["material","labor","equipment","subcontract"].includes(raw.resource_type)) return {answer:value.answer,proposal:null};
    proposal.resource_type=raw.resource_type;
  }
  return {answer:value.answer,proposal};
}
export function draftFromProposal(p) {
  const safe=parseAiReply(JSON.stringify({answer:"",proposal:p})).proposal;
  if (!safe) throw new Error("La propuesta no tiene datos válidos para un formulario");
  return {kind:safe.kind,record:safe.kind==="line"
    ? {description:safe.description,unit:safe.unit,...(safe.quantity!=null?{quantity:safe.quantity}:{}),...(safe.unit_price!=null?{unit_cost:safe.unit_price}:{})}
    : {description:safe.description,unit:safe.unit,kind:safe.resource_type||"material",...(safe.unit_price!=null?{price:safe.unit_price}:{})}};
}
// Read only rendered text and non-secret form values. No DB calls, localStorage or hidden DOM.
export function screenContext(document) {
  const root=document.querySelector("#app");
  if (!root) return "";
  const excluded='script,style,nav,.app-header,button,[hidden],[aria-hidden="true"],input,textarea,select';
  const parts=[];
  const walker=document.createTreeWalker(root,4);
  let node;
  while ((node=walker.nextNode())) {
    const parent=node.parentElement;
    if (!parent || parent.closest(excluded) || !parent.getClientRects().length) continue;
    const text=node.textContent.trim().replace(/\s+/g," ");
    if (text) parts.push(text);
  }
  for (const input of root.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="file"]),textarea,select')) {
    if (!input.getClientRects().length || /key|token|secret|password/i.test(input.name||"")) continue;
    const label=input.closest("label")?.textContent.trim().slice(0,80)||input.getAttribute("aria-label")||input.name;
    const value=input.tagName==="SELECT"?input.selectedOptions?.[0]?.textContent:input.value;
    if (label && value) parts.push(`${label}: ${value}`);
  }
  const text=parts.join(" | ");
  return text.length>7000?`${text.slice(0,6900)}\n[Vista recortada: hay más filas o datos que no se incluyeron.]`:text;
}

// UI watchdog is independent from native HTTP timeouts and IPC task failures.
export function createAiRequest(invoke,args,options={}) {
  const requestId=options.requestId??globalThis.crypto.randomUUID();
  const schedule=options.setTimer??globalThis.setTimeout;
  const unschedule=options.clearTimer??globalThis.clearTimeout;
  let pending=true,dispatched=false,timer,resolveRequest,rejectRequest;
  const promise=new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject;});
  function finish(error,result){
    if(!pending)return;pending=false;unschedule(timer);
    if(error)rejectRequest(error);else resolveRequest(result);
  }
  function cancel(message="Consulta cancelada. Si el proveedor ya la recibió, puede haber consumo."){
    if(!pending)return;
    finish(new Error(message));
    if(dispatched)void Promise.resolve().then(()=>invoke("ai_cancel",{requestId})).catch(()=>{});
  }
  timer=schedule(()=>cancel("La conexión no respondió a tiempo. Se canceló la espera y se conservó tu consulta. No hubo reintento automático."),options.timeoutMs??65000);
  void Promise.resolve().then(()=>{
    if(!pending)return;
    dispatched=true;
    return invoke("ai_chat",{...args,requestId});
  }).then(result=>{if(pending)finish(null,result);},error=>finish(error));
  return {promise,cancel,requestId};
}

// Only the budget currently displayed, not the catalog or unrelated projects.
// Counts use all loaded lines, even when DOM rows are folded or the text is capped.
export function budgetScreenContext(state,visibleText="") {
  if(state.view!=="workspace"||!state.estimateId)return visibleText;
  const lines=state.lines||[];
  const priceState=value=>{
    if(value==null||String(value).trim()==="")return "sin_dato";
    const text=String(value).trim();
    if(!/^[+-]?\d+(?:[.,]\d+)?$/.test(text))return "sin_dato";
    if(!/[1-9]/.test(text))return "cero";
    return text.startsWith("-")?"negativo":"positivo";
  };
  const counts={total_partidas:lines.length,precio_cero:0,precio_positivo:0,precio_negativo:0,precio_sin_dato:0};
  for(const line of lines){const status=priceState(line.unit_cost);counts[{cero:"precio_cero",positivo:"precio_positivo",negativo:"precio_negativo",sin_dato:"precio_sin_dato"}[status]]++;}
  const record=line=>({codigo:line.code||"",descripcion:String(line.description||"").slice(0,200),unidad:line.unit,cantidad:line.quantity,precio_unitario:line.unit_cost??null,estado_precio:priceState(line.unit_cost)});
  const estimate=state.estimates?.find(x=>x.id===state.estimateId);
  const selected=lines.find(x=>x.id===state.selectedLineId);
  const parts=["PRESUPUESTO ACTUAL. Resumen calculado por CPOBRAS sobre TODAS las partidas cargadas (no sobre el recorte de texto):",JSON.stringify({presupuesto:estimate?.title,moneda:estimate?.currency,...counts}),"Precio cero no demuestra un dato faltante: puede ser intencional. Distinguí esa condición de precio sin dato."];
  if(selected)parts.push("Partida seleccionada: "+JSON.stringify(record(selected)));
  parts.push("Detalle de partidas (puede recortarse; usá los conteos anteriores para preguntas sobre todo el presupuesto):");
  let included=0;
  for(const line of lines){const row=JSON.stringify(record(line));if(parts.join("\n").length+row.length>5600)break;parts.push(row);included++;}
  parts.push(`Detalle incluido: ${included} de ${lines.length} partidas. Los conteos del resumen incluyen las ${lines.length}.`);
  const remaining=6900-parts.join("\n").length;
  if(remaining>100&&visibleText)parts.push("Texto adicional de la vista (puede estar recortado):\n"+visibleText.slice(0,remaining-80));
  return parts.join("\n");
}
