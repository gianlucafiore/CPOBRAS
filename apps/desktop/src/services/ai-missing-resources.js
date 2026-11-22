// Faltantes estructurados para el chat. Los nombres y unidades propuestos son
// borradores: nunca autorizan alta ni demuestran ausencia en el catálogo.
const types=new Set(['material','labor','equipment','subcontract']);
const clean=(value,max=200)=>typeof value==='string'
  ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const key=value=>clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
export function missingResourceItems(value){
 if(!Array.isArray(value))return [];
 return value.slice(0,40).flatMap(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))return [];
  const description=clean(item.description||item.name,200);
  if(description.length<3)return [];
  const unit=clean(item.unit,30),kind=types.has(item.kind)?item.kind:'',
    reason=clean(item.reason,300),action=item.action==='create'?'create':'specify';
  // Una falta de definición técnica nunca debe convertirse en alta automática.
  return [{description,unit,kind,reason,action}];
 });
}
export function collectMissingResourceItems(rows=[]){
 const found=new Map();
 for(const row of rows){
  const line=clean(row?.seed?.description||row?.description,200);
  for(const item of missingResourceItems(row?.missing_resource_drafts)){
   const id=key(item.description)+'|'+item.kind+'|'+item.unit;
   const previous=found.get(id);
   if(previous){if(line&&!previous.lines.includes(line))previous.lines.push(line);if(previous.action==='create'&&item.action==='specify')previous.action='specify';}
   else found.set(id,{...item,lines:line?[line]:[]});
  }
 }
 return [...found.values()].slice(0,40);
}
