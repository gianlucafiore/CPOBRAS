import { uiText, uiHtml } from "../services/interface-language.js";
import { e } from "./helpers.js";
export function entityActions(kind,id,label) {
 if (kind === "analysis") {
  return `<select name="analysis-action" class="analysis-action-select" data-action="entity-menu"
    data-id="${e(id)}" data-label="${e(label)}" aria-label="${uiHtml("Opciones de {0}", [label])}" title="${uiHtml("Opciones de {0}", [label])}">
    <option value="">⋯</option>
    <option value="edit-analysis">${uiHtml("Editar ACU")}</option>
    <option value="modal-reprice">${uiHtml("Actualizar precios")}</option>
    <option value="duplicate-analysis">${uiHtml("Duplicar ACU")}</option>
    <option value="entity-archive">${uiHtml("Eliminar de la biblioteca")}</option>
  </select>`;
 }
 return `<details class="entity-menu"><summary data-action="entity-menu" title="${uiHtml("Opciones de {0}", [label])}" aria-label="${uiHtml("Opciones de {0}", [label])}">⋯</summary><div><button class="btn tiny" data-action="entity-archive" data-kind="${e(kind)}" data-id="${e(id)}" data-label="${e(label)}">${['analysis','nested_analysis'].includes(kind)?uiHtml("Eliminar de la biblioteca"):uiHtml("Eliminar {0}", [kind==='project'?'obra':'presupuesto'])}</button></div></details>`;
}
export function createEntityActions({invoke,state,loadCollections,loadEstimates,reloadCatalog,openProject,render,window,onArchived=async()=>{}}) {
 return {async act(button){
  if(button.dataset.action==="entity-menu")return true;
  if(button.dataset.action!=="entity-archive")return false;
  if(state.remoteProject)throw new Error(uiText("La obra externa es de solo lectura"));
  const {kind,id,label}=button.dataset;
  if(!window.confirm(uiText("¿Eliminar «{0}» de las listas? Se conservarán sus precios, documentos e historial vinculados.", [label])))return true;
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
  state.message=uiText("Registro eliminado de la lista; el historial se conserva.");render();return true;
 }};
}
