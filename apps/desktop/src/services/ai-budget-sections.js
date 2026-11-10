import {prepareSectionBatch} from './ai-section-operations.js';

// Translate semantic rubro intents into typed, locally-resolved operations.
// The model NEVER gets to select or delete arbitrary budget-line IDs.
const ok=s=>typeof s==='string'&&s.trim().length>0;
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function parseSectionToolArgs(a){
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.values(a).some(v=>v!=null&&typeof v!=='string'))return null;
 const allowed=new Set(['action','titles','names','name','target','from_name','to_name','new_title','new_code','source']);
 if(Object.keys(a).some(key=>!allowed.has(key)))return null;
 const action=a.action==='update'?'rename':a.action;
 if(!['create','rename','delete','convert'].includes(action))return null;
 if(action==='create'){
  if(a.target||a.new_title||a.new_code||a.from_name||a.to_name||a.name)return null;
  if(a.source==='last_created')return {action:'create',source:'last_created'};
  const names=(a.names||a.titles||'').split(/\s*[;|\n]\s*/).map(s=>s.trim()).filter(Boolean);
  if(!names.length||names.length>60||names.some(s=>s.length>100)||new Set(names.map(norm)).size!==names.length)return null;
  return {action:'create',names:names.join('|')};
 }
 if(action==='convert'){
  if(!['last_created','current_placeholders'].includes(a.source)||a.names||a.titles||a.target||a.name)return null;
  return {action:'convert',source:a.source};
 }
 if(action==='rename'){
  if(a.names||a.titles||a.source||a.name)return null;
  const from_name=a.from_name||a.target, to_name=a.to_name||a.new_title, new_code=a.new_code;
  if(!ok(from_name)||!ok(to_name)&&!ok(new_code)||to_name?.length>100||new_code?.length>64)return null;
  return {action:'rename',from_name:from_name.trim(),to_name:(to_name||a.from_name||a.target).trim(),...(new_code?{new_code:new_code.trim()}:{})};
 }
 if(a.new_title||a.new_code||a.to_name||a.from_name||a.titles||a.source)return null;
 const names=a.names||a.name||a.target;
 if(!ok(names)||names.length>1500)return null;
 return {action:'delete',names:names.replace(/\s*;\s*/g,'|')};
}
export function prepareSectionEdits(args,state,sourceLineIds=[],userQuestion=''){
 let parsed=parseSectionToolArgs(args);
 if(!parsed)throw Error('La orden de rubros necesita una acción y nombres claros. No se creó ninguna partida.');
 const question=norm(userQuestion);
 // Explicit correction: these existing partidas should be rubros. Resolve
 // identities from local history or current placeholder rows, never model IDs.
 const conversionRequested=/\b(?:converti\w*|transforma\w*|pasar|pasa)\b.{0,170}\bpartidas?\b.{0,170}\brubros?\b|\bpartidas?\b.{0,210}\b(?:deberian|debieran|son|eran|estan mal|equivocadas?|converti\w*|transforma\w*|pasar)\b.{0,210}\brubros?\b/.test(question);
 if(conversionRequested&&['create','convert'].includes(parsed.action))
  parsed={action:'convert',source:sourceLineIds.length?'last_created':'current_placeholders'};
 if(parsed.action==='convert'&&parsed.source==='current_placeholders'&&!conversionRequested)
  throw Error('Para convertir partidas existentes en rubros, pedilo explícitamente. No se eliminarán partidas a partir de una orden ambigua.');
 const {batch,preview}=prepareSectionBatch({name:'manage_sections',args:parsed},{state,sourceLineIds});
 const display=[
  ...preview.created.map(name=>'Crear rubro: '+name),
  ...preview.renamed.map(x=>'Editar rubro: '+x.from+' → '+x.to+(x.code?' (código '+x.code+')':'')),
  ...preview.deleted.map(name=>'Borrar rubro: '+name),
  ...preview.converted.map(name=>'Convertir partida genérica en rubro: '+name)
 ];
 if(preview.already_existing.length)preview.warnings.push('Ya existen: '+preview.already_existing.join(', ')+'. No se duplicarán.');
 return {batch,projectId:state.projectId,estimateId:state.estimateId,display,warnings:preview.warnings,preview};
}
export function sectionPreviewText(plan){
 return [...plan.display,...plan.warnings].join(' · ')+'. Ningún cambio fue guardado todavía.';
}
