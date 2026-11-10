import {parsePlan,reviewedBatch,normalize} from './ai-budget-import.js';

const today=()=>{
 const date=new Date();
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);
};
const identity=row=>JSON.stringify([normalize(row.description),normalize(row.unit)]);

function sourceSnapshot(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>60)throw new Error('Aprobá una propuesta de entre 1 y 60 partidas');
 const safe=rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('La propuesta contiene una partida inválida');
  if((row.target!=null&&row.target!=='new')||(row.operation!=null&&row.operation!=='create')||(row.action!=null&&row.action!=='create'))throw new Error('Esta aprobación solo permite crear partidas nuevas, sin editar ni eliminar las existentes');
  if(row.components?.length||row.acus?.length||row.acu_proposals?.length)throw new Error('Las propuestas con composición deben cargarse desde el circuito de ACU');
  for(const field of ['description','unit'])if(typeof row[field]!=='string')throw new Error('La propuesta requiere descripción y unidad como texto');
  for(const field of ['quantity','unit_price','section'])if(row[field]!=null&&typeof row[field]!=='string')throw new Error('La propuesta debe usar textos y decimales válidos');
  return {description:row.description,unit:row.unit,quantity:row.quantity??null,unit_price:row.unit_price??null,section:row.section??null};
 });
 return JSON.stringify({proposal_lines:safe});
}

/** A single approved plan creates new lines only; model output never becomes commands. */
export function createApprovedPlanRunner({invoke,state,loadEstimate,loadEstimates,openEstimate}){
 let active=null;
 const used=new WeakSet();
 const scope=()=>({projectId:state.projectId||null,estimateId:state.estimateId||null,view:state.view});
 const sameScope=origin=>{
  const current=scope();return current.projectId===origin.projectId&&current.estimateId===origin.estimateId&&current.view===origin.view;
 };
 function authorized(origin){
  if(!sameScope(origin))throw new Error('Cambió el proyecto o presupuesto abierto');
  if(!origin.projectId||state.remoteProject)throw new Error('Abrí un proyecto propio antes de aprobar la carga');
  if(state.modal||state.pageDirty||state.navigating)throw new Error('Cerrá los formularios y guardá los cambios pendientes antes de aprobar la carga');
  const project=(state.projects||[]).find(project=>project.id===origin.projectId);
  if(!project||project.read_only||project.active===false||project.archived)throw new Error('El proyecto no está disponible o es de solo lectura');
  const estimate=origin.estimateId?(state.estimates||[]).find(estimate=>estimate.id===origin.estimateId):null;
  if(origin.estimateId&&(!estimate||estimate.issued||estimate.active===false||estimate.archived))throw new Error('Abrí un presupuesto propio en elaboración antes de aprobar la carga');
  return {project,estimate};
 }
 function cancel(){
  if(!active||active.phase==='saving')return false;
  active.cancelled=true;return true;
 }
 async function run(rows,{onProgress}={}){
  if(active)throw new Error('Hay una carga de partidas en curso');
  const origin=scope(),initial=authorized(origin),snapshot=sourceSnapshot(rows);
  const approvedCurrency=String(initial.estimate?.currency||initial.project.currency||'').toUpperCase();
  if(used.has(rows))throw new Error('Esta aprobación ya fue utilizada. Revisá el presupuesto antes de preparar otra carga');
  const prepared=parsePlan(snapshot).map(row=>({...row,selected:true,target:'new',operation:'create'}));
  const estimateId=origin.estimateId||globalThis.crypto.randomUUID();
  const current={phase:'preparing',cancelled:false};active=current;
  const emit=(phase,message)=>{
   try{const result=onProgress?.({phase,message,projectId:origin.projectId,estimateId});if(result?.catch)result.catch(()=>{});}catch{}
  };
  const aborted=()=>current.cancelled||!sameScope(origin);
  const empty=()=>{
   const summary={saved:0,created:0,pending:prepared.length,estimateId,lineIds:[],committed:false,cancelled:true};
   emit('done',current.cancelled?'Se canceló la carga antes de guardar. No se creó ninguna partida.':'Cambió la vista abierta; se detuvo la carga antes de guardar. No se creó ninguna partida.');
   return summary;
  };
  let attempted=false,committed=false;
  try{
   emit('preparing','Validando la propuesta y el presupuesto antes de crear las partidas…');
   if(aborted())return empty();
   authorized(origin);
   const context=await invoke('assisted_acu_context',{projectId:origin.projectId,estimateId:origin.estimateId,asOf:today()});
   if(aborted())return empty();
   authorized(origin);
   if(!context||!['ARS','USD'].includes(context.currency)||!Array.isArray(context.lines))throw new Error('No se pudo verificar la moneda y las partidas del presupuesto');
   const expectedCurrency=approvedCurrency||context.currency;
   if(context.currency!==expectedCurrency)throw new Error('Cambió la moneda de la propuesta. Revisá el presupuesto antes de aprobarla otra vez');
   const known=new Set(context.lines.map(identity)),seen=new Set();
   for(const row of prepared){
    const key=identity(row);
    if(known.has(key)||seen.has(key))throw new Error(`Ya existe o se repite la partida «${row.description}» con unidad ${row.unit}. No se creó ninguna partida; revisá la propuesta para evitar duplicados.`);
    seen.add(key);
   }
   const estimate={id:estimateId,currency:context.currency};
   const newEstimate=origin.estimateId?null:{project_id:origin.projectId,title:'Presupuesto con partidas'};
   const batch={...reviewedBatch(prepared,context.lines,estimate,globalThis.crypto.randomUUID(),context.currency,newEstimate),acus:[]};
   // Private IDs and an immutable create-only payload: no caller/model ID is reused.
   if(batch.updates.length||batch.deletes.length||batch.creates.length!==prepared.length)throw new Error('La aprobación no corresponde a una carga exclusiva de partidas nuevas');
   emit('saving',`Guardando ${batch.creates.length} partidas nuevas…`);
   if(aborted())return empty();
   const latest=authorized(origin),latestCurrency=String(latest.estimate?.currency||latest.project.currency||context.currency).toUpperCase();
   if(latestCurrency!==expectedCurrency||sourceSnapshot(rows)!==snapshot)throw new Error('La propuesta o sus datos cambiaron durante la validación. Revisalos y volvé a aprobar la carga');
   current.phase='saving';used.add(rows);attempted=true;
   await invoke('apply_reviewed_budget_batch',{batch});committed=true;
   const lineIds=batch.creates.map(line=>line.id),summary={saved:0,created:lineIds.length,pending:0,estimateId,lineIds,committed:true};
   let message=`Se crearon ${summary.created} partidas en el presupuesto.`;
   if(sameScope(origin)){
    try{
     if(newEstimate){await loadEstimates();if(sameScope(origin))await openEstimate(estimateId,lineIds[0]);}
     else if(state.view==='workspace'){
      state.search='';state.selectedLineId=lineIds[0];state.panel='acu';await loadEstimate();
     }else await openEstimate(estimateId,lineIds[0]);
    }catch(error){summary.refreshError=String(error);message+=' Los cambios se guardaron, pero no se pudo actualizar la vista. Volvé a abrir el presupuesto.';}
   }else message+=' Se guardaron en el presupuesto de origen; volvé a abrirlo para verlas.';
   emit('done',message);return summary;
  }catch(error){
   if(!attempted&&aborted())return empty();
   if(attempted&&!committed){
    const failure=new Error('No se pudo confirmar el guardado. Actualizá el presupuesto antes de preparar otra carga; no se reintentó automáticamente. '+String(error));
    failure.mayHaveCommitted=true;emit('done',failure.message);throw failure;
   }
   emit('done',String(error));throw error;
  }finally{if(active===current)active=null;}
 }
 return {run,cancel};
}
