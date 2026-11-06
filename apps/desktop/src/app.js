import { createUnitPicker } from './components/unit-picker.js';
import { createOperationsWorkspace } from './components/operations.js';
import { createResourcePicker } from './components/resource-picker.js';
import { helpBox } from "./components/help.js";
import { createBudgetInteractions } from "./controllers/budget-interactions.js";
import { createBudgetTools } from "./components/budget-tools.js";
import { createCostingWorkspace } from "./components/costing.js";
import { createPlanningWorkspace } from "./components/planning.js";
import { createManagementWorkspace } from "./components/management.js";
import { createState, createSelectors } from "./state/workspace.js";
import { createWorkspaceService } from "./services/workspace.js";
import { createViews } from "./components/views.js";
import { createModalRenderer } from "./components/modal.js";
import { createActions } from "./controllers/actions.js";
import { e } from "./components/helpers.js";

export function createWorkspaceApp({ invoke, document = globalThis.document, window = globalThis.window, FormData = globalThis.FormData }) {
const root = document.querySelector("#app");
const state = createState();
const selectors = createSelectors(state);
const service = createWorkspaceService({ invoke, state, currentLine: selectors.currentLine, render });
const context = { invoke, state, ...selectors, ...service, render, renderSelection, openModal, closeModal, document, window, FormData };
const unitPicker = createUnitPicker(context);
const resourcePicker = createResourcePicker(context);
const modalMarkup = createModalRenderer(context);
const operations = createOperationsWorkspace(context);
const management = createManagementWorkspace(context);
const planning = createPlanningWorkspace(context);
const costing = createCostingWorkspace(context);
const budgetTools = createBudgetTools(context);
const { workspace, listViews, chrome, rightPanel } = createViews({ ...context, modalMarkup });
const { act, handleSubmit } = createActions(context);
const interactions = createBudgetInteractions({ ...context, act });
const { loadCollections, openEstimate } = service;
function renderSelection(){
  const detail=document.querySelector(".detail-content");
  if(!detail){render();return;}
  document.querySelectorAll(".line-row").forEach(row=>row.classList.toggle("selected",row.dataset.id===state.selectedLineId));
  document.querySelectorAll(".section-row[data-id]").forEach(row=>row.classList.toggle("selected",row.dataset.id===state.selectedSectionId));
  detail.innerHTML=helpBox(state.panel,true)+rightPanel();
}
function render() {
  const top = document.querySelector(".table-scroll");
  const position = top?.scrollTop || 0;
  root.innerHTML = state.view === "operations" ? chrome(operations.markup()) : state.view === "budget-tools" ? chrome(budgetTools.markup()) : state.view === "costing" ? chrome(costing.markup()) : state.view === "planning" ? chrome(planning.markup()) : state.view === "management" ? chrome(management.markup()) : state.view === "workspace" ? workspace() : listViews();
  const restored = document.querySelector(".table-scroll");
  if (restored) restored.scrollTop = position;
  if (state.search) filterRows(state.search);
  if (state.modal) document.querySelector(".dialog-shell input:not([type=hidden])")?.focus();
}
function filterRows(text) {
  const term = text.toLowerCase().trim();
  document.querySelectorAll("[data-searchable]").forEach(row => {
    row.classList.toggle("search-hidden", Boolean(term) && !row.dataset.searchable.includes(term));
  });
}
function openModal(kind, record = null) {
  state.contextMenu = null;
  state.modalDirty = false;
  state.modal = { kind, record };
  state.acuComponents = ["analysis","line-resources"].includes(kind) && record?.components ?
    record.components.map(row => ({ resourceId: row.resource_id, quantity: row.quantity, unitPrice: row.unit_price })) : [];
  state.comparison = null; state.costComparison = null;
  render();
}
function closeModal() {
  if(state.busy)return false;
  if(state.modalDirty&&!window.confirm("Tenés cambios sin guardar. ¿Descartarlos y cerrar?"))return false;
  state.modal=null;state.modalDirty=false;render();return true;
}
document.addEventListener("click", async evt => {
  if(state.contextMenu){state.contextMenu=null;if(!evt.target.closest(".app-context-menu")){render();return;}}
  const button = evt.target.closest("[data-action]");
  if(evt.target.matches?.('.unit-search'))unitPicker.open(evt.target);
  if(evt.target.matches?.('.resource-search'))resourcePicker.open(evt.target);
  if (!button || button.disabled || state.busy) return;
  if (button.dataset.action === "close-modal" && button.classList.contains("modal-overlay")) return;
  try { if(state.view==='operations'&&!button.dataset.action.startsWith('ops-')&&['navigate','open-project','open-estimate','open-costing','open-planning','open-management'].includes(button.dataset.action)&&!operations.protect())return; if(button.classList?.contains("resource-search"))return; if(await unitPicker.act(button))return; if(await resourcePicker.act(button))return; if(button.dataset.action==="open-operations"||button.dataset.action.startsWith("ops-")){await operations.act(button);return;} if (button.dataset.action === "open-budget-tools" || button.dataset.action.startsWith("budget-tools-")) await budgetTools.act(button); else if (button.dataset.action === "open-costing" || button.dataset.action.startsWith("cost-")) await costing.act(button); else if (button.dataset.action === "open-planning" || button.dataset.action.startsWith("plan-")) await planning.act(button); else if (button.dataset.action === "open-management" || button.dataset.action.startsWith("manage-")) await management.act(button); else await act(button); }
  catch (error) { state.message = "Error: " + String(error); render(); }
});
document.addEventListener("submit", async evt => {
  const groups = [
    [operations,["operation-form","warehouse-form"]],
    [budgetTools, ["budget-bulk-form", "line-formula-form", "budget-export-form", "budget-import-form", "budget-template-save", "budget-template-apply"]],
    [costing, ["price-list-form", "scoped-price-form", "nested-analysis-form", "nested-calculate-form", "fx-quote-form", "fx-convert-form", "selective-reprice-form", "copy-base-analysis-form"]],
    [planning, ["planning-task-form", "planning-settings"]],
    [management, ["management-form"]]
  ];
  if(evt.target.id==="unit-create-form"){evt.preventDefault();await unitPicker.submit(evt.target);return;}
  if(evt.target.querySelector?.('.unit-search')){try{unitPicker.validate(evt.target);}catch(error){evt.preventDefault();const feedback=evt.target.querySelector('.modal-error,.feature-error');if(feedback)feedback.textContent=String(error);return;}}
  if(evt.target.id==="quick-resource-form"){evt.preventDefault();await resourcePicker.submit(evt.target);return;}
  const form = evt.target, group=groups.find(([,ids])=>ids.includes(form.id));
  if(!group && form.id!=="dialog-form")return;
  evt.preventDefault();if(state.busy)return;
  const submit=form.querySelector('[type="submit"]');state.busy=true;form.inert=true;if(submit)submit.disabled=true;
  try {if(group)await group[0].submit(form);else await handleSubmit(form);}
  catch(error){
    const feedback=form.isConnected===false ? null : form.querySelector(group?".feature-error":".modal-error");
    if(feedback)feedback.textContent=String(error);else{state.message=String(error);render();}
  }finally{state.busy=false;if(form.isConnected)form.inert=false;if(submit?.isConnected)submit.disabled=false;}
});
document.addEventListener("change", async evt => {
  if(state.modal&&evt.target.closest?.("#dialog-form"))state.modalDirty=true;
  if(evt.target.name==="library-trade"){
    const trade=state.trades.find(row=>row.id===evt.target.value),form=evt.target.closest("form");
    if(trade&&form){form.querySelector('[name="code"]').value=trade.code;form.querySelector('[name="title"]').value=trade.name;}
  }
  try { await operations.change(evt.target); await management.change(evt.target); await planning.change(evt.target); await costing.change(evt.target); await budgetTools.change(evt.target); } catch(error) { state.message = String(error); render(); }
  if (evt.target.name === "resource" && evt.target.closest(".component-row")) {
    const row = evt.target.closest(".component-row");
    const price = row.querySelector('input[name="unitPrice"]');
    const selected = state.resources.find(r => r.id === evt.target.value);
    if(price && state.modal?.kind==="line-resources" && selectors.currentEstimate()?.currency==="USD")price.value="";
    else if (price && selected?.price != null) price.value = selected.price;
  }
  if (evt.target.name === "estimate-picker") {
    try { await openEstimate(evt.target.value); }
    catch (error) { state.message = String(error); render(); }
  }
});
document.addEventListener("focusin",evt=>{unitPicker.focus(evt);resourcePicker.focus(evt);});
document.addEventListener("input", evt => {
  unitPicker.input(evt);
  resourcePicker.input(evt);
  operations.input(evt.target);
  if(state.modal&&evt.target.closest?.("#dialog-form"))state.modalDirty=true;
  if (!evt.target.matches("[data-search]")) return;
  state.search = evt.target.value; filterRows(state.search);
});
document.addEventListener("contextmenu", evt => { interactions.contextMenu(evt).catch(error=>{state.message=String(error);render();}); });
document.addEventListener("dblclick", evt => { interactions.doubleClick(evt).catch(error=>{state.message=String(error);render();}); });
document.addEventListener("dragstart", evt => interactions.dragStart(evt));
document.addEventListener("dragover", evt => interactions.dragOver(evt));
document.addEventListener("dragend", () => interactions.dragEnd());
document.addEventListener("drop", evt => { interactions.drop(evt).catch(error=>{state.message=String(error);render();}); });
document.addEventListener("pointerdown", evt => planning.pointerDown(evt));
document.addEventListener("pointerup", async evt => { try { await planning.pointerUp(evt); } catch(error) { state.message=String(error);render(); } });
document.addEventListener("keydown", evt => {
  if(unitPicker.keyDown(evt))return;
  if(resourcePicker.keyDown(evt))return;
  if(operations.keyDown(evt))return;
  if(interactions.keyDown(evt))return;
  if (evt.key === "Escape" && state.modal) {evt.preventDefault();closeModal();}
  if ((evt.key === "Enter" || evt.key === " ") && evt.target.matches("tr[data-action]")) {
    evt.preventDefault(); evt.target.click();
  }
});

const ready = (async () => {
  try { await loadCollections(); render(); }
  catch (error) {
    root.innerHTML = `<div class="startup-error"><h2>No se pudo abrir la base de datos local</h2><p>${e(error)}</p><button data-action="retry-startup">Reintentar</button></div>`;
  }
})();

return { state, ready, render };
}
