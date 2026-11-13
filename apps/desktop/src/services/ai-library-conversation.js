// Immutable read-only conversational snapshot for the active ACU.
// Deliberately preserves user references across question/clarification/edit
// turns; none of this text can authorize database writes.
import {foldCatalogText} from "./ai-catalog-context.js";

const take=(s,n)=>String(s??"").slice(0,n);
const userUtterances=(messages=[])=>messages.filter(m=>m?.role==="user"&&typeof m.content==="string")
 .slice(-6).map(m=>take(m.content,450));

export function libraryAcuConversationState({messages=[],selectedAnalysis=null,pendingEdit=null,currentQuestion=""}={}){
 const recent=userUtterances(messages);
 const lastTopic=recent.slice(-4);
 const focused=selectedAnalysis&&{
  id:take(selectedAnalysis.id,128),code:take(selectedAnalysis.code,120),
  description:take(selectedAnalysis.description,350),unit:take(selectedAnalysis.unit,40),
  components:(selectedAnalysis.components||[]).slice(0,35).map(c=>({
   resource_id:take(c.resource_id,128),description:take(c.description,180),
   quantity:take(c.quantity,40),unit_price:take(c.unit_price,40)
  }))
 };
 return {
  selected_analysis:focused||null,
  recent_user_turns:lastTopic,
  current_question:take(currentQuestion,450),
  pending_edit:pendingEdit?{changes:(pendingEdit.changes||[]).slice(0,20),
   description:take(pendingEdit.draft?.description,350)}:null,
  grounding:"Conservá el referente del ACU seleccionado y el material nombrado en intervenciones anteriores; preguntas y aclaraciones NO autorizan escribir en SQLite. No trates coincidencias de texto como sustitutos técnicos."
 };
}
const singular=word=>word.endsWith("s")&&word.length>4?word.slice(0,-1):word;
const keywords=value=>foldCatalogText(value).split(/\s+/).filter(Boolean).map(singular);
const stop=new Set(keywords("el la los las un una de del con por para en al a que se este esta seleccionado actual insumo material materiales tipo cantidad cantidad de obra acu analisis precio valor cada m2 unidad m3 m² m³"));
const action=/\b(?:agregar|agrega|agreg[aá]|sumar|suma|sum[aá]|incorporar|incorpora|incorpor[aá]|incluir|inclui|inclu[ií]|anadir|anadi|añadir|añadi|poner|pone|pon[eé])\b/iu;
const ends=/\b(?:al?|a la|en el|en la|para|por|del|de la|que|si|sin|con|en)\b/iu;
/** Extract literal noun phrases only from USER requests, never from model text.
 * No catalog/product names or construction recipes are hardcoded.
 */
export function requestedAddedMaterials(userTurns=[]){
 const nouns=[];
 for(const utterance of userTurns){
  const text=foldCatalogText(utterance);
  const match=action.exec(text);
  if(!match)continue;
  const tail=text.slice(match.index+match[0].length).trim()
   .replace(/^(?:el|la|los|las|un|una)\s+/,"");
  const phrase=tail.split(ends)[0].split(/[.,;:!?]/)[0].trim().slice(0,95);
  const terms=keywords(phrase).filter(word=>word.length>=4&&!stop.has(word));
  if(terms.length>0&&terms.length<=5)nouns.push(terms);
 }
 return nouns.slice(-4);
}
export function candidateMatchesExplicitMaterial(resource,phrases){
 if(!phrases?.length)return true;
 const name=new Set(keywords(resource?.description||""));
 // Require at least one exact material noun from a user's explicit request.
 // Morphological substring matches (e.g. "arena" inside an unrelated item)
 // and model-invented explanations cannot satisfy this.
 return phrases.some(parts=>parts.some(word=>name.has(word)));
}
