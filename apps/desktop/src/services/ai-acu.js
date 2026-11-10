import {normalize,importDecimal} from './ai-budget-import.js';
import {multiplyDecimals,sumDecimals,compareDecimals} from '../decimal.js';
export const expectedLine=line=>({description:line.description,unit:line.unit,quantity:line.quantity,unit_cost:line.unit_cost,analysis_id:line.analysis_id||null});
export function acuSeed(line){return {...line,is_new:false};}
export function newAcuSeeds(rows){return rows.map(r=>({id:r.new_id||globalThis.crypto.randomUUID(),description:r.description,unit:r.unit,quantity:r.quantity??'0',section:r.section||'',section_id:null,is_new:true,components:[],takeoffs:[],formula:null,analysis_id:null,expected_recipe:null,unit_cost:'0'}));}
export function emptyAcu(seed){return {id:seed.id,seed,selected:false,components:[],measurements:[],apply_measurements:false,section_id:seed.section_id||null,section_title:seed.section||'',assumptions:[],missing_resources:[],missing_resolved:false};}
function decimal(value,label){if(typeof value!=='string')throw new Error(`${label}: usá un decimal como texto`);const v=importDecimal(value.trim().replace(',','.'),'decimal',true);if(v==null)throw new Error(`${label}: falta el dato`);return v;}
// Notes are explanatory text, not a write schema. Providers sometimes return a
// string or descriptive objects despite the requested array format. Normalize
// them without relaxing consumptions, target IDs or the rules for saving below.
function acuNotes(value,pending=false){
 if(value==null)return [];
 const notes=[],encoder=new TextEncoder(),limit=4000,maxEntries=40;
 const marker=pending?'Hay más datos pendientes indicados por IA; revisalos antes de aplicar.':'Notas recortadas por extensión: revisá las hipótesis antes de aplicar.';
 const available=limit-encoder.encode(marker).length-1;
 let bytes=0,nodes=0,truncated=false;
 function cut(text,budget){
  let end=0,used=0;
  for(const char of text){const code=char.codePointAt(0),size=code<=0x7f?1:code<=0x7ff?2:code<=0xffff?3:4;if(used+size>budget)break;used+=size;end+=char.length;}
  return text.slice(0,end);
 }
 function add(text){
  text=String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,' ').trim();if(!text)return;
  if(notes.length>=maxEntries){truncated=true;return;}
  const size=encoder.encode(text).length,remaining=available-bytes-(notes.length?1:0);
  if(size>remaining){const excerpt=cut(text,Math.max(0,remaining));if(excerpt){notes.push(excerpt);bytes+=encoder.encode(excerpt).length+(notes.length>1?1:0);}truncated=true;return;}
  notes.push(text);bytes+=size+(notes.length>1?1:0);
 }
 function visit(item,path='',depth=0,inArray=false){
  if(truncated)return;
  if(++nodes>512||depth>6){truncated=true;return;}
  if(item==null){if(path||inArray)add(path?path+': sin detalle':'Dato indicado por IA sin descripción');return;}
  if(typeof item==='string'||typeof item==='number'||typeof item==='boolean'){
   const text=typeof item==='boolean'?(item?'sí':'no'):String(item);
   add(path?path+': '+text:text);return;
  }
  if(Array.isArray(item)){for(const entry of item){visit(entry,path,depth+1,true);if(truncated)break;}return;}
  if(typeof item==='object'){
   const entries=Object.entries(item);if(!entries.length&&(path||inArray))add(path?path+': sin detalle':'Dato indicado por IA sin descripción');
   for(const [key,entry] of entries){
    const next=path?path+' · '+key:key;
    if(next.length>300){truncated=true;break;}
    visit(entry,next,depth+1);if(truncated)break;
   }
   return;
  }
  add(path?path+': dato sin descripción':'Dato indicado por IA sin descripción');
 }
 visit(value);
 if(truncated)notes.push(marker);
 return notes;
}
// These are identity aliases only: kg/bolsa and hora/jornal are never aliases.
function consumptionUnit(value){
 const unit=normalize(value);
 const aliases={kilogramo:'kg',kilogramos:'kg',kilo:'kg',kilos:'kg',gramo:'g',gramos:'g',gr:'g',bolsas:'bolsa',hora:'h',horas:'h',hr:'h',hs:'h',jornal:'jor',jornales:'jor',jorn:'jor',unidad:'un',unidades:'un',u:'un',ud:'un',uds:'un',metro:'m',metros:'m',metro2:'m2',metro3:'m3'};
 return aliases[unit]||unit;
}
function componentEvidence(component){
 const evidence={};
 for(const [field,label,max] of [['quantity_unit','Unidad del consumo',50],['requested_description','Descripción del insumo requerido',500],['consumption_support','Fundamento del consumo',1500],['source_unit','Unidad del consumo de origen',50]]){
  if(component[field]==null)continue;
  if(typeof component[field]!=='string'||component[field].length>max)throw new Error(`${label} inválida`);
  evidence[field]=component[field].trim();
 }
 if(component.source_quantity!=null&&component.source_quantity!==''){
  evidence.source_quantity=decimal(component.source_quantity,'Consumo de origen');
  if(compareDecimals(evidence.source_quantity,'0')<=0)throw new Error('El consumo de origen debe ser mayor que cero');
 }
 return evidence;
}
function masonryFamily(description){
 const text=normalize(description);
 if(/\bladrillos?\b(?:\s+\w+){0,3}\s+ceramicos?\b/.test(text))return 'ceramic';
 if(/\bbloques?\b(?:\s+\w+){0,3}\s+(?:cemento|hormigon)\b/.test(text))return 'concrete';
 return '';
}
function masonryTarget(description){
 const text=normalize(description);
 // A ceramic substrate mentioned in a plaster/finish item is not a brick order.
 if(/\b(?:revoques?|revestimientos?|pinturas?|impermeabilizacion|azotados?|enlucidos?)\b/.test(text))return '';
 return /\b(?:mamposteria|pared|paredes|muros?|ladrillos?|bloques?)\b/.test(text)?masonryFamily(text):'';
}
function catalogBagWeight(resource){
 // Read only an unambiguous package mass from the real catalog description.
 // A model-supplied conversion factor or package description is never trusted.
 const description=String(resource.description||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const weights=[...description.matchAll(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*(?:kg|kilogramos?|kilos?)\b/g)];
 if(weights.length!==1)return null;
 try{const weight=decimal(weights[0][1],'Peso del envase');return compareDecimals(weight,'0')>0?weight:null;}catch{return null;}
}
function componentSafetyErrors(row,component,resource){
 const errors=[],label=resource.description,unit=consumptionUnit(resource.unit);
 const declared=consumptionUnit(component.quantity_unit||'');
 if(declared&&declared!==unit)errors.push(`Unidad de consumo incompatible: ${label} declara ${component.quantity_unit}, pero el catálogo usa ${resource.unit}. Corregí el consumo en la unidad del catálogo.`);
 const sourceUnit=consumptionUnit(component.source_unit||''),sourceQuantity=component.source_quantity;
 if(sourceUnit||sourceQuantity!=null&&sourceQuantity!==''){
  if(!sourceUnit||sourceQuantity==null||sourceQuantity==='')errors.push(`Falta cantidad o unidad del consumo de origen: ${label}`);
  else{
   let matches=false;
   try{
    const quantity=decimal(String(component.quantity),'Consumo'),source=decimal(String(sourceQuantity),'Consumo de origen');
    if(sourceUnit===unit)matches=compareDecimals(quantity,source)===0;
    else if(unit==='bolsa'&&sourceUnit==='kg'){
     const weight=catalogBagWeight(resource);
     matches=!!weight&&compareDecimals(multiplyDecimals(quantity,weight),source)===0;
    }
   }catch{}
   if(!matches)errors.push(`Consumo de origen incompatible: ${label}. Revisá la cantidad y su conversión de ${component.source_unit} a ${resource.unit}; no se aplica una conversión automática.`);
  }
 }
 const actual=masonryFamily(resource.description);
 const requested=masonryFamily(component.requested_description||''),target=masonryTarget(row.seed.description);
 if(actual&&[requested,target].some(family=>family&&family!==actual))errors.push(`Material incompatible: ${label} no corresponde a la mampostería requerida en ${row.seed.description}. Elegí el insumo compatible; no se sustituye ladrillo cerámico por bloque de cemento u hormigón.`);
 return errors;
}
export function parseAcuProposals(text,seeds,allowedResources){
 let value;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('La respuesta de ACU está incompleta o no tiene el formato esperado. Acotá los criterios y volvé a solicitar las partidas pendientes');}
 if(!Array.isArray(value.acu_proposals)||!value.acu_proposals.length||value.acu_proposals.length>5)throw new Error('La IA no devolvió una lista completa de ACU (máximo 5 por consulta)');
 const allowed=new Set(allowedResources.map(r=>r.id)),seen=new Set();
 const proposals=value.acu_proposals.map(p=>{
  const seed=seeds.find(s=>s.id===p.line_id);if(!seed||seen.has(p.line_id))throw new Error('La IA indicó una partida ajena a la consulta o repetida');seen.add(p.line_id);
  if(!Array.isArray(p.components)||p.components.length>100)throw new Error('Lista de insumos inválida');
  const resources=new Set();let unknown=false,repeated=false;const components=p.components.map(c=>{
   const quantity=decimal(c.quantity,'Consumo');if(compareDecimals(quantity,'0')<=0)throw new Error('Los consumos deben ser mayores que cero');
   const evidence=componentEvidence(c);
   if(!allowed.has(c.resource_id)){
    unknown=true;
    const hint=[c.description,c.resource_code,c.resource_id].find(value=>typeof value==='string'&&value.trim())||'Insumo pendiente de identificar';
    return {resource_id:'',quantity,description:hint.replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,500)||'Insumo pendiente de identificar',...evidence};
   }
   if(resources.has(c.resource_id))repeated=true;resources.add(c.resource_id);
   return {resource_id:c.resource_id,quantity,...evidence};
  });
  if(p.measurements!=null&&!Array.isArray(p.measurements)||p.measurements?.length>100)throw new Error('Mediciones inválidas');
  const measurements=(p.measurements||[]).map(m=>{
   if(![1,-1].includes(m.sign)||typeof m.note!=='string'||m.note.length>500)throw new Error('Signo o descripción de medición inválidos');
   return {note:m.note,factor:decimal(m.factor,'Factor'),length:decimal(m.length,'Largo'),width:decimal(m.width,'Ancho'),height:decimal(m.height,'Alto'),sign:m.sign};
  });
  const notes=key=>acuNotes(p[key],key==='missing_resources');
  if(p.section!=null&&(typeof p.section!=='string'||p.section.length>100))throw new Error('Rubro inválido');
  const review=[];
  if(unknown)review.push('La IA indicó insumos fuera del catálogo seleccionado. Elegí un insumo real para cada campo pendiente y revisá sus consumos antes de guardar.');
  if(repeated)review.push('La IA repitió insumos; sus consumos se conservaron por separado, sin sumarlos. Quitá o cambiá los repetidos después de revisarlos.');
  const proposal={...emptyAcu(seed),components,measurements,assumptions:['Consumos propuestos por IA: revisar por unidad y condiciones de ejecución.',...review,...notes('assumptions')],missing_resources:notes('missing_resources')};
  if(p.section&&normalize(p.section)!==normalize(seed.section)){proposal.section_id=null;proposal.section_title=p.section;}
  return proposal;
 });
 for(const seed of seeds)if(!seen.has(seed.id))proposals.push({...emptyAcu(seed),missing_resources:['La IA no devolvió una receta para esta partida. Completala o descartá la propuesta y volvé a solicitarla.']});
 return proposals;
}
export function measurementQuantity(rows){
 if(!rows.length)return null;
 return sumDecimals(rows.map(m=>{
  if(![1,-1].includes(Number(m.sign)))throw new Error('Signo inválido');
  const result=['factor','length','width','height'].reduce((value,key)=>multiplyDecimals(value,decimal(String(m[key]??''),key)),'1');
  return Number(m.sign)===-1?multiplyDecimals(result,'-1'):result;
 }));
}
export function acuTotals(row,resources){
 const map=new Map(resources.map(r=>[r.id,r])),errors=[],warnings=[];
 const notes=(row.assumptions||[]).join('\n')+(row.missing_resolved?'\nFaltantes revisados y resueltos por el usuario.':'');if(new TextEncoder().encode(notes).length>6000)errors.push('Acotá las notas de hipótesis antes de guardar');
 let cost='0';const seen=new Set();
 if(!row.components.length)errors.push('Falta la composición del ACU');
 for(const c of row.components){
  const r=map.get(c.resource_id);
  if(!r){errors.push('Hay un insumo no disponible');continue;}
  if(seen.has(r.id)){errors.push('Insumo repetido: '+r.description);continue;}seen.add(r.id);
  errors.push(...componentSafetyErrors(row,c,r));
  if(!c.quantity_unit)warnings.push('Unidad de consumo no declarada por IA: '+r.description+'. Revisá el consumo manualmente.');
  if(r.price==null){errors.push('Sin precio: '+r.description);continue;}
  if(compareDecimals(r.price,'0')===0)warnings.push('Precio cero: '+r.description);
  try{const q=decimal(String(c.quantity),'Consumo');if(compareDecimals(q,'0')<=0)throw new Error();cost=sumDecimals([cost,multiplyDecimals(q,r.price)]);}catch{errors.push('Consumo inválido: '+r.description);}
 }
 if(row.missing_resources.length&&!row.missing_resolved)errors.push('Hay faltantes indicados por IA pendientes de resolver');
 let quantity=row.seed.quantity||'0';
 if(row.apply_measurements){try{quantity=measurementQuantity(row.measurements);if(quantity==null||compareDecimals(quantity,'0')<0)throw new Error();}catch{errors.push('La medición está incompleta o su resultado es negativo');}}
 try{quantity=decimal(String(quantity),'Cantidad total');}catch{errors.push('Cantidad total inválida');quantity='0';}
 return {errors,warnings,unit_cost:errors.length?null:cost,quantity,total:errors.length?null:multiplyDecimals(quantity,cost)};
}
// Preapproval waives per-row confirmation, not catalog, unit or material checks.
// Legacy recipes remain manually reviewable but cannot be automatically saved
// without explicit consumption units, requested identity and supporting criteria.
export function acuPreapprovalErrors(row,resources){
 const errors=[...acuTotals(row,resources).errors],catalog=new Map(resources.map(resource=>[resource.id,resource]));
 for(const component of row.components){
  const resource=catalog.get(component.resource_id),label=resource?.description||component.description||'Insumo pendiente';
  for(const [field,description] of [['quantity_unit','unidad de consumo'],['requested_description','descripción del insumo requerido'],['consumption_support','fundamento del consumo']]){
   if(typeof component[field]!=='string'||!component[field].trim())errors.push(`Falta ${description} explícita para la carga preaprobada: ${label}`);
  }
 }
 return [...new Set(errors)];
}
export function copyAcuExample(seed,example){
 if(normalize(seed.unit)!==normalize(example.unit))throw new Error('La unidad de la receta no coincide con la partida. Adaptá los consumos explícitamente antes de reutilizarla');
 return {...emptyAcu(seed),components:example.components.map(c=>({resource_id:c.resource_id,quantity:c.quantity,description:c.description||''})),assumptions:[`Receta copiada de ${example.source_title||example.description||'referencia seleccionada'}. Revisar consumos, unidades actuales y condiciones de ejecución. Se usan los precios del presupuesto o catálogo actual.`]};
}
export function acuPromptContext(seeds,resources,examples,brief){
 const tokens=s=>new Set(normalize(s).split(' ').filter(x=>x.length>2));
 const words=tokens(seeds.map(s=>s.description).join(' ')+' '+brief);
 const ranked=examples.map(e=>({e,score:[...tokens(e.description)].filter(w=>words.has(w)).length+(seeds.some(s=>normalize(s.unit)===normalize(e.unit))?1:0)})).sort((a,b)=>b.score-a.score).slice(0,8).map(({e})=>({key:e.key,reference:e.source_title||e.description,description:e.description,unit:e.unit,section:e.section,components:e.components.map(c=>({resource_id:c.resource_id,description:c.description,quantity:c.quantity}))}));
 const payload={task:'acu',targets:seeds.map(s=>({line_id:s.id,description:s.description,unit:s.unit,quantity:s.quantity,section:s.section,is_new:s.is_new,existing_components:s.components,existing_measurements:s.takeoffs?.map(m=>({note:m.note,factor:m.factor,length:m.length,width:m.width,height:m.height,sign:m.sign}))})),resources:resources.map(r=>({resource_id:r.id,code:r.code,description:r.description,unit:r.unit,kind:r.kind,has_price:r.price!=null})),examples:ranked};
 const text=JSON.stringify(payload);if(new TextEncoder().encode(text).length>127000)throw new Error('El catálogo y los ejemplos superan el límite de contexto. Seleccioná menos insumos para la IA');return text;
}
export function acuBatch({rows,context,estimate,newEstimate,batchId,asOf}){
 const selected=rows.filter(r=>r.selected);if(!selected.length)throw new Error('Marcá las recetas revisadas que querés aplicar');
 const resources=new Map(context.resources.map(r=>[r.id,r])),ids=new Set(),creates=[],acus=[];
 for(const row of selected){
  if(ids.has(row.id))throw new Error('Hay partidas repetidas');ids.add(row.id);
  const totals=acuTotals(row,context.resources);if(totals.errors.length)throw new Error(row.seed.description+': '+totals.errors.join(' · '));
  const seed=row.seed;if(!seed.description.trim()||!seed.unit.trim())throw new Error('Falta descripción o unidad');
  if(seed.is_new)creates.push({id:seed.id,description:seed.description,unit:seed.unit,quantity:decimal(String(seed.quantity||'0'),'Cantidad total'),unit_price:'0',section:null});
  const notes=row.assumptions.join('\n')+(row.missing_resolved?'\nFaltantes revisados y resueltos por el usuario.':'');if(new TextEncoder().encode(notes).length>6000)throw new Error('Acotá las notas de hipótesis del ACU antes de aplicar');
  acus.push({line_id:seed.id,expected:seed.is_new?null:expectedLine(seed),expected_recipe:seed.expected_recipe||null,expected_section:seed.section_id||null,as_of:asOf,components:row.components.map(c=>({resource_id:c.resource_id,quantity:decimal(String(c.quantity),'Consumo'),expected_resource:resources.get(c.resource_id)})),section_id:row.section_id||null,section_title:row.section_id?null:row.section_title,measurements:row.apply_measurements?row.measurements.map(m=>({...m,...Object.fromEntries(['factor','length','width','height'].map(field=>[field,decimal(String(m[field]),field)])),sign:Number(m.sign)})):null,expected_takeoffs:seed.takeoffs||[],expected_formula:seed.formula||null,notes});
 }
 return {id:batchId,estimate_id:estimate.id,currency:context.currency,new_estimate:newEstimate,updates:[],creates,deletes:[],acus};
}
