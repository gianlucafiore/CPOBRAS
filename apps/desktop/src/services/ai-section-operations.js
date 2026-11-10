import {compareDecimals} from '../decimal.js';

// Section ("rubro") mutations are distinct from budget-line ("partida")
// mutations. Model text cannot supply IDs or bypass a reviewed local snapshot.
const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const fail=message=>{throw new Error(message);};
const nonempty=s=>typeof s==='string'&&s.trim().length>0;
const expectedSection=s=>({code:s.code,title:s.title,parent_id:s.parent_id||null,position:s.position});
const expectedLine=l=>({description:l.description,unit:l.unit,quantity:String(l.quantity),unit_cost:String(l.unit_cost),analysis_id:l.analysis_id||null});
const byTitle=(sections,title)=>{
 const matches=sections.filter(s=>norm(s.title)===norm(title)||norm(s.code)===norm(title));
 if(matches.length!==1)fail(matches.length?'Hay rubros con el mismo nombre; indicá su código':'No encontré el rubro «'+title+'» en este presupuesto');
 return matches[0];
};
const parseNames=text=>String(text||'').split(/\s*\|\s*|\r?\n/).map(s=>s.trim()).filter(Boolean);

export function recentCreatedSectionSources(messages=[],estimateId){
 // Only a locally confirmed transaction is a safe reference for «esas 9».
 const previous=[...messages].reverse().find(m=>m?.approval?.result?.committed===true
  &&m.approval.result.estimateId===estimateId
  &&m.approval.result.created>0&&Array.isArray(m.approval.result.lineIds)
  &&m.approval.result.lineIds.length===m.approval.result.created);
 return previous?.approval?.result?.lineIds?.slice(0,60)||[];
}

export function prepareSectionBatch(call,{state,sourceLineIds=[]}){
 if(call?.name!=='manage_sections'||!call.args)fail('No es una orden de rubros reconocida');
 const {action}=call.args;
 if(!['create','rename','delete','convert'].includes(action))fail('La operación de rubros es inválida');
 const estimateId=state.estimateId,estimate=state.estimates?.find(e=>e.id===estimateId);
 if(!state.projectId||!estimateId||state.remoteProject||!estimate||estimate.issued||estimate.archived||estimate.active===false)
  fail('Abrí un presupuesto local en elaboración para modificar rubros');
 if(state.modal||state.pageDirty||state.navigating)fail('Guardá los formularios pendientes antes de modificar rubros');
 const sections=state.sections||[],lines=state.lines||[];
 const batch={id:globalThis.crypto.randomUUID(),estimate_id:estimateId,creates:[],renames:[],deletes:[],converts:[]};
 const preview={created:[],renamed:[],deleted:[],converted:[],already_existing:[],warnings:[]};
 const known=new Map(sections.map(s=>[norm(s.title),s]));
 const positions=[...sections.map(s=>s.position)].filter(Number.isFinite);
 let nextPosition=Math.max(-1,...positions)+1;
 const addSection=title=>{
  if(!nonempty(title)||title.length>100)fail('El nombre del rubro debe contener entre 1 y 100 caracteres');
  const key=norm(title);
  if(known.has(key)){
   preview.already_existing.push(title);
   return known.get(key).id;
  }
  const newSection={id:globalThis.crypto.randomUUID(),title:title.trim(),code:'',position:nextPosition++,parent_id:null};
  batch.creates.push(newSection);preview.created.push(newSection.title);
  known.set(key,newSection);
  return newSection.id;
 };
 const lastIds=[...new Set(sourceLineIds)];
 const fromRecent=call.args.source==='last_created';
 const fromCurrent=call.args.source==='current_placeholders'&&action==='convert';
 const isPlaceholder=line=>{
  if(line.analysis_id||(line.components||[]).length||(line.takeoffs||[]).length||state.assignments?.[line.id])return false;
  const emptyCost=(()=>{try{return compareDecimals(String(line.unit_cost),'0')===0;}catch{return false;}})();
  const emptyQuantity=(()=>{try{return compareDecimals(String(line.quantity),'0')===0;}catch{return false;}})();
  const genericLump=norm(line.unit)==='gl'&&(()=>{try{return compareDecimals(String(line.quantity),'1')===0;}catch{return false;}})();
  return emptyCost&&(emptyQuantity||genericLump);
 };
 const sourceLines=fromRecent?lastIds.map(id=>{
  const line=lines.find(l=>l.id===id);
  if(!line)fail('Las partidas de la última carga cambiaron. No se borrará nada; revisá el presupuesto antes de convertirlas');
  return line;
 }):fromCurrent?lines.filter(isPlaceholder):[];
 if(fromRecent&&(!sourceLines.length||sourceLines.length>60))fail('No encontré la última carga confirmada de partidas en esta conversación');
 if(fromCurrent&&(!sourceLines.length||sourceLines.length>60))fail('No hay entre 1 y 60 partidas genéricas sin costo ni metrado para convertir en rubros. No se modificó nada.');
 if(action==='create'||action==='convert'){
  const names=fromRecent||fromCurrent?sourceLines.map(l=>l.description):parseNames(call.args.names);
  if(!names.length||names.length>60)fail('Indicá los nombres de los rubros o referite a la última carga confirmada de partidas');
  // A true conversion must refer to exact, recently created line IDs. A
  // similar name elsewhere in the estimate is never sufficient for deletion.
  if(action==='convert'&&!fromRecent&&!fromCurrent)fail('Para convertir partidas, seleccioná una carga confirmada o pedí expresamente convertir las partidas genéricas del presupuesto.');
  for(const name of names)addSection(name);
  if(action==='convert')for(const line of sourceLines){
   const id=known.get(norm(line.description)).id;
   const hasMoney=(()=>{try{return compareDecimals(String(line.unit_cost),'0')!==0;}catch{return true;}})();
   if(hasMoney||line.analysis_id||(line.components||[]).length||(line.takeoffs||[]).length||state.assignments?.[line.id])
    fail('«'+line.description+'» tiene datos o relaciones de obra. No se eliminará como partida genérica; revisá ese caso.');
   batch.converts.push({line_id:line.id,expected:expectedLine(line),section_id:id});
   preview.converted.push(line.description);
  }
 } else if(action==='rename'){
  const from=call.args.from_name,to=call.args.to_name;
  if(!nonempty(from)||!nonempty(to)||to.length>100)fail('Para editar un rubro indicá el nombre actual y el nuevo nombre o código');
  const section=byTitle(sections,from);
  if(norm(section.title)===norm(to)&&!call.args.new_code)fail('El rubro ya tiene ese nombre');
  if(known.has(norm(to)))fail('Ya existe un rubro con el nombre propuesto');
  const newCode=call.args.new_code?.trim();
  if(newCode&&(newCode.length>64||sections.some(item=>item.id!==section.id&&norm(item.code)===norm(newCode))))fail('El código ya existe o no es válido');
  batch.renames.push({id:section.id,expected:expectedSection(section),title:to.trim(),...(newCode?{code:newCode}:{})});
  preview.renamed.push({from:section.title,to:to.trim(),...(newCode?{code:newCode}:{})});
 } else {
  const names=parseNames(call.args.names||call.args.name);
  if(!names.length||names.length>60)fail('Indicá uno o más rubros existentes para eliminar');
  const ids=new Set();
  for(const name of names){
   const section=byTitle(sections,name);
   if(ids.has(section.id))continue;ids.add(section.id);
   const expected_lines=Object.values(state.assignments||{}).filter(id=>id===section.id).length;
   const expected_children=sections.filter(s=>s.parent_id===section.id).length;
   batch.deletes.push({id:section.id,expected:expectedSection(section),expected_lines,expected_children});
   preview.deleted.push(section.title);
   if(expected_lines)preview.warnings.push('Se conservan '+expected_lines+' partidas; quedarán sin rubro.');
   if(expected_children)preview.warnings.push('Se conservan '+expected_children+' subrubros; pasan al rubro superior.');
  }
 }
 if(!batch.creates.length&&!batch.renames.length&&!batch.deletes.length&&!batch.converts.length)
  fail('Esos rubros ya existen. No se crearon partidas ni rubros duplicados.');
 if(preview.converted.length)preview.warnings.push(fromCurrent?'Se convertirán solo las partidas sin precio, ACU, metrado ni asignación, con cantidad cero o global de una unidad; las demás partidas se conservan.':'La conversión archivará solo las partidas genéricas de la última carga, sin costo ni ACU. Las otras partidas se conservan.');
 if(preview.deleted.length)preview.warnings.push('Eliminar rubros no elimina partidas ni subrubros: se desasignan o reubican.');
 return {batch,preview};
}
