// Safe conversational edits for a SELECTED reusable library ACU.
// A model proposes narrow changes. Only this audited application layer may
// validate, preview, and commit them after explicit user approval.
import {compareDecimals} from "../decimal.js";
import {readLibraryAcus} from "./ai-library-acu.js";
import {invokeReviewedAiAction} from "./ai-view-api-contracts.js";

const validString=(value,max=500)=>typeof value==="string"&&value.trim().length>0&&value.length<=max;
const decimal=/^\d{1,12}(?:\.\d{1,6})?$/;
const amount=(value,allowZero=false)=>{
 const text=typeof value==="number"&&Number.isFinite(value)?String(value):value;
 return typeof text==="string"&&decimal.test(text)&&(allowZero?Number(text)>=0:Number(text)>0)?text:null;
};
const asComponents=value=>(value||[]).map(c=>({
 resource_id:c.resource_id,description:c.description||"",unit:c.unit||"",quantity:c.quantity,
 unit_price:c.unit_price,
}));
export function selectedAcuSnapshot(id,detail){
 if(!validString(id,128)||!detail||detail.is_line_owned===true||
 !validString(detail.code,120)||!validString(detail.description)||
 !validString(detail.unit,40)||!Array.isArray(detail.components)||
 !detail.components.length||detail.components.length>80)throw new Error(
  "El ACU seleccionado no se puede editar de manera segura desde el chat. Revisá su composición en el editor.");
 const components=asComponents(detail.components);
 if(components.some(c=>!validString(c.resource_id,128)||!amount(c.quantity,true)||!amount(c.unit_price,true)))
  throw new Error("La composición actual contiene cantidades o precios inválidos.");
 return {id,code:detail.code,description:detail.description,unit:detail.unit,components};
}
export function selectedAcuSnapshotMatches(first,second){
 if(!first||!second||first.code!==second.code||
 first.description!==second.description||first.unit!==second.unit||
 first.components?.length!==second.components?.length)return false;
 return first.components.every((c,i)=>{
  const next=second.components[i];
  return c.resource_id===next.resource_id&&compareDecimals(c.quantity,next.quantity)===0&&
   compareDecimals(c.unit_price,next.unit_price)===0;
 });
}
const componentInput=item=>({resourceId:item.resource_id,quantity:item.quantity,unitPrice:item.unit_price});
export function readSelectedAcuEdit(text,{baseline,resources,previous=null}){
 const json=String(text).trim().replace(/^\x60{3}(?:json)?\s*/i,"").replace(/\s*\x60{3}$/,"");
 const data=JSON.parse(json);
 if(!validString(data?.answer,2000))throw new Error("La IA no explicó qué cambios propone.");
 if(data.needs_details===true&&data.analysis_edit==null)return {answer:data.answer,proposal:null};
 const edit=data.analysis_edit;
 if(!edit||typeof edit!=="object"||Array.isArray(edit)||!Array.isArray(edit.changes)||
 edit.changes.length>40||(edit.description!=null&&!validString(edit.description))||
 (edit.unit!=null&&!validString(edit.unit,40))||
 Object.keys(edit).some(key=>!["description","unit","changes"].includes(key)))
  throw new Error("La IA no devolvió operaciones de edición de ACU válidas.");
 const current=previous?.draft||baseline;
 const base=previous?.baseline||baseline;
 const catalog=new Map(resources.map(r=>[r.id,r]));
 const map=new Map(current.components.map(c=>[c.resource_id,{...c,unit:c.unit||catalog.get(c.resource_id)?.unit||""}]));
 const seen=new Set(),changes=[],warnings=[];
 for(const row of edit.changes){
  const id=row?.resource_id,operation=row?.operation;
  if(!validString(id,128)||!["add","set","remove"].includes(operation)||
    Object.keys(row).some(key=>!["resource_id","operation","quantity","quantity_unit","catalog_quantity","conversion_basis","unit_price"].includes(key))||
    seen.has(id))throw new Error("Una modificación incluye una operación o insumo repetido/inválido.");
  seen.add(id);
  const existing=map.get(id);
  if(operation==="remove"){
   if(!existing)throw new Error("No se puede quitar un insumo que no está en el ACU.");
   map.delete(id);
   changes.push("Quitar "+existing.description);
   continue;
  }
  if(operation==="add"&&existing)throw new Error("El insumo ya existe. La IA debe modificar su rendimiento.");
  if(operation==="set"&&!existing)throw new Error("La IA debe agregar el nuevo insumo, no modificar uno inexistente.");
  const resource=catalog.get(id);
  if(!resource)throw new Error("El insumo propuesto no pertenece al catálogo consultado: "+id);
  const quantity=row.quantity??existing?.quantity;
  const parsed=readLibraryAcus(JSON.stringify({
   answer:"Verificación de rendimiento",library_acus:[{
    description:current.description,unit:current.unit,
    components:[{resource_id:id,quantity,quantity_unit:row.quantity_unit??resource.unit,
      ...(row.catalog_quantity!=null?{catalog_quantity:row.catalog_quantity}:{}),
      ...(row.conversion_basis!=null?{conversion_basis:row.conversion_basis}:{})}],
    missing:[]
   }]
  }),[resource]).drafts[0];
  if(parsed.aiWarnings.length||parsed.components.length!==1){
   warnings.push(...parsed.aiWarnings);
   continue;
  }
  const normalized=parsed.components[0];
  const unitPrice=row.unit_price==null
    ? (existing?.unit_price??(resource.price==null?"":String(resource.price)))
    : amount(row.unit_price,true);
  if(unitPrice===null)throw new Error("El precio propuesto no es un decimal válido.");
  if(!unitPrice)warnings.push(resource.description+": falta precio del catálogo.");
  const next={...normalized,unit_price:unitPrice};
  map.set(id,next);
  if(operation==="add")changes.push("Agregar "+next.description+": "+next.quantity+" "+next.unit);
  else{
   if(compareDecimals(existing.quantity,next.quantity)!==0)
    changes.push("Modificar "+next.description+": "+existing.quantity+" → "+next.quantity+" "+next.unit);
   if(compareDecimals(existing.unit_price,next.unit_price)!==0)
    changes.push("Precio de "+next.description+": "+existing.unit_price+" → "+next.unit_price+" ARS");
  }
 }
 const description=edit.description?.trim()||current.description,unit=edit.unit?.trim()||current.unit;
 if(description!==current.description)changes.push("Descripción: "+current.description+" → "+description);
 if(unit!==current.unit)changes.push("Unidad: "+current.unit+" → "+unit);
 const draft={...current,description,unit,components:[...map.values()],
   aiWarnings:warnings,code:base.code,id:base.id};
 if(!draft.components.length)warnings.push("El ACU debe mantener al menos un insumo.");
 // Show the entire cumulative delta, not just this turn's edits. A follow-up
 // that undoes a previous request must remove it from the proposed changes.
 const original=new Map(base.components.map(c=>[c.resource_id,c]));
 const fullChanges=[];
 for(const old of base.components){
  const next=map.get(old.resource_id);
  if(!next){fullChanges.push("Quitar "+old.description);continue;}
  if(compareDecimals(old.quantity,next.quantity)!==0)
   fullChanges.push("Modificar "+(next.description||old.description)+": "+old.quantity+" → "+next.quantity+" "+(next.unit||old.unit));
  if(compareDecimals(old.unit_price,next.unit_price)!==0)
   fullChanges.push("Precio de "+(next.description||old.description)+": "+old.unit_price+" → "+next.unit_price+" ARS");
 }
 for(const next of map.values()){
  if(!original.has(next.resource_id))fullChanges.push("Agregar "+next.description+": "+next.quantity+" "+next.unit);
 }
 if(description!==base.description)fullChanges.push("Descripción: "+base.description+" → "+description);
 if(unit!==base.unit)fullChanges.push("Unidad: "+base.unit+" → "+unit);
 if(!fullChanges.length&&!warnings.length)
  throw new Error("La IA no propuso diferencias sobre el ACU seleccionado.");
 return {answer:data.answer,proposal:{baseline:base,draft,changes:fullChanges,warnings}};
}
export function canApplySelectedAcuEdit(proposal){
 return !!proposal&&proposal.changes.length>0&&proposal.draft.components.length>0&&
 !proposal.warnings.length&&proposal.draft.components.every(c=>amount(c.quantity,true)!==null&&
  amount(c.unit_price,true)!==null);
}
export async function applySelectedAcuEdit(invoke,proposal,{selectedAnalysisId,selectedDatabaseScope}={}){
 if(!canApplySelectedAcuEdit(proposal))throw new Error("El ACU tiene insumos o precios pendientes.");
 if(selectedAnalysisId!==proposal.baseline.id)
  throw new Error("Cambió el ACU seleccionado. No se aplicaron los cambios.");
 if(proposal.databaseScope!==selectedDatabaseScope)
  throw new Error("Cambió la base SQLite. No se aplicaron los cambios.");
 const current=selectedAcuSnapshot(proposal.baseline.id,
  await invoke("get_analysis_details",{analysisId:proposal.baseline.id}));
 if(!selectedAcuSnapshotMatches(proposal.baseline,current))
  throw new Error("El ACU cambió después de preparar esta propuesta. Revisá la composición actual antes de editar.");
 return invokeReviewedAiAction(invoke,"analyses","update_analysis",{
  analysisId:proposal.baseline.id,code:proposal.baseline.code,
  description:proposal.draft.description,unit:proposal.draft.unit,
  components:proposal.draft.components.map(componentInput),
  expectedSnapshot:{code:proposal.baseline.code,
   description:proposal.baseline.description,unit:proposal.baseline.unit,
   components:proposal.baseline.components.map(componentInput)}
 },{approved:true});
}
