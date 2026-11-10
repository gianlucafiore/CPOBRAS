import {sumDecimals,compareDecimals,divideDecimals,multiplyDecimals} from '../decimal.js';
import {parseAcuProposals,acuTotals,emptyAcu} from './ai-acu.js';

const fold=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const unit=value=>fold(value).replace(/\bmetros cuadrados?\b/g,'m2').replace(/\bmetros cubicos?\b/g,'m3');
const positive=value=>typeof value==='string'&&/^\d+(?:[.,]\d+)?$/.test(value.trim())&&compareDecimals(value,'0')>0;

/** Resolve an additive request only within a concrete, explicitly named target. */
export function appendRequest(brief,lines=[],selectedLineId=null){
 const text=fold(brief);
 if(!/\b(?:agrega(?:r|me|le|les)?|agregues|anadi(?:r|me|le|les)?|anade(?:r|me|le|les)?|anadas|incorpora(?:r|me|le|les)?|incorpores|carga(?:r|me|le|les)?|cargues)\b/.test(text)||/\bno\s+(?:(?:quiero|necesito|debes|debe|que|me|le|les|los|las|lo|la)\s+)*(?:agreg|anad|incorpor|carg)/.test(text))return null;
 if(/\b(?:agrega|anadi|anade|incorpora|carga)(?:r|me)?\s+(?:(?:una|otra|nueva|la)\s+)*partida\b/.test(text))return null;
 if(/\b(?:a|en)\s+(?:la|el)\s+(?:biblioteca|catalogo)\b/.test(text))return null;
 const marker=/\b(?:a|en)\s+(?:(?:la|esta|esa|una)\s+)?partida\s+/.exec(text);
 const targetText=marker?text.slice(marker.index+marker[0].length):text;
 const available=Array.isArray(lines)?lines:[],padded=' '+targetText+' ';
 const matches=available.map(line=>({line,name:fold(line.description)})).filter(item=>item.name&&padded.includes(' '+item.name+' '));
 const specific=matches.filter(item=>!matches.some(other=>other.name.length>item.name.length&&(' '+other.name+' ').includes(' '+item.name+' ')));
 const selectedReference=/\b(?:esta|esa|la) partida seleccionada\b|\besta partida\b/.test(text);
 if(!/\bpartidas?\b/.test(text)&&!matches.length)return null;
 const error=message=>({operation:'append',lineIds:[],error:message});
 if(specific.length>1)return error('Indicá una sola partida con un nombre único para agregar sus insumos sin modificar otra composición.');
 if(specific.length===1){
  if(selectedReference&&selectedLineId!==specific[0].line.id)return error('El nombre indicado y la partida seleccionada no coinciden. Indicá cuál debe recibir los insumos.');
  return {operation:'append',lineIds:[specific[0].line.id]};
 }
 if(selectedReference&&!/\b(?:llamada|denominada|nombre)\b/.test(text)){
  const selected=available.find(line=>line.id===selectedLineId);
  if(selected)return {operation:'append',lineIds:[selected.id]};
 }
 return error('No pude identificar una partida de destino única. Indicá su nombre exacto o decí «en esta partida seleccionada».');
}

/** The additive response is still parsed through all normal ACU safety guards. */
export function parseAcuAdditions(text,seeds,resources,brief=''){
 let value;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{return parseAcuProposals(text,seeds,resources);}
 const problems=new Map(),notes=new Map();
 if(Array.isArray(value?.acu_proposals))for(const proposal of value.acu_proposals){
  const seed=seeds.find(item=>item.id===proposal.line_id),errors=[],distribution=[];
  if(Array.isArray(proposal.components))for(const component of proposal.components){
   if(component.quantity_scope!=null&&!['per_unit','total'].includes(component.quantity_scope))errors.push('Indicá si la adición es consumo por unidad o una cantidad total.');
   if(/\b(?:en total|cantidad total|totales|para toda la partida)\b/.test(fold(brief))&&component.quantity_scope!=='total')errors.push('El pedido indica una cantidad total: debe distribuirse por la cantidad de la partida, no cargarse como consumo por unidad.');
   if(component.quantity_scope!=='total')continue;
   const resource=resources.find(item=>item.id===component.resource_id);
   if(!seed||!resource||!component.quantity_unit||unit(component.quantity_unit)!==unit(resource.unit)||!positive(component.quantity)||!positive(seed.quantity)){
    errors.push('No se pudo distribuir la cantidad total: se necesita la cantidad positiva de la partida y la unidad real del insumo, sin asumir conversiones.');continue;
   }
   try{
    const safety=acuTotals({...emptyAcu(seed),components:[component]},resources).errors;
    if(safety.length){errors.push(...safety);continue;}
    const total=component.quantity,divided=divideDecimals(total,seed.quantity,8);
    if(compareDecimals(divided,'0')<=0)throw new Error();
    const rounded=compareDecimals(multiplyDecimals(divided,seed.quantity),total)!==0;
    distribution.push(`Adición total de ${total} ${resource.unit}${component.source_quantity!=null?` (origen: ${component.source_quantity} ${component.source_unit||''})`:''}, distribuida entre ${seed.quantity} unidades de partida: ${divided} ${resource.unit} por unidad.${rounded?' Se usaron 8 decimales; puede haber una diferencia residual de redondeo.':''}`);
    component.quantity=divided;
    if(component.source_quantity!=null){component.source_quantity=divided;component.source_unit=resource.unit;}
   }catch{errors.push('La cantidad total no puede distribuirse con la precisión admitida. Revisá el consumo por unidad.');}
  }
  if(errors.length)problems.set(proposal.line_id,errors);
  if(distribution.length)notes.set(proposal.line_id,distribution);
 }
 const rows=parseAcuProposals(JSON.stringify(value),seeds,resources);
 for(const row of rows){row.missing_resources.push(...(problems.get(row.id)||[]));row.assumptions.push(...(notes.get(row.id)||[]));}
 return rows;
}


/**
 * A successful append must actually include the explicitly requested fixtures,
 * not merely re-save an ACU containing labor. Similar names are only candidates.
 */
export function additionMissingFixtures(brief,seed,additions,resources){
 const instruction=fold(brief),target=fold(seed?.description);
 const requestedBoth=/\b(?:ambos|los dos|dos artefactos|dos sanitarios)\b/.test(instruction);
 const kinds=['inodoro','bidet'].filter(kind=>{
  const pattern=kind==='bidet'?/\b(?:bidet|bide)\b/:/\binodoro\b/;
  return pattern.test(instruction)||requestedBoth&&pattern.test(target);
 });
 if(!kinds.length||!/\b(?:artefactos?|material(?:es)?|inodoro|bidet|bide|sanitarios?)\b/.test(instruction))return [];
 if(/\b(?:mano de obra|colocacion|instalacion)\b/.test(instruction)&&!/\b(?:artefactos?|material(?:es)?)\b/.test(instruction))return [];
 const variant=/\b(?:linea|modelo)\s+([a-z][a-z0-9-]{2,})/.exec(instruction)?.[1]||null;
 return kinds.filter(kind=>!additions.some(component=>{
  const resource=resources.find(item=>item.id===component.resource_id);
  const name=fold(resource?.description);
  const nameMatches=kind==='bidet'?/\b(?:bidet|bide)\b/.test(name):/\binodoro\b/.test(name);
  return resource?.kind==='material'&&nameMatches&&(!variant||new RegExp('\\b'+variant+'\\b').test(name));
 })).map(kind=>'Falta el '+kind+(variant?' línea/modelo '+variant:'')+' solicitado como MATERIAL del catálogo. La mano de obra existente no lo reemplaza.');
}

/** Merge only positive additions. Existing rows and original section are fixed. */
export function mergeAcuAddition(row,resources,brief=''){
 const existing=structuredClone(row.seed.components||[]),additions=structuredClone(row.components);
 const required=additionMissingFixtures(brief,row.seed,additions,resources);
 const result={...row,components:existing,measurements:[],apply_measurements:false,section_id:row.seed.section_id||null,section_title:row.seed.section||'',selected:false,missing_resources:[...row.missing_resources,...required]};
 const errors=acuTotals({...row,missing_resources:result.missing_resources},resources).errors;
 if(!additions.length)errors.push('La propuesta no indicó ningún insumo adicional.');
 if(errors.length){
  result.components.push(...additions);result.missing_resources=[...row.missing_resources,'La adición necesita revisión; no se modificó la composición existente. '+errors.join(' · ')];return result;
 }
 for(const addition of additions){
  const previous=result.components.find(component=>component.resource_id===addition.resource_id);
  if(!previous){result.components.push(addition);continue;}
  const resource=resources.find(item=>item.id===addition.resource_id),before=previous.quantity;
  previous.quantity=sumDecimals([previous.quantity,addition.quantity]);previous.quantity_unit=resource.unit;
  previous.source_quantity=previous.quantity;previous.source_unit=resource.unit;
  previous.requested_description=addition.requested_description||resource.description;
  previous.consumption_support=`Composición existente: ${before} ${resource.unit}; adición aprobada: ${addition.quantity} ${resource.unit} por unidad de partida. ${addition.consumption_support||''}`.trim();
 }
 return result;
}

export function additionPreservationErrors(row){
 const errors=[];
 for(const original of row.seed.components||[]){
  const current=row.components.find(component=>component.resource_id===original.resource_id);
  try{if(!current||compareDecimals(current.quantity,original.quantity)<0)errors.push('La adición no puede quitar ni reducir un insumo de la composición existente.');}catch{errors.push('La composición existente debe conservar cantidades válidas.');}
 }
 if(row.apply_measurements)errors.push('La adición conserva los metrados existentes.');
 if((row.section_id||null)!==(row.seed.section_id||null)||!row.seed.section_id&&(row.section_title||'')!==(row.seed.section||''))errors.push('La adición conserva el rubro de la partida.');
 return [...new Set(errors)];
}
