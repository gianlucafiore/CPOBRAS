// Budget-wide review: a model may SUGGEST an existing rubro, but only locally
// verified line/section IDs may become part of an approved native transaction.
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const parse=s=>JSON.parse(String(s).trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,''));

export function reviewSectionContext(lines,sections){
 if(!Array.isArray(lines)||!Array.isArray(sections))throw new Error('No se cargaron las partidas y los rubros reales');
 if(lines.length>60)throw new Error('Revisá como máximo 60 partidas por lote de clasificación');
 return JSON.stringify({task:'classify_budget_sections',access:'read_only',sections:sections.map(s=>({id:s.id,title:s.title,code:s.code,parent_id:s.parent_id||null})),lines:lines.map(l=>({id:l.id,description:l.description,unit:l.unit,current_section_id:l.section_id||null})),policy:'No inventes IDs, materiales ni rubros. Usá SOLO un section_id existente y confidence high para correspondencias inequívocas; si no alcanza, omití esa partida. No modificamos ninguna partida durante esta consulta.'});
}
export function reviewedSectionSuggestions(text,lines,sections){
 let parsed;try{parsed=parse(text);}catch{throw new Error('La clasificación de rubros no devolvió JSON válido; no se reubicará ninguna partida');}
 if(!parsed||!Array.isArray(parsed.section_moves)||parsed.section_moves.length>60)
  throw new Error('La clasificación de rubros no contiene una lista válida');
 const candidates=new Map(lines.map(l=>[l.id,l]));
 const validSections=new Set(sections.map(s=>s.id));
 const seen=new Set(),moves=[],pending=[];
 for(const row of parsed.section_moves){
  if(!row||typeof row.line_id!=='string'||seen.has(row.line_id)||!candidates.has(row.line_id)){
   pending.push('La clasificación contiene una partida desconocida o repetida; revisá sus rubros');
   continue;
  }
  seen.add(row.line_id);
  const line=candidates.get(row.line_id);
  if(row.confidence!=='high'||typeof row.section_id!=='string'||!validSections.has(row.section_id)){
   pending.push('Sin correspondencia de rubro segura: '+line.description);
   continue;
  }
  if(row.section_id!==line.section_id){
   moves.push({line_id:line.id,expected:{description:line.description,unit:line.unit,quantity:String(line.quantity),unit_cost:String(line.unit_cost),analysis_id:line.analysis_id||null},expected_section:line.section_id||null,section_id:row.section_id,reason:typeof row.reason==='string'?row.reason.slice(0,180):''});
  }
 }
 for(const line of lines)if(!seen.has(line.id)&&!line.section_id)pending.push('Falta asignación de rubro verificable: '+line.description);
 return {moves,pending:[...new Set(pending)].slice(0,60),reviewed:seen.size,total:lines.length};
}
export function reviewPreviewRows(moves,sections,lines){
 const sectionNames=new Map(sections.map(s=>[s.id,s.title]));
 const lineNames=new Map(lines.map(l=>[l.id,l.description]));
 return moves.map(move=>({line_id:move.line_id,description:lineNames.get(move.line_id)||move.expected.description,from:sectionNames.get(move.expected_section)||'Sin rubro',to:sectionNames.get(move.section_id)||'Rubro no encontrado',reason:move.reason||''}));
}
