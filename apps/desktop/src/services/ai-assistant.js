import {parsePlan,changeProposals} from "./ai-budget-import.js";
const acuUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function readAcuRequest(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['mode','brief','line_ids'].includes(key)))throw new Error('Usá una solicitud de ACU con objetivo, criterios y selección de partidas válidos.');
 if(!['fill','create'].includes(raw.mode)||typeof raw.brief!=='string'||!raw.brief.trim()||raw.brief.length>3000)throw new Error('Indicá completar ACU existentes o crear partidas con ACU, con criterios de hasta 3000 caracteres.');
 const hasIds=Object.hasOwn(raw,'line_ids');
 const lineIds=hasIds?(raw.mode==='create'&&raw.line_ids===null?[]:raw.line_ids):[];
 if(raw.mode==='create'&&Array.isArray(lineIds)&&lineIds.length)throw new Error('Una solicitud de partidas nuevas no puede indicar partidas existentes.');
 if(!Array.isArray(lineIds)||lineIds.length>60||lineIds.some(id=>typeof id!=='string'||!acuUuid.test(id)))throw new Error('La selección de partidas para ACU no es válida. Volvé a seleccionar las partidas en la preparación.');
 const normalized=lineIds.map(id=>id.toLowerCase());if(new Set(normalized).size!==normalized.length)throw new Error('La solicitud de ACU contiene partidas repetidas.');
 return {mode:raw.mode,brief:raw.brief.trim(),lineIds:normalized};
}
const chatFold=text=>String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const materialToLine=text=>!(/\b(?:a|en)\s+(?:la|el)\s+(?:biblioteca|catalogo)\b/.test(text))&&/\b(?:agrega(?:r|me)?|agregues|carga(?:r|me)?|cargues|asigna(?:r|me)?|asignes)\b.{1,180}\b(?:a|en)\s+(?:(?:la|una|esta|esa)\s+)?partida\b/.test(text);
const acuTopic=text=>/\b(?:acus?|composicion(?:es)?|rendimientos?|consumos?|metrado|dosificacion)\b/.test(text)||/\binsumos?\b.*\b(?:partidas?|presupuesto)\b|\bpartidas?\b.*\binsumos?\b/.test(text)||materialToLine(text);
const constructionCriteria=text=>/\b(?:acus?|partidas?|presupuesto|tabiques?|revoques?|mamposteria|muros?|ladrillos?|hormigon|mortero|cemento|arena|cal|techo|cubierta|perfil|estructura|dosificacion|espesor|desperdicio|rendimientos?|consumos?|metrado|caras?|jornal|medidas?|largo|ancho|alto|altura|m2|m3|metros?)\b/.test(text);
function messageText(message){
 if(typeof message?.answer==='string')return message.answer;
 const text=typeof message?.content==='string'?message.content:'';
 try{const parsed=JSON.parse(text);if(typeof parsed?.answer==='string')return parsed.answer;}catch{}
 return text;
}
function previousRequest(message){
 const r=message?.acuRequest;if(!r)return null;
 try{return readAcuRequest({mode:r.mode,brief:r.brief,...(r.mode==='fill'?{line_ids:r.lineIds??[]}:{...(r.lineIds?.length?{line_ids:r.lineIds}:{})})});}catch{return null;}
}
function acuMode(text,fallback='fill'){
 if(/\b(?:no|sin)\s+(?:crees|crear|crear nuevas|generes|generar|agregues|agregar)\b/.test(text))return 'fill';
 if(/\b(?:completa|completar|rellena|rellenar|carga|cargar|asigna|asignar)\b.*\b(?:existentes|cargadas|faltantes|sin acu)\b/.test(text))return 'fill';
 const newTargets=/\b(?:partidas? nuevas?|nuevas? partidas?|presupuesto nuevo|obra nueva)\b/.test(text);
 if(materialToLine(text)&&!newTargets)return 'fill';
 if(!newTargets&&/\b(?:partidas?\s+(?:ya\s+)?existentes|partidas?\b.{0,80}\bya existen|acus?\s+vacios?)\b/.test(text))return 'fill';
 if(/\b(?:crea(?:r|me)?|genera(?:r|me)?|arma(?:r|me)?|prepara(?:r|me)?|agrega(?:r|me)?|incorpora(?:r|me)?)\s+(?:(?:las|unas|varias|algunas|nuevas|estas|todas|una|un|el|\d+)\s+)*(?:partidas?|presupuesto)\b/.test(text)||/\b(?:partidas? nuevas?|nuevas? partidas?|presupuesto nuevo|obra nueva)\b/.test(text))return 'create';
 return fallback;
}
export function isApprovalReply(question){
 if(typeof question!=='string'||!question.trim()||/[¿?]/.test(question))return false;
 const affirmation='(?:si|dale|adelante|de acuerdo)';
 const lead='(?:(?:si|dale|adelante|de acuerdo|perfecto|bueno|ok|bien)\\s+)*';
 const approve='(?:apruebo|aprobar|aproba(?:lo|la|los|las)?|aprobado)';
 const load='(?:carga(?:r|lo|la|los|las)?|aplica(?:r|lo|la|los|las)?|completa(?:r|lo|la|los|las)?|guarda(?:r|lo|la|los|las)?|hacelo|hazlo|procede)';
 const explicit=new RegExp('^(?:'+affirmation+'|'+lead+'(?:'+approve+'(?:\\s+(?:y\\s+)?'+load+')?|confirmado|'+load+')(?:\\s+directamente)?)(?:\\s+por favor)?$');
 return explicit.test(chatFold(question));
}
// Resolve a fresh, explicit user confirmation against the last visible card.
// This helper grants no permission: the caller must still verify the current
// project, editability, consent and one-use local approval before executing it.
// Call it before appending the new user message; never search older proposals.
export function resolvedPendingApproval(question,messages=[]){
 if(typeof question!=='string'||!question.trim()||/[¿?]/.test(question)||!Array.isArray(messages)||messages.length<2)return null;
 const index=messages.length-1,message=messages[index];
 if(message?.role!=='assistant'||messages[index-1]?.role!=='user'||Object.hasOwn(message,'approval')||Object.hasOwn(message,'changeProposals'))return null;
 if(!isApprovalReply(question))return null;
 if(previousRequest(message))return index;
 const safeLine=row=>!!row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.description==='string'&&!!row.description.trim()&&row.description.length<=500&&typeof row.unit==='string'&&!!row.unit.trim()&&row.unit.length<=30;
 if(Array.isArray(message.planRows)&&message.planRows.length>0&&message.planRows.length<=60&&message.planRows.every(row=>safeLine(row)&&(row.target==null||row.target==='new')&&(row.operation==null||row.operation==='create')&&(row.action==null||row.action==='create')))return index;
 if(message.proposal?.kind==='line'&&safeLine(message.proposal))return index;
 return null;
}
// Route only a concrete preparation request. This opens a review workflow; it never writes.
export function acuChatRequest(question,messages=[]){
 if(typeof question!=='string'||!question.trim())return null;
 const q=chatFold(question),history=Array.isArray(messages)?messages.slice(-8):[],last=history.at(-1);
 const boundary=history.findLastIndex(message=>message?.role==='assistant'&&Object.hasOwn(message,'approval'));
 const recent=history.slice(boundary+1),prior=last&&Object.hasOwn(last,'approval')?null:previousRequest(last);
 const action='(?:prepara|completa|arma|crea|carga|calcula|dimensiona|rellena|genera|propone|asigna|incorpora|aplica|reutiliza|usa|agrega|hace)(?:r(?:lo|la|los|las|le|les)?|me|nos|lo|la|los|las|le|les|s)?';
 const direct=new RegExp('^(?:(?:por favor|podes|podrias|me podes|me podrias|quiero(?: que)?|necesito(?: que)?|quisiera(?: que)?|te pido que|solo|solamente|ahora|ya|me|nos)\\s+)*'+action+'\\b');
 const segments=[q,...question.split(/[;,]/).slice(1).map(chatFold)];
 const requestedSubjunctive=/^(?:quiero|necesito|quisiera|te pido)\s+que\s+(?:(?:me|nos)\s+)?(?:cargues|completes|armes|prepares|hagas|agregues|asignes)\b/;
 const explicit=segments.some(segment=>direct.test(segment)||requestedSubjunctive.test(segment));
 const scope=acuTopic(q)||/\b(?:dimensiona|dimensionar|calcula|calcular)\b.*\b(?:revoques?|mamposteria|muros?)\b/.test(q);
 const catalogOnly=/\b(?:a|en)\s+(?:la|el)\s+(?:biblioteca|catalogo)\b/.test(q)&&!acuTopic(q);
 if(/\bpor que\b/.test(q)||/^(?:que|cual|cuales|cuanto|cuantos|cuanta|cuantas|como|donde|cuando|para que)\b/.test(q)||catalogOnly)return null;
 const shortAction=/^(?:(?:perfecto|si|dale|bueno|ok|bien|de acuerdo|adelante)\s+)*(?:hacelo|hazlo|hace|cargalos|cargalas|cargalo|cargala|completalos|completalas|completalo|completala|preparalos|preparalas|armalos|armalas|aplicalos|aplicalas|procede|continua|segui)(?:\s+por favor)?$/.test(q);
 const bare=/^(?:si|dale|perfecto|ok|bueno|de acuerdo|adelante)$/.test(q);
 const explicitApproval=isApprovalReply(question);
 const referredWork=!/[¿?]/.test(question)&&/^(?:(?:si|bueno|ok|perfecto|dale)\s+)?(?:la|las|lo|los)\s+que\s+(?:te\s+)?(?:dije|mencione|indique|describi|pedi)(?:\s+(?:recien|antes|anteriormente))?$/.test(q);
 if(last?.role==='assistant'&&Object.hasOwn(last,'approval')&&(shortAction||bare||explicitApproval||referredWork))return null;
 const lastText=chatFold(messageText(last));
 const recentUser=recent.filter(m=>m?.role==='user');
 const latestUser=recentUser.at(-1),latestUserText=chatFold(messageText(latestUser));
 const latestExplicit=[latestUserText,...messageText(latestUser).split(/[;,]/).slice(1).map(chatFold)].some(text=>direct.test(text)||requestedSubjunctive.test(text));
 const technicalCriteria=recentUser.slice(-4).some(message=>{
  const text=chatFold(messageText(message));
  return !/^(?:por que|que|cual|cuales|cuanto|cuantos|cuanta|cuantas|como|donde|cuando)\b/.test(text)&&/\b(?:tabiques?|revoques?|mamposteria|muros?|ladrillos?|hormigon|mortero|cemento|arena|cal|techo|cubierta|perfil|estructura|dosificacion|espesor|medidas?|largo|ancho|alto|altura)\b/.test(text);
 });
 const differentWork=text=>/\b(?:distint[oa]s?|diferentes?)\b/.test(text);
 const userCreation=latestExplicit&&!differentWork(latestUserText)&&/\bpartidas?\b/.test(latestUserText)&&acuMode(latestUserText)==='create'&&technicalCriteria;
 const lastPriceQuestion=/^(?:por que|que|cual|cuales|cuanto|cuantos|cuanta|cuantas|como|donde|cuando)\b|\b(?:precio|precios|costo|costos|cuesta|cuestan|valor|valores|cotizacion|catalogo|biblioteca)\b/.test(latestUserText);
 const workTarget=/\b(?:tabiques?|revoques?|mamposteria|muros?|hormigon|techo|cubierta|estructura)\b/.test(latestUserText);
 const dimensions=/\b\d+\s*(?:m2|m3|m|cm|mm|ladrillos?|kg)\b/.test(latestUserText);
 const recipeBasis=/\b\d+(?:[.,]\d+)?\s*(?:ladrillos?|kg|bolsas?|horas?|jornales?)\s*(?:por|\/)\s*m[²³23]\b/i.test(messageText(latestUser));
 const recentTechnical=technicalCriteria&&!lastPriceQuestion&&!materialToLine(latestUserText)&&(workTarget&&dimensions||recipeBasis||latestExplicit&&/\b(?:acus?|rendimientos?|consumos?|composicion|dosificacion|dimensiona|dimensionar|metrado)\b/.test(latestUserText));
 const currentCreation=explicit&&!differentWork(q)&&/\bpartidas?\b/.test(q)&&acuMode(q)==='create'&&recentTechnical;
 const recoverUserRequest=(explicitApproval||referredWork)&&latestExplicit&&(acuTopic(latestUserText)||userCreation);
 // A model's suggestion alone cannot turn a price question into an ACU load.
 const conversationAcu=acuTopic(latestUserText)&&!(/^(?:por que|que|cual|cuales|cuanto|cuantos|cuanta|cuantas|como|donde|cuando|precio|costo|valor)\b/.test(latestUserText));
 const confirmation=recoverUserRequest||(shortAction&&(prior||conversationAcu))||(bare&&(prior||conversationAcu&&/\b(?:puedo|queres|preparar|completar|cargar|armar|propongo)\b/.test(lastText)));
 if(!(explicit&&scope||currentCreation)||catalogOnly){if(!confirmation)return null;}
 const criteria=[];
 const add=value=>{const text=String(value||'').trim();if(!text||criteria.some(existing=>existing.includes(text)))return;for(let index=criteria.length-1;index>=0;index--)if(text.includes(criteria[index]))criteria.splice(index,1);criteria.push(text);};
 const sourceUsers=explicit&&materialToLine(q)?[]:recoverUserRequest&&materialToLine(latestUserText)?[latestUser]:recentUser.slice(-4);
 for(const message of sourceUsers){
  const text=messageText(message),folded=chatFold(text);
  if(constructionCriteria(folded)&&!(/^(?:por que|que|cual|cuales|cuanto|cuantos|cuanta|cuantas|como|donde|cuando)\b/.test(folded)))add(text);
 }
 if(prior&&confirmation)add(prior.brief);
 if(!confirmation)add(question);
 if(!criteria.length)return null;
 const brief=criteria.join('\n\n');if(brief.length>3000)return null;
 const modeText=explicit&&scope||currentCreation?q:recoverUserRequest?latestUserText:[...recentUser].reverse().map(message=>chatFold(messageText(message))).find(acuTopic)||'';
 const mode=acuMode(modeText,prior?.mode||'fill');
 return {mode,brief,lineIds:confirmation&&mode==='fill'&&prior?.mode==='fill'?prior.lineIds:[]};
}
// A correction after a committed ACU may mean ADD missing materials to the same
// selected line, not overwrite the ACU or create unrelated lines. Never guess a
// destination from the assistant's own text or from an older, unrelated run.
export function materialAdditionFollowup(question,messages=[],{selectedLineId=null,lines=[],lastAction=null}={}){
 const q=chatFold(question);
 const selected=lines.find(line=>line.id===selectedLineId);
 if(!selected||!q||/\b(?:no|nunca)\s+(?:cargues|agregues|sumes|anadas|incorpores)\b/.test(q))return null;
 const materials=/\b(?:material(?:es)?|artefactos?|inodoro|bidet|bide|griferia|sanitarios?)\b/.test(q);
 const command=/\b(?:carga(?:lo|la|los|las|r)?|cargues|agrega(?:lo|la|los|las|r)?|agregues|incorpora(?:r|los|las)?|suma(?:r|los|las)?|anadi(?:r|los|las)?|anade(?:r|los|las)?)\b/.test(q);
 const selectedReference=/\b(?:esta|esa|la) partida(?: seleccionada)?\b/.test(q);
 const committed=lastAction?.approval?.result?.committed===true&&lastAction.approval.result.lineIds?.includes(selected.id);
 const correction=/\b(?:no se cargaron|no se cargo|faltan|falto|faltaron|no aparecen|no se agregaron|quedaron afuera|te faltaron)\b/.test(q);
 // Only a named selected target or an explicit correction to the last locally
 // committed target can authorize a new additive preparation.
 if(!materials||!command||!(selectedReference||committed&&correction))return null;
 const previousUserDetails=committed?(Array.isArray(messages)?messages:[]).filter(m=>m?.role==='user'&&typeof m.content==='string')
   .map(m=>m.content).filter(text=>/\b(?:l[ií]nea|modelo|marca)\s+[\p{L}\d]/iu.test(text)&&/\b(?:ambos|los dos|inodoro|bidet|bid[eé]|artefactos?|sanitarios?)\b/i.test(text)).slice(-2):[];
 const brief=[...previousUserDetails,question].join('\n\n').slice(0,3000);
 return {mode:'fill',brief,lineIds:[selected.id],operation:'append'};
}

// Only this allowlist can become a draft. Never execute model output as code/HTML.
export function parseAiReply(text) {
  let value;
  try { value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"")); } catch { return {answer:text,proposal:null}; }
  if (!value || typeof value!=="object" || typeof value.answer!=="string") return {answer:text,proposal:null};
  if(Object.hasOwn(value,'acu_request')){
    try{return {answer:value.answer,proposal:null,acuRequest:readAcuRequest(value.acu_request)};}
    catch(error){return {answer:"No se preparó ninguna acción de ACU. "+error.message,proposal:null,actionError:error.message};}
  }
  if(value.proposal_lines||value.proposal_changes){
    try{return {answer:value.answer,proposal:null,...(value.proposal_lines?{planRows:parsePlan(text)}:{}),...(value.proposal_changes?{changeProposals:changeProposals(text)}:{})};}
    catch{return {answer:value.answer+"\nLa lista de partidas no es válida o está incompleta. Pedí una propuesta más acotada.",proposal:null};}
  }
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
  const record=line=>({line_id:line.id,codigo:line.code||"",descripcion:String(line.description||"").slice(0,200),unidad:line.unit,cantidad:line.quantity,precio_unitario:line.unit_cost??null,estado_precio:priceState(line.unit_cost)});
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
