import {acuTotals,acuPreapprovalErrors} from './ai-acu.js';
import {collectMissingResourceItems} from './ai-missing-resources.js';

// Árbol compacto sobre entidades de dominio: Rubro > Partida > Insumo.
// La agrupación proviene del plan constructivo y del catálogo, no de
// reglas lexicográficas ni de nombres especiales de materiales.
export function buildAcuReviewTree(rows=[],resources=[],sections=[],selections=[]){
 const catalog=new Map(resources.map(resource=>[resource.id,resource]));
 const sectionById=new Map(sections.map(section=>[section.id,section]));
 const groups=new Map();
 const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 for(const row of rows){
  const section=sectionById.get(row.section_id||row.seed?.section_id);
  const sectionName=(section?.title||row.seed?.section||row.section_title||'Sin rubro').trim()||'Sin rubro';
  if(!groups.has(sectionName))groups.set(sectionName,{name:sectionName,lines:[]});
  const chosen=selections.filter(selection=>selection.line_id===row.id);
  const components=(row.components||[]).map(component=>{
   const resource=catalog.get(component.resource_id);
   const hint=String(component.description||'').trim();
   const isOpaqueId=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(hint);
   return {description:resource?.description||(!isOpaqueId&&hint)||'Insumo por identificar',
    unit:resource?.unit||component.quantity_unit||'',quantity:String(component.quantity||''),
    status:resource?'assigned':'missing',kind:resource?.kind||'',resource_id:resource?.id||null};
  });
  const added=new Set();
  const addPending=(request,description,unit,kind,reason='')=>{
   const identity=norm(request);
   if(added.has(identity))return;
   added.add(identity);
   const selection=chosen.find(item=>norm(item.requested)===identity);
   if(selection&&components.some(item=>item.resource_id===selection.resource_id))return;
   components.push({description:selection?.description||description,unit:selection?.unit||unit,
    quantity:'',kind:selection?.kind||kind,status:selection?'selected':'missing',
    requested:request,resource_id:selection?.resource_id||null,reason});
  };
  for(const requirement of row.seed?.expected_resources||[]){
   const coverage=(row.requirement_coverage||[]).filter(item=>item?.requirement_id===requirement.id);
   const linked=coverage.length===1&&coverage[0].resource_id&&components.some(item=>item.resource_id===coverage[0].resource_id);
   if(!linked)addPending(requirement.description,requirement.description,requirement.unit,requirement.kind,
    coverage[0]?.unresolved_reason||'Falta justificar el insumo y su consumo');
  }
  for(const missing of collectMissingResourceItems([row]))
   addPending(missing.description,missing.description,missing.unit,missing.kind,missing.reason);
  const totals=acuTotals(row,resources);
  const errors=[...new Set([...totals.errors,...acuPreapprovalErrors(row,resources)])];
  groups.get(sectionName).lines.push({
   id:row.id,description:row.seed?.description||'Partida',unit:row.seed?.unit||'',reference_title:row.reference_title||'',
   quantity:String(row.seed?.quantity??''),is_new:row.seed?.is_new===true,
   quantityPending:row.seed?.quantity_status==='pending'||(row.seed?.quantity==null||String(row.seed.quantity)==='0'),
   status:errors.length?'pending':'ready',errors:errors.slice(0,8),
   items:components.slice(0,100),unit_cost:totals.unit_cost
  });
 }
 return [...groups.values()];
}
