import {normalize,importDecimal} from './ai-budget-import.js';
import {multiplyDecimals,sumDecimals,compareDecimals} from '../decimal.js';
export const expectedLine=line=>({description:line.description,unit:line.unit,quantity:line.quantity,unit_cost:line.unit_cost,analysis_id:line.analysis_id||null});
export function acuSeed(line){return {...line,is_new:false};}
export function newAcuSeeds(rows){return rows.map(r=>({id:r.new_id||globalThis.crypto.randomUUID(),description:r.description,unit:r.unit,quantity:r.quantity??'0',section:r.section||'',section_id:null,is_new:true,components:[],takeoffs:[],formula:null,analysis_id:null,expected_recipe:null,unit_cost:'0'}));}
export function emptyAcu(seed){return {id:seed.id,seed,selected:false,components:[],measurements:[],apply_measurements:false,section_id:seed.section_id||null,section_title:seed.section||'',assumptions:[],missing_resources:[],missing_resolved:false};}
function decimal(value,label){if(typeof value!=='string')throw new Error(`${label}: usá un decimal como texto`);const v=importDecimal(value.trim().replace(',','.'),'decimal',true);if(v==null)throw new Error(`${label}: falta el dato`);return v;}
export function parseAcuProposals(text,seeds,allowedResources){
 let value;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('La respuesta de ACU está incompleta o no tiene el formato esperado. Acotá los criterios y volvé a solicitar las partidas pendientes');}
 if(!Array.isArray(value.acu_proposals)||!value.acu_proposals.length||value.acu_proposals.length>5)throw new Error('La IA no devolvió una lista completa de ACU (máximo 5 por consulta)');
 const allowed=new Set(allowedResources.map(r=>r.id)),seen=new Set();
 const proposals=value.acu_proposals.map(p=>{
  const seed=seeds.find(s=>s.id===p.line_id);if(!seed||seen.has(p.line_id))throw new Error('La IA indicó una partida ajena a la consulta o repetida');seen.add(p.line_id);
  if(!Array.isArray(p.components)||p.components.length>100)throw new Error('Lista de insumos inválida');
  const resources=new Set();const components=p.components.map(c=>{
   if(!allowed.has(c.resource_id)||resources.has(c.resource_id))throw new Error('La IA usó un insumo desconocido o repetido; no se incorporó esa consulta');resources.add(c.resource_id);
   const quantity=decimal(c.quantity,'Consumo');if(compareDecimals(quantity,'0')<=0)throw new Error('Los consumos deben ser mayores que cero');return {resource_id:c.resource_id,quantity};
  });
  if(p.measurements!=null&&!Array.isArray(p.measurements)||p.measurements?.length>100)throw new Error('Mediciones inválidas');
  const measurements=(p.measurements||[]).map(m=>{
   if(![1,-1].includes(m.sign)||typeof m.note!=='string'||m.note.length>500)throw new Error('Signo o descripción de medición inválidos');
   return {note:m.note,factor:decimal(m.factor,'Factor'),length:decimal(m.length,'Largo'),width:decimal(m.width,'Ancho'),height:decimal(m.height,'Alto'),sign:m.sign};
  });
  const notes=key=>{if(p[key]==null)return [];if(!Array.isArray(p[key])||p[key].length>20||p[key].some(s=>typeof s!=='string'||s.length>500))throw new Error('Notas del ACU inválidas');return p[key];};
  if(p.section!=null&&(typeof p.section!=='string'||p.section.length>100))throw new Error('Rubro inválido');
  const proposal={...emptyAcu(seed),components,measurements,assumptions:['Consumos propuestos por IA: revisar por unidad y condiciones de ejecución.',...notes('assumptions')],missing_resources:notes('missing_resources')};
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
 const map=new Map(resources.map(r=>[r.id,r])),errors=[],warnings=[];let cost='0';const seen=new Set();
 if(!row.components.length)errors.push('Falta la composición del ACU');
 for(const c of row.components){
  const r=map.get(c.resource_id);
  if(!r){errors.push('Hay un insumo no disponible');continue;}
  if(seen.has(r.id)){errors.push('Insumo repetido: '+r.description);continue;}seen.add(r.id);
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
