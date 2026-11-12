import {parseAiResourceProposals,reviewAiResourceRows} from './ai-resource-import.js';

const decimal=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const clean=value=>String(value??'').trim();
const json=text=>{
 if(typeof text!=='string'||text.length>200000)throw new Error('Respuesta demasiado extensa');
 try{return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
 catch{throw new Error('La IA no devolvió una propuesta JSON completa. Volvé a pedirla sin guardar cambios.');}
};
export const isConversationApproval=question=>/^(?:s[ií]|dale|ok|perfecto|adelante|aprob[áa]|apruebo|acepto|confirmo|guard[áa]|carg[áa]|aplic[áa]|hacelo|s[ií][, ]+cargalos|s[ií][, ]+guardalos|aprob[áa] y carg[áa]|aprob[áa] y guard[áa]|s[ií][, ]+aprob[áa] y carg[áa])(?:\s+(?:todo|todos|la propuesta|el pedido|directamente|por favor))*[.!]?$/.test(clean(question).toLocaleLowerCase('es-AR'));
export const isConversationCancel=question=>/^(?:cancel[áa]|descart[áa]|anul[áa]|olvidalo|no lo cargues|no guardar|cancelar propuesta)[.!]?$/.test(clean(question).toLocaleLowerCase('es-AR'));
export function conversationIntent(view,question){
 const q=clean(question).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const action=/\b(?:crea|agrega|carga|genera|prepara|arma|completa|incorpora|registra|hace)(?:r|me|lo|la|los|las)?\b|\b(?:necesito|quiero|quisiera)\b/;
 if(!action.test(q)||/^(?:como|que|cual|donde|por que|cuanto)\b/.test(q))return null;
 if(view==='resources')return 'resources';
 if(view==='analyses')return 'generic_acu';
 if(view==='projects'&&/\b(?:acus?|analisis (?:de costo|de precio) unitario|biblioteca de acus?)\b/.test(q))return 'generic_acu';
 return null;
}
export function proposalPrompt(kind,question,previous=null){
 if(kind==='resources'){
  return ['TAREA: preparar propuesta de ALTAS de insumos para biblioteca. No ejecutar ni afirmar guardado. Devolvé SOLO JSON con answer (resumen claro) y resource_proposals: lista de 1 a 60 objetos {description,kind,unit,price:null}. kind: material/labor/equipment/subcontract. No agregues insumos que el usuario no pidió. Si falta unidad o tipo, dejalos como cadena vacía y mencioná la información pendiente. Los precios de la IA se descartan; no inventarlos. Ante una modificación de la propuesta anterior, devolvé la lista COMPLETA corregida, conservando los demás elementos.','PEDIDO / CORRECCIÓN DEL USUARIO:\n'+question,previous?'PROPUESTA ANTERIOR SIN GUARDAR:\n'+JSON.stringify(previous):''].filter(Boolean).join('\n\n');
 }
 if(kind==='generic_acu'){
  return ['TAREA: preparar hasta 5 ACU GENÉRICOS para la biblioteca ACU de CPObras, NO partidas de presupuesto. No guardar. Devolvé SOLO JSON con answer y generic_acu_proposals: [{description,unit,components:[{resource_id,quantity,quantity_unit}],assumptions:[texto],missing_resources:[texto]}]. Cada quantity es el consumo por UNA unidad de ACU en la misma unidad exacta del insumo. resource_id DEBE ser un UUID real del catálogo que se entrega; NO inventar ni cambiar tipo/unidad, ni precios. No incluir precios en la respuesta. Si falta un insumo o conversión, registrarlo en missing_resources; no sustituirlo por uno parecido. Se calculan los costos localmente a partir del catálogo de precios ARS. Ante corrección, devolver TODOS los ACU completos conservando los componentes y rendimientos no mencionados.','PEDIDO / CORRECCIÓN DEL USUARIO:\n'+question,previous?'PROPUESTA ANTERIOR SIN GUARDAR:\n'+JSON.stringify(previous):''].filter(Boolean).join('\n\n');
 }
 throw new Error('Tipo de preparación no soportado');
}
export function parseConversationProposal(kind,response,catalog,existing=[]){
 const parsed=json(response);
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||typeof parsed.answer!=='string')throw new Error('Falta la explicación de la propuesta');
 if(kind==='resources'){
  const rows=parseAiResourceProposals(response,existing);
  return {kind,answer:parsed.answer,rows:rows.map(row=>({description:row.description,kind:row.kind,unit:row.unit,price:null})),errors:reviewAiResourceRows(rows,existing).flatMap((row,index)=>row.errors.map(error=>String(index+1)+': '+error))};
 }
 if(kind!=='generic_acu')throw new Error('Tipo de propuesta desconocido');
 const list=parsed.generic_acu_proposals;
 if(!Array.isArray(list)||!list.length||list.length>5)throw new Error('Necesito entre 1 y 5 ACU por propuesta');
 const known=new Map((catalog?.resources||[]).map(r=>[r.id,r])),seenNames=new Set();
 const rows=list.map((item,index)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('ACU inválido');
  const description=clean(item.description),unit=clean(item.unit);
  if(!description||description.length>500||!unit||unit.length>30)throw new Error('Falta la descripción o unidad del ACU '+(index+1));
  const identity=description.toLowerCase()+'|'+unit.toLowerCase();
  if(seenNames.has(identity))throw new Error('ACU repetido: '+description);
  seenNames.add(identity);
  if(!Array.isArray(item.components)||item.components.length>100)throw new Error('Composición de ACU inválida');
  const errors=[],used=new Set(),components=[];
  for(const component of item.components){
   const resource=known.get(component?.resource_id),quantity=clean(component?.quantity);
   if(!resource){errors.push('Insumo inexistente o no incluido en el catálogo');continue;}
   if(used.has(resource.id)){errors.push('Insumo duplicado: '+resource.description);continue;}
   used.add(resource.id);
   if(!decimal.test(quantity)||Number(quantity)<=0){errors.push('Consumo inválido: '+resource.description);continue;}
   if(clean(component.quantity_unit)!==clean(resource.unit)){errors.push('Unidad distinta al catálogo: '+resource.description);continue;}
   if(resource.price==null){errors.push('Insumo sin precio ARS: '+resource.description);continue;}
   components.push({resource_id:resource.id,quantity,unit_price:clean(resource.price),description:resource.description,unit:resource.unit});
  }
  const notes=key=>Array.isArray(item[key])?item[key].filter(t=>typeof t==='string').map(clean).filter(Boolean).slice(0,15):[];
  const missing=notes('missing_resources');if(missing.length)errors.push('Faltan insumos o datos: '+missing.join(' · '));
  if(!components.length)errors.push('El ACU no contiene componentes válidos');
  if(existing.some(a=>clean(a.description).toLowerCase()===description.toLowerCase()&&clean(a.unit).toLowerCase()===unit.toLowerCase()))errors.push('Ya existe un ACU con esa descripción y unidad');
  return {description,unit,components,assumptions:notes('assumptions'),missing_resources:missing,errors};
 });
 return {kind,answer:parsed.answer,rows,errors:rows.flatMap((row,i)=>row.errors.map(error=>String(i+1)+': '+error))};
}
export function describeConversationProposal(draft){
 const lines=draft.rows.map((row,index)=>{
  if(draft.kind==='resources')return (index+1)+'. '+(row.description||'Sin descripción')+' · '+(row.kind||'Tipo pendiente')+' · '+(row.unit||'Unidad pendiente');
  const cs=row.components.map(c=>c.description+': '+c.quantity+' '+c.unit+' / '+row.unit).join('; ');
  return (index+1)+'. '+row.description+' ('+row.unit+')'+(row.unit_cost!=null?' · '+row.unit_cost+' ARS/'+row.unit:'')+'\n   '+(cs||'Sin componentes')+(row.missing_resources?.length?'\n   Faltantes: '+row.missing_resources.join(', '):'');
 });
 return lines.join('\n')+'\n'+(draft.errors.length?'\nPendientes de resolver:\n'+draft.errors.join('\n')+'\nCorregilos por mensaje antes de aprobar.':'\nSi está correcto, respondé «apruebo» y lo guardaré. Podés pedir cualquier cambio escribiéndolo.');
}
