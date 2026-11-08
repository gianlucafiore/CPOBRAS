import {createRemoteInvoke,protectRemoteControls,remoteActionAllowed} from "./services/remote-workspace.js";
import { createSharing } from "./components/sharing.js";
import { createPersons } from "./components/persons.js";
import { createOrganizations } from "./components/organizations.js";
import { createPrintProfile } from "./components/print-profile.js";
import { createBudgetPrinting } from "./components/budget-printing.js";
import { createPriceDetermination } from "./components/price-determination.js";
import { createBudgetPatterns } from "./components/budget-patterns.js";
import { createUnitPicker } from "./components/unit-picker.js";
import { createOperationsWorkspace } from "./components/operations.js";
import { createResourcePicker } from "./components/resource-picker.js";
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

export function createWorkspaceApp({
  invoke,
  document = globalThis.document,
  window = globalThis.window,
  FormData = globalThis.FormData,
}) {
  const root = document.querySelector("#app");
  const state = createState();
  const nativeInvoke=invoke;
  invoke=createRemoteInvoke(nativeInvoke,state);
  const selectors = createSelectors(state);
  const service = createWorkspaceService({
    invoke,
    state,
    currentLine: selectors.currentLine,
    globalInvoke:nativeInvoke,
    render,
  });
  const context = {
    invoke,
    state,
    ...selectors,
    ...service,
    render,
    renderSelection,
    openModal,
    closeModal,
    openExternalProject,
    refreshExternalSession,
    document,
    window,
    FormData,
  };
  const unitPicker = createUnitPicker(context);
  const resourcePicker = createResourcePicker(context);
  const modalMarkup = createModalRenderer(context);
  const operations = createOperationsWorkspace(context);
  const management = createManagementWorkspace(context);
  const planning = createPlanningWorkspace(context);
  const costing = createCostingWorkspace(context);
  const patterns = createBudgetPatterns(context);
  const pricing = createPriceDetermination(context);
  const budgetTools = createBudgetTools(context);
  const printProfile = createPrintProfile(context);
  const people = createPersons(context);
  const sharing = createSharing(context);
  const organizations = createOrganizations({
    ...context,
    profile: printProfile,
    management,
  });
  const printing = createBudgetPrinting(context);
  const { workspace, listViews, chrome, rightPanel } = createViews({
    ...context,
    modalMarkup,
  });
  const { act, handleSubmit } = createActions(context);
  const interactions = createBudgetInteractions({ ...context, act });
  const { loadCollections, openEstimate } = service;
  function renderSelection() {
    const detail = document.querySelector(".detail-content");
    if (!detail) {
      render();
      return;
    }
    document
      .querySelectorAll(".line-row")
      .forEach((row) =>
        row.classList.toggle(
          "selected",
          row.dataset.id === state.selectedLineId,
        ),
      );
    document
      .querySelectorAll(".section-row[data-id]")
      .forEach((row) =>
        row.classList.toggle(
          "selected",
          row.dataset.id === state.selectedSectionId,
        ),
      );
    detail.innerHTML = helpBox(state.panel, true) + rightPanel();
  }
  let renderedContext='';
  function render() {
    if (state.navigating) {
      root.innerHTML = chrome(
        '<main class="feature-page" role="status">Cargando los datos de la sección seleccionada…</main>',
      );
      return;
    }
    const contextKey=[state.view,state.projectId,state.estimateId].join(':');
    const scrollSelectors=['.feature-page','.table-scroll','.gantt-scroll','.pert-source-list','.app'];
    const offsets=renderedContext===contextKey?scrollSelectors.flatMap(selector=>Array.from(root.querySelectorAll(selector)).map((el,index)=>({selector,index,top:el.scrollTop,left:el.scrollLeft}))):[];
    const top = document.querySelector(".table-scroll");
    const position = top?.scrollTop || 0;
    root.innerHTML = ["clients", "suppliers"].includes(state.view)
      ? chrome(people.markup())
      : state.view === "sharing" ? chrome(sharing.markup())
      : state.view === "organizations"
        ? chrome(organizations.markup())
        : state.view === "budget-printing"
          ? chrome(printing.markup())
          : state.view === "price-determination"
            ? chrome(pricing.markup())
            : ["operations", "portfolio"].includes(state.view)
              ? chrome(operations.markup())
              : state.view === "budget-tools"
                ? chrome(budgetTools.markup())
                : state.view === "costing"
                  ? chrome(costing.markup())
                  : state.view === "planning"
                    ? chrome(planning.markup())
                    : state.view === "management"
                      ? chrome(management.markup())
                      : state.view === "workspace"
                        ? workspace()
                        : listViews();
    if (patterns.model.active) {
      root.innerHTML += patterns.markup();
      patterns.afterRender();
    }
    if (state.view === "price-determination") pricing.afterRender();
    if(state.view==='planning')planning.afterRender();
    if(state.view==='management')management.afterRender();
    for(const item of offsets){const el=root.querySelectorAll(item.selector)[item.index];if(el){el.scrollTop=item.top;el.scrollLeft=item.left;}}
    renderedContext=contextKey;
    protectRemoteControls(root,state);
    const restored = document.querySelector(".table-scroll");
    if (restored) restored.scrollTop = position;
    if (state.search) filterRows(state.search);
    if (state.modal)
      document.querySelector(".dialog-shell input:not([type=hidden])")?.focus();
  }
  function filterRows(text) {
    const term = text.toLowerCase().trim();
    document.querySelectorAll("[data-searchable]").forEach((row) => {
      row.classList.toggle(
        "search-hidden",
        Boolean(term) && !row.dataset.searchable.includes(term),
      );
    });
  }
  function openModal(kind, record = null) {
    state.contextMenu = null;
    state.modalDirty = false;
    state.modal = { kind, record };
    state.acuComponents =
      ["analysis", "line-resources"].includes(kind) && record?.components
        ? record.components.map((row) => ({
            resourceId: row.resource_id,
            quantity: row.quantity,
            unitPrice: row.unit_price,
          }))
        : [];
    state.comparison = null;
    state.costComparison = null;
    render();
  }
  function closeModal() {
    if (state.busy) return false;
    if (
      state.modalDirty &&
      !window.confirm("Tenés cambios sin guardar. ¿Descartarlos y cerrar?")
    )
      return false;
    state.modal = null;
    state.modalDirty = false;
    render();
    return true;
  }
  const routeViews = {
    "go-home": "projects",
    backups: "backups",
    navigate: null,
    "open-project": "workspace",
    "open-workspace": "workspace",
    "open-operations": "operations",
    "open-portfolio": "portfolio",
    "open-planning": "planning",
    "open-management": "management",
    "open-costing": "costing",
    "open-price-determination": "price-determination",
    "open-budget-tools": "budget-tools",
    "open-organizations": "organizations",
    "open-sharing": "sharing",
    "open-external-project": "workspace",
    "open-budget-printing": "budget-printing",
  };
  function protectContext() {
    if (state.busy || state.navigating) return false;
    if (state.modal && !closeModal()) return false;
    if (state.view === "price-determination" && !pricing.leave()) return false;
    if (state.view === "operations" && !operations.protect()) return false;
    const pending =
      state.pageDirty || (state.view === "planning" && planning.model.dirty);
    if (
      pending &&
      !window.confirm(
        "Tenés cambios sin guardar en esta sección. ¿Descartarlos y continuar?",
      )
    )
      return false;
    state.pageDirty = false;
    return true;
  }
  async function route(button) {
    const action = button.dataset.action;
    if (!(action in routeViews)) return false;
    const destination =
      action === "navigate" ? button.dataset.view : routeViews[action];
    if (
      action !== "go-home" &&
      action !== "open-project" &&
      destination === state.view
    )
      return true;
    if (
      state.projectId &&
      [
        "navigate",
        "open-costing",
        "open-project",
        "open-portfolio",
        "open-organizations",
        "open-sharing",
      ].includes(action)
    )
      throw new Error(
        "Volvé a Inicio para administrar datos base o abrir otra obra",
      );
    if (
      !state.projectId &&
      [
        "open-workspace",
        "open-operations",
        "open-planning",
        "open-price-determination",
        "open-budget-tools",
        "open-budget-printing",
      ].includes(action)
    )
      throw new Error("Abrí una obra desde Inicio");
    if (!protectContext()) return true;
    state.message = "";
    if (destination !== "organizations") state.organizationId = null;
    state.navigating = true;
    root.inert = true;
    render();
    try {
      if (action === "go-home") {
        if(state.remoteProject){state.remoteProject=null;state.projects=[];state.clients=[];state.resources=[];state.analyses=[];state.organizations=[];}

        Object.assign(state, {
          projectId: null,
          estimateId: null,
          estimates: [],
          lines: [],
          sections: [],
          assignments: {},
          selectedLineId: null,
          selectedSectionId: null,
          totals: null,
          rates: null,
          detail: null,
          takeoffs: [],
          pricePreview: null,
          view: "projects",
          search: "",
          contextMenu: null,
        });
        await service.loadCollections();
        render();
      } else if (action === "open-workspace") {
        state.view = "workspace";
        await service.loadEstimate();
      } else if (["open-operations", "open-portfolio"].includes(action))
        await operations.act(button);
      else if (action === "open-planning") await planning.act(button);
      else if (action === "open-management") await management.act(button);
      else if (action === "open-costing") {
        costing.model.editing = null;
        await costing.act(button);
      } else if (action === "open-price-determination")
        await pricing.act(button);
      else if (action === "open-external-project") await openExternalProject(button.dataset.id);
      else if (action === "open-sharing") await sharing.act(button);
      else if (action === "open-organizations") await organizations.act(button);
      else if (action === "open-budget-printing") await printing.act(button);
      else if (action === "open-budget-tools") await budgetTools.act(button);
      else await act(button);
    } finally {
      state.navigating = false;
      root.inert = false;
      render();
    }
    return true;
  }
  async function showExternalView(view){
    const p=state.remoteProject?.data.permissions||{};
    if(view==='price-determination'&&p.price!==false)await pricing.act({dataset:{action:'open-price-determination'}});
    else if(view==='operations'&&(p.operations!==false||p.accounting!==false))await operations.act({dataset:{action:'open-operations'}});
    else if(view==='planning'&&p.planning!==false)await planning.act({dataset:{action:'open-planning'}});
    else if(view==='management'&&p.project_data!==false)await management.act({dataset:{action:'open-management'}});
    else if(p.budget!==false)state.view='workspace';
    else if(p.price!==false)await pricing.act({dataset:{action:'open-price-determination'}});
    else if(p.operations!==false||p.accounting!==false)await operations.act({dataset:{action:'open-operations'}});
    else if(p.planning!==false)await planning.act({dataset:{action:'open-planning'}});
    else await management.act({dataset:{action:'open-management'}});
  }
  async function openExternalProject(id){
    const remote=await nativeInvoke('p2p_read',{id});state.remoteProject={...remote,id};
    await service.loadCollections();await service.openProject(remote.data.project.id);
    await showExternalView('workspace');render();
  }
  async function refreshExternalSession(){
    const before=state.remoteProject;if(!before||state.busy||state.navigating||state.pageDirty||document.querySelector('[role=dialog]'))return;
    const links=await nativeInvoke('p2p_projects');const link=links.find(p=>p.id===before.id);
    if(state.remoteProject!==before||!link||link.revision===before.revision&&link.received_at===before.received_at&&link.revoked===before.revoked&&(link.error||null)===(before.error||null))return;
    const remote=await nativeInvoke('p2p_read',{id:before.id});
    if(state.remoteProject!==before)return;
    state.busy=true;
    try{
      const view=state.view,estimateId=state.estimateId,lineId=state.selectedLineId;
      state.remoteProject={...remote,id:before.id};await service.loadCollections();await service.loadEstimates();
      state.estimateId=state.estimates.some(e=>e.id===estimateId)?estimateId:state.estimates[0]?.id||null;
      state.selectedLineId=lineId;await service.loadEstimate();await showExternalView(view);render();
    }finally{state.busy=false;}
  }
  async function switchEstimate(id) {
    if (state.busy || state.navigating) return;
    const previous = state.estimateId,
      target = state.estimates.find((e) => e.id === id);
    if (id === previous) return;
    const picker = document.querySelector('[name="estimate-picker"]');
    if (!target) {
      if (picker) picker.value = previous || "";
      return;
    }
    if (
      !window.confirm(
        `¿Cambiar de presupuesto «${selectors.currentEstimate()?.title || "Sin presupuesto"}» a «${target.title}» (${target.issued ? "emitido" : "borrador"}) dentro de la misma obra? Los informes pasarán a usar la versión elegida.`,
      ) ||
      !protectContext()
    ) {
      if (picker) picker.value = previous || "";
      return;
    }
    const view = state.view;
    state.navigating = true;
    root.inert = true;
    render();
    try {
      await openEstimate(id);
      if (view === "operations")
        await operations.act({ dataset: { action: "open-operations" } });
      else if (view === "planning")
        await planning.act({ dataset: { action: "open-planning" } });
      else if (view === "management")
        await management.act({ dataset: { action: "open-management" } });
      else if (view === "price-determination")
        await pricing.act({ dataset: { action: "open-price-determination" } });
      else if (view === "budget-printing")
        await printing.act({ dataset: { action: "open-budget-printing" } });
      else if (view === "budget-tools")
        await budgetTools.act({ dataset: { action: "open-budget-tools" } });
    } catch (error) {
      state.view = "workspace";
      render();
      throw error;
    } finally {
      state.navigating = false;
      root.inert = false;
      render();
    }
  }
  document.addEventListener("click", async (evt) => {
    unitPicker.dismissOutside(evt.target);
    resourcePicker.dismissOutside(evt.target);
    if (evt.target.closest?.('[role="option"]')) evt.preventDefault();
    if (state.contextMenu) {
      state.contextMenu = null;
      if (!evt.target.closest(".app-context-menu")) {
        render();
        return;
      }
    }
    const button = evt.target.closest("[data-action]");
    if (evt.target.matches?.(".unit-search")) unitPicker.toggle(evt.target);
    if (evt.target.matches?.(".resource-search"))
      resourcePicker.toggle(evt.target);
    if (!button || button.disabled || state.busy || state.navigating) return;
    if (
      button.dataset.action === "close-modal" &&
      button.classList.contains("modal-overlay")
    )
      return;
    if (
      [
        "plan-add-dependency",
        "plan-remove-dependency",
        "plan-add-assignment",
        "plan-remove-assignment",
        "cost-add-component",
        "cost-remove-component",
        "budget-tools-sort",
        "budget-tools-up",
        "budget-tools-down",
      ].includes(button.dataset.action)
    )
      state.pageDirty = true;
    if (
      [
        "manage-new",
        "manage-edit",
        "plan-new",
        "plan-edit",
        "cost-new-analysis",
        "cost-edit-analysis",
      ].includes(button.dataset.action) &&
      state.pageDirty
    ) {
      if (
        !window.confirm(
          "¿Descartar los cambios del formulario antes de abrir otro registro?",
        )
      )
        return;
      state.pageDirty = false;
    }
    if (
      ["plan-cancel", "manage-cancel", "cost-cancel"].includes(
        button.dataset.action,
      )
    ) {
      if (
        state.pageDirty &&
        !window.confirm(
          "¿Descartar los cambios sin guardar de este formulario?",
        )
      )
        return;
      state.pageDirty = false;
    }
    try {
      if(!remoteActionAllowed(state,button))return;
      if (await route(button)) return;
      if (button.dataset.action.startsWith("share-")) {await sharing.act(button);return;}
      if (button.dataset.action.startsWith("person-")) {
        await people.act(button);
        return;
      }
      if (button.dataset.action.startsWith("organization-")) {
        await organizations.act(button);
        return;
      }
      if (button.dataset.action.startsWith("print-profile-")) {
        await printProfile.act(button);
        return;
      }
      if (button.dataset.action.startsWith("printing-")) {
        await printing.act(button);
        return;
      }
      if (
        button.dataset.action === "modal-rates" ||
        button.dataset.action.startsWith("price-")
      ) {
        await pricing.act(
          button.dataset.action === "modal-rates"
            ? { dataset: { action: "open-price-determination" } }
            : button,
        );
        return;
      }
      if (button.classList?.contains("resource-search")) return;
      if (
        button.dataset.action === "open-patterns" ||
        button.dataset.action.startsWith("pattern-")
      ) {
        await patterns.act(button);
        return;
      }
      if (await unitPicker.act(button)) return;
      if (await resourcePicker.act(button)) return;
      if (
        button.dataset.action === "open-operations" ||
        button.dataset.action.startsWith("ops-")
      ) {
        await operations.act(button);
        return;
      }
      if (
        button.dataset.action === "open-budget-tools" ||
        button.dataset.action.startsWith("budget-tools-")
      )
        await budgetTools.act(button);
      else if (
        button.dataset.action === "open-costing" ||
        button.dataset.action.startsWith("cost-")
      )
        await costing.act(button);
      else if (
        button.dataset.action === "open-planning" ||
        button.dataset.action.startsWith("plan-")
      )
        await planning.act(button);
      else if (
        button.dataset.action === "open-management" ||
        button.dataset.action.startsWith("manage-")
      )
        await management.act(button);
      else await act(button);
    } catch (error) {
      state.message = "Error: " + String(error);
      render();
    }
  });
  document.addEventListener("submit", async (evt) => {
    const groups = [
      [people, ["person-form"]],
      [sharing, ["p2p-invite-form", "p2p-join-form", "p2p-access-form"]],
      [organizations, ["organization-create-form"]],
      [printProfile, ["print-profile-form"]],
      [printing, ["budget-print-form"]],
      [
        pricing,
        ["price-item-form", "price-template-form", "price-export-form"],
      ],
      [operations, ["operation-form", "warehouse-form"]],
      [
        budgetTools,
        [
          "budget-bulk-form",
          "line-formula-form",
          "budget-export-form",
          "budget-import-form",
          "budget-template-save",
          "budget-template-apply",
        ],
      ],
      [
        costing,
        [
          "price-list-form",
          "scoped-price-form",
          "nested-analysis-form",
          "nested-calculate-form",
          "fx-quote-form",
          "fx-convert-form",
          "selective-reprice-form",
          "copy-base-analysis-form",
        ],
      ],
      [planning, ["planning-task-form", "planning-settings","planning-split-form"]],
      [management, ["management-form","project-attachment-form"]],
    ];
    if (evt.target.id === "unit-create-form") {
      evt.preventDefault();
      await unitPicker.submit(evt.target);
      return;
    }
    if (evt.target.querySelector?.(".unit-search")) {
      try {
        unitPicker.validate(evt.target);
      } catch (error) {
        evt.preventDefault();
        const feedback = evt.target.querySelector(
          ".modal-error,.feature-error",
        );
        if (feedback) feedback.textContent = String(error);
        return;
      }
    }
    if (evt.target.id === "quick-resource-form") {
      evt.preventDefault();
      await resourcePicker.submit(evt.target);
      return;
    }
    const form = evt.target,
      group = groups.find(([, ids]) => ids.includes(form.id));
    if (!group && form.id !== "dialog-form") return;
    evt.preventDefault();
    if (state.busy) return;
    const submit = form.querySelector('[type="submit"]');
    state.busy = true;
    form.inert = true;
    if (submit) submit.disabled = true;
    try {
      if (group) await group[0].submit(form);
      else await handleSubmit(form);
      if (
        [
          "organization-create-form",
          "print-profile-form",
          "budget-print-form",
          "management-form",
          "project-attachment-form",
          "planning-task-form",
          "planning-split-form",
          "planning-settings",
          "budget-bulk-form",
          "nested-analysis-form",
          "price-list-form",
          "scoped-price-form",
        ].includes(form.id)
      )
        state.pageDirty = false;
    } catch (error) {
      const feedback =
        form.isConnected === false
          ? null
          : form.querySelector(group ? ".feature-error" : ".modal-error");
      if (feedback) feedback.textContent = String(error);
      else {
        state.message = String(error);
        render();
      }
    } finally {
      state.busy = false;
      if (form.isConnected) form.inert = false;
      if (submit?.isConnected) submit.disabled = false;
    }
  });
  document.addEventListener("change", async (evt) => {
    if (
      evt.target.closest?.(
        "#p2p-invite-form,#p2p-join-form,#p2p-access-form,#organization-create-form,#print-profile-form,#budget-print-form,#management-form,#project-attachment-form,#planning-task-form,#planning-split-form,#planning-settings,#budget-bulk-form,#nested-analysis-form,#price-list-form,#scoped-price-form",
      )
    )
      state.pageDirty = true;
    if (state.modal && evt.target.closest?.("#dialog-form"))
      state.modalDirty = true;
    if (evt.target.name === "library-trade") {
      const trade = state.trades.find((row) => row.id === evt.target.value),
        form = evt.target.closest("form");
      if (trade && form) {
        form.querySelector('[name="code"]').value = trade.code;
        form.querySelector('[name="title"]').value = trade.name;
      }
    }
    try {
      await pricing.change(evt.target);
      await patterns.change(evt.target);
      await operations.change(evt.target);
      await printProfile.change(evt.target);
      await printing.change(evt.target);
      await management.change(evt.target);
      await planning.change(evt.target);
      await costing.change(evt.target);
      await budgetTools.change(evt.target);
    } catch (error) {
      state.message = String(error);
      render();
    }
    if (
      evt.target.name === "resource" &&
      evt.target.closest(".component-row")
    ) {
      const row = evt.target.closest(".component-row");
      const price = row.querySelector('input[name="unitPrice"]');
      const selected = state.resources.find((r) => r.id === evt.target.value);
      if (
        price &&
        state.modal?.kind === "line-resources" &&
        selectors.currentEstimate()?.currency === "USD"
      )
        price.value = "";
      else if (price && selected?.price != null) price.value = selected.price;
    }
    if (evt.target.name === "estimate-picker") {
      try {
        await switchEstimate(evt.target.value);
      } catch (error) {
        state.message = String(error);
        render();
      }
    }
  });
  document.addEventListener("focusin", (evt) => {
    unitPicker.focus(evt);
    resourcePicker.focus(evt);
  });
  document.addEventListener("input", (evt) => {
    if (
      evt.target.closest?.(
        "#p2p-invite-form,#p2p-join-form,#p2p-access-form,#organization-create-form,#print-profile-form,#budget-print-form,#management-form,#project-attachment-form,#planning-task-form,#planning-split-form,#planning-settings,#budget-bulk-form,#nested-analysis-form,#price-list-form,#scoped-price-form",
      )
    )
      state.pageDirty = true;
    people.input(evt.target);
    printing.input(evt.target);
    pricing.input(evt.target);
    patterns.input(evt.target);
    unitPicker.input(evt);
    resourcePicker.input(evt);
    operations.input(evt.target);
    if (state.modal && evt.target.closest?.("#dialog-form"))
      state.modalDirty = true;
    if (!evt.target.matches("[data-search]")) return;
    state.search = evt.target.value;
    filterRows(state.search);
  });
  document.addEventListener("contextmenu", (evt) => {
    if (people.hasModal()) {
      evt.preventDefault();
      return;
    }
    interactions.contextMenu(evt).catch((error) => {
      state.message = String(error);
      render();
    });
  });
  document.addEventListener("dblclick", (evt) => {
    (async () => {
      if (await pricing.doubleClick(evt)) return;
      await interactions.doubleClick(evt);
    })().catch((error) => {
      state.message = String(error);
      render();
    });
  });
  document.addEventListener("dragstart", (evt) => {
    if(planning.dragStart(evt))return;
    if (!pricing.dragStart(evt)) interactions.dragStart(evt);
  });
  document.addEventListener("dragover", (evt) => {
    if(planning.dragOver(evt))return;
    if (!pricing.dragOver(evt)) interactions.dragOver(evt);
  });
  document.addEventListener("dragend", () => {
    planning.dragEnd();
    pricing.dragEnd();
    interactions.dragEnd();
  });
  document.addEventListener("drop", (evt) => {
    (async () => {
      if(await planning.drop(evt))return;
      if (await pricing.drop(evt)) return;
      await interactions.drop(evt);
    })().catch((error) => {
      state.message = String(error);
      render();
    });
  });
  document.addEventListener("pointerdown", (evt) => {if(!management.pointerDown(evt))planning.pointerDown(evt);});
  document.addEventListener("pointermove",evt=>{if(!management.pointerMove(evt))planning.pointerMove(evt);});
  document.addEventListener("pointercancel",()=>{planning.cancelPointer();management.cancelPointer();});
  document.addEventListener("pointerup", async (evt) => {
    try {
      if(!management.pointerUp(evt))await planning.pointerUp(evt);
    } catch (error) {
      state.message = String(error);
      render();
    }
  });
  document.addEventListener("keydown", (evt) => {
    if(evt.key==='Escape'&&state.view==='planning'&&(document.querySelector('#planning-task-form')||document.querySelector('#planning-split-form'))){evt.preventDefault();const action=document.querySelector('#planning-split-form')?'plan-split-cancel':'plan-cancel';planning.act({dataset:{action}}).catch(error=>{state.message=String(error);render();});return;}
    if (people.keyDown(evt)) return;
    if (patterns.keyDown(evt)) return;
    if (unitPicker.keyDown(evt)) return;
    if (pricing.keyDown(evt)) return;
    if (resourcePicker.keyDown(evt)) return;
    if (operations.keyDown(evt)) return;
    if (interactions.keyDown(evt)) return;
    if (evt.key === "Escape" && state.modal) {
      evt.preventDefault();
      closeModal();
    }
    if (
      (evt.key === "Enter" || evt.key === " ") &&
      evt.target.matches("tr[data-action]")
    ) {
      evt.preventDefault();
      evt.target.click();
    }
  });

  const ready = (async () => {
    try {
      await loadCollections();
      render();
    } catch (error) {
      root.innerHTML = `<div class="startup-error"><h2>No se pudo abrir la base de datos local</h2><p>${e(error)}</p><button data-action="retry-startup">Reintentar</button></div>`;
    }
  })();

  return { state, ready, render };
}
