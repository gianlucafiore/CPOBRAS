// Exclusiones explícitas del usuario sobre un borrador, independientes del
// catálogo persistido. El mismo árbol se usa para mostrar y para guardar.
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export const componentKey=id=>'component:'+id;
export const missingKey=name=>'missing:'+norm(name);
export function excludedAcuRows(rows=[],excludedLines=new Set(),excludedInputs=new Map()){
 return rows.filter(row=>!excludedLines.has(row.id)).map(row=>{
  const excluded=excludedInputs.get(row.id)||new Set();
  if(!excluded.size)return row;
  const removedIds=new Set((row.components||[]).filter(component=>excluded.has(componentKey(component.resource_id))).map(component=>component.resource_id));
  const removedNames=new Set([...excluded].filter(key=>key.startsWith('missing:')).map(key=>key.slice(8)));
  const requirements=(row.seed?.expected_resources||[]).filter(req=>{
   const mapping=(row.requirement_coverage||[]).find(item=>item.requirement_id===req.id);
   return !removedNames.has(norm(req.description))&&!removedIds.has(mapping?.resource_id);
  });
  const keptRequirements=new Set(requirements.map(req=>req.id));
  const missingDrafts=(row.missing_resource_drafts||[]).filter(item=>!removedNames.has(norm(item.description)));
  const missingNotes=(row.missing_resources||[]).filter(note=>![...removedNames].some(name=>norm(note).includes(name)));
  return {...row,
   seed:{...row.seed,expected_resources:requirements},
   components:(row.components||[]).filter(item=>!removedIds.has(item.resource_id)),
   requirement_coverage:(row.requirement_coverage||[]).filter(item=>keptRequirements.has(item.requirement_id)),
   missing_resource_drafts:missingDrafts,
   missing_resources:missingNotes,
   // Explicit omission is not automatic approval: any remaining missing
   // components, technical conflicts and invalid quantities still block.
   missing_resolved:false
  };
 });
}
export function reviewSelectionState(excludedLines,excludedInputs,lineId,itemKey=null,exclude=true){
 if(!lineId||typeof lineId!=='string')throw Error('Partida sin identificador');
 if(itemKey==null){if(exclude)excludedLines.add(lineId);else excludedLines.delete(lineId);return;}
 if(typeof itemKey!=='string'||(!itemKey.startsWith('component:')&&!itemKey.startsWith('missing:'))||itemKey.length>400)
  throw Error('El insumo seleccionado no es válido');
 const keys=new Set(excludedInputs.get(lineId)||[]);
 if(exclude)keys.add(itemKey);else keys.delete(itemKey);
 if(keys.size)excludedInputs.set(lineId,keys);else excludedInputs.delete(lineId);
}
