import {multiplyDecimals,sumDecimals,divideDecimals,compareDecimals,numeric,money} from '../decimal.js';
import {buildCatalogContext} from './ai-catalog-context.js';

// The model requests only these read-only tools; native writes stay on the
// separately reviewed ACU/partida paths.
const NAMES=new Set(['calculate_takeoff','audit_budget','compare_estimates','search_catalog']);
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const value=v=>String(v??'');
const tidy=v=>String(v).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
function positive(v){
 if(typeof v!=='string'||!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(v)||compareDecimals(v,'0')<=0)throw new Error('Se requiere una cantidad positiva, sin separadores de miles.');
 return v;
}
export function parseBudgetToolCall(raw){
 if(!isObject(raw)||!NAMES.has(raw.name)||!isObject(raw.args)||JSON.stringify(raw).length>3000)return null;
 const a=raw.args;
 if(Object.values(a).some(v=>v!==null&&typeof v!=='string'))return null;
 if(raw.name==='calculate_takeoff'){
  if(!['rectangular_prism','rectangle'].includes(a.shape)||!['cm','m','mm'].includes(a.dimension_unit)||!a.length||!a.width||a.shape==='rectangular_prism'&&!a.height)return null;
  return {name:raw.name,args:{shape:a.shape,dimension_unit:a.dimension_unit,count:a.count||'1',length:a.length,width:a.width,...(a.height?{height:a.height}:{}),...(a.waste_percent?{waste_percent:a.waste_percent}:{}),description:(a.description||'elementos').slice(0,120)}};
 }
 if(raw.name==='search_catalog')return a.query?.trim()?{name:raw.name,args:{query:a.query.trim().slice(0,180)}}:null;
 if(raw.name==='compare_estimates')return {name:raw.name,args:a.baseline_id?{baseline_id:a.baseline_id}:{}};
 return {name:raw.name,args:{}};
}
export function calculateTakeoff(args){
 const parsed=parseBudgetToolCall({name:'calculate_takeoff',args});
 if(!parsed)throw new Error('Se necesitan dimensiones y unidades completas para calcular el metrado.');
 const a=parsed.args,meter=v=>a.dimension_unit==='m'?positive(v):divideDecimals(positive(v),a.dimension_unit==='cm'?'100':'1000',10);
 const count=positive(a.count),length=meter(a.length),width=meter(a.width);
 const height=a.shape==='rectangular_prism'?meter(a.height):null;
 const unit=height?'m³':'m²';
 const perUnit=height?multiplyDecimals(multiplyDecimals(length,width),height):multiplyDecimals(length,width);
 const quantity=tidy(multiplyDecimals(count,perUnit)),waste=a.waste_percent??'0';
 if(!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,6})?$/.test(waste)||compareDecimals(waste,'100')>0)throw new Error('Desperdicio inválido: indicá un porcentaje de 0 a 100.');
 const withWaste=tidy(sumDecimals([quantity,divideDecimals(multiplyDecimals(quantity,waste),'100',8)]));
 return {answer:'Cómputo de '+a.description+': '+numeric(count)+' × '+numeric(length)+' × '+numeric(width)+(height?' × '+numeric(height):'')+' m = '+numeric(quantity)+' '+unit+'.'+(compareDecimals(waste,'0')>0?' Incluyendo '+numeric(waste)+' % de desperdicio: '+numeric(withWaste)+' '+unit+'.':'')+' Cálculo geométrico; no incluye huecos ni sobreexcavación.',
  data:{unit,quantity,count,dimensions_m:[length,width,...(height?[height]:[])],with_waste:withWaste},read_only:true};
}
function valueStatus(v){
 if(v==null||value(v).trim()==='')return 'missing';
 try{return compareDecimals(value(v),'0')===0?'zero':'nonzero';}catch{return 'invalid';}
}
function olderThanYear(date,asOf){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const diff=Date.parse(asOf+'T00:00:00Z')-Date.parse(date+'T00:00:00Z');
 return Number.isFinite(diff)&&diff>365*86400000;
}
export function auditBudget({lines=[],resources=[],asOf='2026-11-10',estimateTitle='Presupuesto'}={}){
 const catalog=new Map(resources.map(r=>[r.id,r]));
 const totals={lines:lines.length,without_acu:0,zero_cost:0,missing_cost:0,component_issues:0,older_price:0,unit_warnings:0};
 const findings=[];
 for(const line of lines){
  const flags=[];
  if(!line.analysis_id&&!line.components?.length){totals.without_acu++;flags.push('sin ACU');}
  const status=valueStatus(line.unit_cost);
  if(status==='zero'){totals.zero_cost++;flags.push('costo unitario cero (puede ser intencional)');}
  if(['missing','invalid'].includes(status)){totals.missing_cost++;flags.push('precio unitario ausente o inválido');}
  const seenResources=new Set();
  for(const component of line.components||[]){
   if(seenResources.has(component.resource_id)){totals.component_issues++;flags.push('insumo repetido en el ACU: '+component.resource_id);}seenResources.add(component.resource_id);
   const resource=catalog.get(component.resource_id);
   if(!resource){totals.component_issues++;flags.push('insumo sin identidad de catálogo');continue;}
   if(valueStatus(component.quantity)!=='nonzero'){totals.component_issues++;flags.push('consumo no positivo de '+resource.description);}
   if(valueStatus(resource.price)==='missing'){totals.component_issues++;flags.push('sin precio verificable: '+resource.description);}
   if(resource.kind==='equipment'&&/\b(?:x|por)\s*(?:dia|día|jornada)\b/i.test(resource.description||'')&&!/^(?:dia|día|jornada|h|hs|hora|horas)$/i.test(resource.unit||'')){totals.unit_warnings++;flags.push('unidad de equipo a revisar: '+resource.description+' se describe por día pero figura en '+resource.unit);}
   if(olderThanYear(resource.effective_date,asOf)){totals.older_price++;flags.push('precio con más de 12 meses: '+resource.description);}
  }
  if(flags.length)findings.push({id:line.id,description:line.description,flags:[...new Set(flags)]});
 }
 const counts=[];
 if(totals.without_acu)counts.push(totals.without_acu+' sin ACU');
 if(totals.zero_cost)counts.push(totals.zero_cost+' con costo unitario cero');
 if(totals.missing_cost)counts.push(totals.missing_cost+' sin precio unitario válido');
 if(totals.component_issues)counts.push(totals.component_issues+' observaciones de insumos');
 if(totals.older_price)counts.push(totals.older_price+' precios con más de 12 meses');
 if(totals.unit_warnings)counts.push(totals.unit_warnings+' unidades de equipos inconsistentes');
 const details=findings.slice(0,6).map(x=>x.description+': '+x.flags.join(', '));
 return {answer:'Auditoría de '+estimateTitle+' ('+totals.lines+' partidas): '+(counts.join('; ')||'sin incidencias básicas')+'.'+(details.length?' Revisá: '+details.join(' · ')+'.':'')+' Estas señales requieren criterio técnico, no demuestran precios o rendimientos incorrectos.',
  data:{totals,findings},read_only:true};
}
export function formatEstimateComparison({baseline,revisedTitle,comparison}){
 if(!comparison||!Array.isArray(comparison.lines))throw new Error('La comparación no devolvió líneas válidas.');
 const rows=comparison.lines.filter(x=>valueStatus(x.difference)==='nonzero')
  .sort((a,b)=>Math.abs(Number(b.difference))-Math.abs(Number(a.difference))).slice(0,6);
 const details=rows.map(x=>x.description+': '+money(x.baseline_cost)+' → '+money(x.revised_cost)+' (Δ '+money(x.difference)+')');
 return {answer:'Comparación '+baseline.title+' → '+revisedTitle+': '+money(comparison.baseline_total)+' → '+money(comparison.revised_total)+' (Δ '+money(comparison.difference)+').'+(details.length?' Diferencias principales: '+details.join(' · ')+'.':' Sin diferencias devueltas por el motor de comparación.'),
  data:{baseline_id:comparison.baseline_id,revised_id:comparison.revised_id,lines:rows,difference:comparison.difference},read_only:true};
}
export async function executeBudgetTool(raw,{invoke,state,today}){
 const call=parseBudgetToolCall(raw);
 if(!call)throw new Error('La operación solicitada no está permitida o sus datos no son válidos.');
 if(call.name==='calculate_takeoff')return calculateTakeoff(call.args);
 if(!state.projectId||!state.estimateId||state.remoteProject)throw new Error('Abrí un presupuesto local para consultar costos.');
 if(call.name==='audit_budget'){
  const catalog=await invoke('ai_catalog_context',{projectId:state.projectId,estimateId:state.estimateId,asOf:today,currency:null});
  const estimate=state.estimates?.find(e=>e.id===state.estimateId);
  return auditBudget({lines:state.lines||[],resources:catalog.resources||[],asOf:today,estimateTitle:estimate?.title||'presupuesto'});
 }
 if(call.name==='search_catalog'){
  const catalog=await invoke('ai_catalog_context',{projectId:state.projectId,estimateId:state.estimateId,asOf:today,currency:null});
  const results=JSON.parse(buildCatalogContext({question:call.args.query,resources:catalog.resources||[],currency:catalog.currency,asOf:today}));
  const entries=[...results.matches,...results.related].slice(0,8);
  return {answer:entries.length?'Para '+call.args.query+' encontré: '+entries.map(r=>r.description+' ('+r.unit+', '+(r.price==null?'sin precio':money(r.price)+' '+catalog.currency)+')').join(' · ')+'.':'No encontré coincidencias claras para '+call.args.query+'.',
   data:results,read_only:true};
 }
 const versions=(await invoke('list_project_estimates',{projectId:state.projectId})).filter(e=>e.id!==state.estimateId);
 if(!versions.length)return {answer:'Esta obra no tiene otra versión de presupuesto para comparar.',data:{versions:[]},read_only:true};
 const explicitly=!!call.args.baseline_id;
 const chosen=explicitly?versions.filter(e=>e.id===call.args.baseline_id):versions.slice(0,6);
 if(!chosen.length)return {answer:'La versión solicitada no pertenece a las versiones disponibles de esta obra; no se efectuó la comparación.',data:{versions},read_only:true};
 const revisedTitle=state.estimates?.find(e=>e.id===state.estimateId)?.title||'actual';
 const results=[];
 for(const baseline of chosen){
  const comparison=await invoke('compare_estimates',{baselineId:baseline.id,revisedId:state.estimateId});
  results.push(formatEstimateComparison({baseline,revisedTitle,comparison}));
 }
 if(results.length===1)return results[0];
 return {answer:'Comparé '+results.length+' versiones de esta obra: '+results.map(r=>r.answer).join(' ') +
  (versions.length>chosen.length?' Otras '+(versions.length-chosen.length)+' versiones no se incluyeron en este resumen.':''),
  data:{comparisons:results.map(r=>r.data),compared:results.length,total:versions.length},read_only:true};
}
