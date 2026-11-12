import { e } from "./helpers.js";
export function entityActions(kind,id,label) {
 const actions=kind==='analysis'
   ? `<button type="button" class="btn tiny" data-action="edit-analysis" data-id="${e(id)}">Editar ACU</button>
      <button type="button" class="btn tiny" data-action="modal-reprice" data-id="${e(id)}">Actualizar precios</button>
      <button type="button" class="btn tiny" data-action="duplicate-analysis" data-id="${e(id)}">Duplicar ACU</button>`
   : '';
 return `<details class="entity-menu"><summary data-action="entity-menu" title="Opciones de ${e(label)}" aria-label="Opciones de ${e(label)}" aria-haspopup="menu">⋯</summary><div role="group" aria-label="Acciones de ${e(label)}">${actions}<button type="button" class="btn tiny" data-action="entity-archive" data-kind="${e(kind)}" data-id="${e(id)}" data-label="${e(label)}">${kind==='analysis'?'Eliminar ACU':['nested_analysis'].includes(kind)?'Eliminar de la biblioteca':'Eliminar '+(kind==='project'?'obra':'presupuesto')}</button></div></details>`;
}
export function createEntityActions({invoke,state,loadCollections,loadEstimates,reloadCatalog,openProject,render,window,onArchived=async()=>{}}) {
 return {async act(button){
  if(button.dataset.action==="entity-menu")return true;
  if(button.dataset.action!=="entity-archive")return false;
  if(state.remoteProject)throw new Error("La obra externa es de solo lectura");
  const {kind,id,label}=button.dataset;
  if(!window.confirm(`¿Eliminar «${label}» de las listas? Se conservarán sus precios, documentos e historial vinculados.`))return true;
  await invoke("set_entity_archived",{kind,id,archived:true});
  if(kind==='project') {
   if(state.projectId===id){state.projectId=null;state.estimateId=null;state.estimates=[];state.lines=[];state.view='projects';}
   delete state.lastBudgetByProject?.[id];await loadCollections();
  }else if(kind==='estimate'){
   if(state.lastBudgetByProject?.[state.projectId]===id)delete state.lastBudgetByProject[state.projectId];
   if(state.estimateId===id)state.estimateId=null;
   await loadEstimates();await openProject(state.projectId);
  }else{if(state.selectedAnalysisId===id){state.selectedAnalysisId=null;state.detail=null;}await reloadCatalog();}
  await onArchived(kind);
  state.message='Registro eliminado de la lista; el historial se conserva.';render();return true;
 }};
}
