// Verified, narrow read adapters. NEVER dispatch a model-supplied native name,
// args, SQL or arbitrary data. Results are reduced to bounded summaries.
import {AI_NATIVE_INVENTORY} from './ai-native-inventory.generated.js';

const present=new Set(AI_NATIVE_INVENTORY.native.filter(n=>n.allowed).map(n=>n.name));
const clamp=(value,size=100)=>String(value??'').slice(0,size);
const arr=value=>Array.isArray(value)?value:[];
const status=row=>row?.status||row?.state||row?.document?.status||null;
const summary=(items,limit=6)=>({
 count:items.length,
 sample:items.slice(0,limit).map(item=>({
  id:typeof item?.id==='string'?item.id:null,
  title:clamp(item?.title||item?.name||item?.number||item?.description||item?.document?.number||'',110),
  status:clamp(status(item)||'',40)
 }))
});
const descriptors={
 procurement:[
  {command:'list_quotation_requests',args:state=>({projectId:state.projectId}),label:'solicitudes_de_cotizacion'},
  {command:'list_supplier_orders',args:state=>({projectId:state.projectId,kind:'material'}),label:'pedidos_de_materiales'}
 ],
 subcontracts:[
  {command:'list_supplier_orders',args:state=>({projectId:state.projectId,kind:'subcontract'}),label:'pedidos_de_subcontratacion'}
 ],
 planning:[
  {command:'get_project_plan',args:state=>({projectId:state.projectId}),label:'plan'},
  {command:'list_plan_baselines',args:state=>({projectId:state.projectId}),label:'lineas_base'}
 ],
 sitebook:[{command:'list_site_entries',args:state=>({projectId:state.projectId,page:0}),label:'partes'}],
 certificates:[{command:'list_certificate_drafts',args:state=>({projectId:state.projectId,estimateId:state.estimateId}),label:'certificados'}],
 finance:[{command:'list_operations',args:state=>({projectId:state.projectId}),label:'operaciones_financieras'}],
 stock:[{command:'list_warehouses',args:()=>({}),label:'depositos'}],
 budgets:[{command:'list_project_estimates',args:state=>({projectId:state.projectId}),label:'presupuestos'}],
 projects:[{command:'list_project_estimates',args:state=>({projectId:state.projectId}),label:'presupuestos_de_la_obra'}]
};
export const INSPECTABLE_MODULES=Object.freeze(Object.keys(descriptors));

export async function inspectAppModule(module,{invoke,state}){
 if(typeof invoke!=='function'||!descriptors[module])throw new Error('Módulo no habilitado para consulta automática.');
 if(!state.projectId||state.remoteProject)throw new Error('Abrí una obra local propia para consultar información del módulo.');
 if(module==='certificates'&&!state.estimateId)throw new Error('Elegí un presupuesto para revisar sus certificados.');
 const result={},warnings=[];
 for(const step of descriptors[module]){
  if(!present.has(step.command)){warnings.push(step.command+' no está disponible en esta versión; no se consultó.');continue;}
  try{
   const data=await invoke(step.command,step.args(state));
   if(module==='sitebook'&&step.label==='partes'){
    result[step.label]={...summary(arr(data?.entries)),total:Number.isSafeInteger(data?.total)?data.total:arr(data?.entries).length,page:0};
   }else if(module==='stock'&&step.label==='depositos'){
    result[step.label]=summary(arr(data).filter(item=>item.project_id===state.projectId));
   }else if(step.label==='plan'){
    // A plan object is potentially large; only expose counts, never full
    // unreviewed configuration, financial totals or notes.
    const plan=data?.plan??data;
    result.plan={exists:!!plan,revision:typeof data?.revision==='number'?data.revision:null,
     tasks:arr(plan?.tasks).length};
   }else result[step.label]=summary(arr(data));
  }catch(error){
   warnings.push('No se pudo consultar '+step.label+': '+clamp(error,180));
  }
 }
 return {answer:'Consulta de '+module+' en la obra actual: '+Object.entries(result).map(([key,v])=>key+': '+(v.total??v.count??(v.exists?'plan disponible':'sin plan'))).join('; ')+'. '+(warnings.length?'Advertencias: '+warnings.join(' '):'Los datos no se modificaron.'),
  data:{module,project_id:state.projectId,estimate_id:state.estimateId||null,results:result,warnings},read_only:true};
}

export async function focusedAppSnapshot(question,{invoke,state}){
 if(!state.projectId||state.remoteProject)return '';
 const q=String(question||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const choices=[
  ['procurement',/\b(?:compras?|cotizacion(?:es)?|proveedores?|orden(?:es)? de compra)\b/],
  ['sitebook',/\b(?:libro de obra|partes? diarios?|bitacora)\b/],
  ['planning',/\b(?:cronograma|gantt|planificacion|plazos?)\b/],
  ['certificates',/\b(?:certificados?|certificaciones?)\b/],
  ['finance',/\b(?:finanzas|caja|pagos?|cobros?|deudas?)\b/]
 ];
 const match=choices.find(([,pattern])=>pattern.test(q));if(!match)return '';
 const value=await inspectAppModule(match[0],{invoke,state});
 const concise={module:match[0],project_id:state.projectId,summary:value.data.results,warnings:value.data.warnings};
 return 'CONSULTA REAL DE SOLO LECTURA DEL MÓDULO (sin cambios):\n'+JSON.stringify(concise).slice(0,2800);
}
