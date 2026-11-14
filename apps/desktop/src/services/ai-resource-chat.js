// The language model interprets resource requests and edits. This module only
// validates already-structured drafts; it NEVER parses user sentences.
import {reviewAiResourceRows} from './ai-resource-import.js';

const LIMIT=60;
export function validatedResourceDraft(rows,existing=[]){
  if(!Array.isArray(rows)||rows.length<1||rows.length>LIMIT)return {rows:[],ready:[],pending:[]};
  const reviewed=reviewAiResourceRows(rows,existing);
  return {rows:reviewed,ready:reviewed.filter(row=>!row.errors.length),
    pending:reviewed.filter(row=>row.errors.length)};
}
export function resourceDraftSummary(review){
  const description=review.rows.map(row=>row.description||'Sin descripción').slice(0,4).join(' · ');
  return review.pending.length
    ?'Propuesta de insumos para revisar: '+description+'. '+review.ready.length+
      ' completos y '+review.pending.length+' con datos por completar o duplicados. No se guardó nada.'
    :'Propuesta de '+review.ready.length+' insumo(s) lista para revisar: '+description+
      '. Aprobá la ficha para registrarlos; todavía no se guardó nada.';
}
