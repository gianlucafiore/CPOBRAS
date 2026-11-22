import {acuTotals,acuPreapprovalErrors} from './ai-acu.js';
import {collectMissingResourceItems} from './ai-missing-resources.js';

// Borrador sólo de lectura, construido desde datos locales comprobados.
// Ningún estado de esta función constituye una autorización de guardado.
export function buildAcuReviewTree(rows=[],resources=[],sections=[],selections=[]){
 const catalog=new Map(resources.map(resource=>[resource.id,resource]));
 const sectionById=new Map(sections.map(section=>[section.id,section]));
 const groups=new Map();
 const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 for(const row of rows){
  const section=sectionById.get(row.section_id||row.seed?.section_id);
  const sectionName=(section?.title||row.section_title||row.seed?.section||'Sin rubro').trim()||'Sin rubro';
  if(!groups.has(sectionName))groups.set(sectionName,{name:sectionName,lines:[]});
  const chosen=selections.filter(selection=>selection.line_id===row.id);
  const components=(row.components||[]).map(component=>{
   const resource=catalog.get(component.resource_id);
   return {description:resource?.description||component.description||'Insumo por identificar',
    unit:resource?.unit||component.quantity_unit||'',quantity:String(component.quantity||''),
    status:resource?'assigned':'missing',kind:resource?.kind||'',resource_id:resource?.id||null};
  });
  const missingDrafts=collectMissingResourceItems([row]);
  for(const missing of missingDrafts){
   const selection=chosen.find(item=>norm(item.requested)===norm(missing.description));
   const alreadyAssigned=selection&&components.some(item=>item.resource_id===selection.resource_id);
   // Seleccionar un insumo NO crea un consumo y no equivale a completar el ACU.
   if(!alreadyAssigned)components.push({
    description:selection?.description||missing.description,unit:selection?.unit||missing.unit,
    quantity:'',kind:selection?.kind||missing.kind,status:selection?'selected':'missing',
    requested:missing.description,resource_id:selection?.resource_id||null,reason:missing.reason||''
   });
  }
  const totals=acuTotals(row,resources);
  const errors=[...new Set([...totals.errors,...acuPreapprovalErrors(row,resources)])];
  groups.get(sectionName).lines.push({
   id:row.id,description:row.seed?.description||'Partida',unit:row.seed?.unit||'',
   quantity:String(row.seed?.quantity??''),is_new:row.seed?.is_new===true,
   status:errors.length?'pending':'ready',errors:errors.slice(0,8),
   items:components.slice(0,100),unit_cost:totals.unit_cost
  });
 }
 return [...groups.values()];
}
