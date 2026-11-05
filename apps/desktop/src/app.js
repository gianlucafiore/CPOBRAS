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
const context = { invoke, state, ...selectors, ...service, render, openModal, closeModal, document, window, FormData };
const modalMarkup = createModalRenderer(context);
const management = createManagementWorkspace(context);
const planning = createPlanningWorkspace(context);
const costing = createCostingWorkspace(context);
const budgetTools = createBudgetTools(context);
const { workspace, listViews, chrome } = createViews({ ...context, modalMarkup });
const { act, handleSubmit } = createActions(context);
const { loadCollections, openEstimate } = service;
function render() {
  const top = document.querySelector(".table-scroll");
  const position = top?.scrollTop || 0;
  root.innerHTML = state.view === "budget-tools" ? chrome(budgetTools.markup()) : state.view === "costing" ? chrome(costing.markup()) : state.view === "planning" ? chrome(planning.markup()) : state.view === "management" ? chrome(management.markup()) : state.view === "workspace" ? workspace() : listViews();
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
  state.modal = { kind, record };
  state.acuComponents = kind === "analysis" && record?.components ?
    record.components.map(row => ({ resourceId: row.resource_id, quantity: row.quantity, unitPrice: row.unit_price })) : [];
  state.comparison = null; state.costComparison = null;
  render();
}
function closeModal() {
  state.modal = null; render();
}
document.addEventListener("click", async evt => {
  const button = evt.target.closest("[data-action]");
  if (!button || button.disabled) return;
  if (button.dataset.action === "close-modal" && button.classList.contains("modal-overlay") && button !== evt.target) return;
  try { if (button.dataset.action === "open-budget-tools" || button.dataset.action.startsWith("budget-tools-")) await budgetTools.act(button); else if (button.dataset.action === "open-costing" || button.dataset.action.startsWith("cost-")) await costing.act(button); else if (button.dataset.action === "open-planning" || button.dataset.action.startsWith("plan-")) await planning.act(button); else if (button.dataset.action === "open-management" || button.dataset.action.startsWith("manage-")) await management.act(button); else await act(button); }
  catch (error) { state.message = "Error: " + String(error); render(); }
});
document.addEventListener("submit", async evt => {
  const groups = [
    [budgetTools, ["budget-bulk-form", "line-formula-form", "budget-export-form", "budget-import-form", "budget-template-save", "budget-template-apply"]],
    [costing, ["price-list-form", "scoped-price-form", "nested-analysis-form", "nested-calculate-form", "fx-quote-form", "fx-convert-form", "selective-reprice-form", "copy-base-analysis-form"]],
    [planning, ["planning-task-form", "planning-settings"]],
    [management, ["management-form"]]
  ];
  const form = evt.target, group=groups.find(([,ids])=>ids.includes(form.id));
  if(!group && form.id!=="dialog-form")return;
  evt.preventDefault();if(state.busy)return;
  const submit=form.querySelector('[type="submit"]');state.busy=true;if(submit)submit.disabled=true;
  try {if(group)await group[0].submit(form);else await handleSubmit(form);}
  catch(error){
    const feedback=form.isConnected===false ? null : form.querySelector(group?".feature-error":".modal-error");
    if(feedback)feedback.textContent=String(error);else{state.message=String(error);render();}
  }finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}
});
document.addEventListener("change", async evt => {
  if(evt.target.name==="library-trade"){
    const trade=state.trades.find(row=>row.id===evt.target.value),form=evt.target.closest("form");
    if(trade&&form){form.querySelector('[name="code"]').value=trade.code;form.querySelector('[name="title"]').value=trade.name;}
  }
  try { await management.change(evt.target); await planning.change(evt.target); await costing.change(evt.target); await budgetTools.change(evt.target); } catch(error) { state.message = String(error); render(); }
  if (evt.target.name === "resource" && evt.target.closest(".component-row")) {
    const row = evt.target.closest(".component-row");
    const price = row.querySelector('input[name="unitPrice"]');
    const selected = state.resources.find(r => r.id === evt.target.value);
    if (price && selected?.price != null) price.value = selected.price;
  }
  if (evt.target.name === "estimate-picker") {
    try { await openEstimate(evt.target.value); }
    catch (error) { state.message = String(error); render(); }
  }
});
document.addEventListener("input", evt => {
  if (!evt.target.matches("[data-search]")) return;
  state.search = evt.target.value; filterRows(state.search);
});
document.addEventListener("pointerdown", evt => planning.pointerDown(evt));
document.addEventListener("pointerup", async evt => { try { await planning.pointerUp(evt); } catch(error) { state.message=String(error);render(); } });
document.addEventListener("keydown", evt => {
  if (evt.key === "Escape" && state.modal) closeModal();
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
