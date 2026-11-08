import { sumDecimals } from "../decimal.js";
export function createWorkspaceService({ invoke,globalInvoke=invoke, state, currentLine, render }) {
  async function loadCollections() {
    if(state.remoteProject){
      const remote=state.remoteProject,d=remote.data;
      state.projects=[{...d.project,organization_id:d.organization.id,organization_name:d.organization.name,organization_locked:true,read_only:true}];
      state.clients=d.client?[d.client]:[];state.personClients=state.clients;state.personSuppliers=d.suppliers||[];
      state.organizations=[{...d.organization,ownership:'external',owner_peer_id:remote.owner,is_default:false}];
      state.resources=await invoke('list_resources');state.analyses=await invoke('list_analyses');
      state.units=(d.records||[]).filter(r=>r.kind==='unit');state.trades=(d.records||[]).filter(r=>r.kind==='trade');return;
    }
    [
      state.clients,
      state.projects,
      state.resources,
      state.analyses,
      state.units,
      state.trades,
      state.organizations,
      state.personClients,
      state.personSuppliers,
      state.externalProjects,
    ] = await Promise.all([
      globalInvoke("list_clients"),
      globalInvoke("list_projects"),
      globalInvoke("list_resources"),
      globalInvoke("list_analyses"),
      globalInvoke("list_management_records", { kind: "unit", projectId: null }),
      globalInvoke("list_management_records", { kind: "trade", projectId: null }),
      globalInvoke("list_organizations"),
      globalInvoke("list_persons", { role: "client" }),
      globalInvoke("list_persons", { role: "supplier" }),
      globalInvoke("p2p_projects").catch(error=>{state.externalProjectError=String(error);return [];}),
    ]);
  }
  async function loadEstimates() {
    state.estimates = state.projectId
      ? await invoke("list_project_estimates", { projectId: state.projectId })
      : [];
  }
  async function loadEstimate() {
    if (!state.estimateId) {
      state.lines = [];
      state.sections = [];
      state.assignments = {};
      state.rates = null;
      state.totals = null;
      state.detail = null;
      state.takeoffs = [];
      render();
      return;
    }
    const id = state.estimateId;
    const [lines, sections, assignments, rates, totals] = await Promise.all([
      invoke("list_estimate_lines", { estimateId: id }),
      invoke("list_budget_sections", { estimateId: id }),
      invoke("list_line_sections", { estimateId: id }),
      invoke("get_estimate_pricing", { estimateId: id }),
      invoke("priced_estimate_total", { estimateId: id }).catch((error) => ({
        pricing_error: String(error),
        total: null,
      })),
    ]);
    if (state.estimateId !== id) return;
    state.lines = lines;
    state.sections = sections;
    state.assignments = Object.fromEntries(
      assignments.map((item) => [item.line_id, item.section_id]),
    );
    if (totals.pricing_error)
      totals.direct = sumDecimals(lines.map((l) => l.total));
    state.rates = rates;
    state.totals = totals;
    if (!state.lines.some((line) => line.id === state.selectedLineId))
      state.selectedLineId = state.lines[0]?.id || null;
    await loadPanel();
    render();
  }
  async function loadPanel() {
    const line = currentLine(),
      panel = state.panel,
      estimateId = state.estimateId;
    const current = () =>
      state.selectedLineId === (line?.id || null) &&
      state.panel === panel &&
      state.estimateId === estimateId;
    state.detail = null;
    state.takeoffs = [];
    if (["acu", "resources"].includes(panel) && estimateId) {
      const prices = await invoke("get_estimate_resource_prices", {
        estimateId,
      });
      if (current()) state.estimateResourcePrices = prices;
    }
    if (["acu", "resources"].includes(state.panel) && line?.analysis_id) {
      try {
        const detail = await invoke("get_analysis_details", {
          analysisId: line.analysis_id,
        });
        if (current()) state.detail = detail;
      } catch {
        if (current()) state.detail = null;
      }
    }
    if (state.panel === "takeoffs" && line) {
      const rows = await invoke("list_takeoffs", {
        estimateId,
        lineId: line.id,
      });
      if (current()) state.takeoffs = rows;
    }
  }
  function clearBudget() {
    Object.assign(state, {
      estimateId: null,
      lines: [],
      sections: [],
      assignments: {},
      rates: null,
      totals: null,
      detail: null,
      takeoffs: [],
      selectedLineId: null,
      selectedSectionId: null,
      pricePreview: null,
      estimateResourcePrices: {},
      comparison: null,
      costComparison: null,
    });
  }
  async function openProject(id) {
    if (!state.projects.some((p) => p.id === id))
      throw new Error("Obra inexistente");
    clearBudget();
    state.estimates = [];
    state.selectedSectionId = null;
    state.projectId = id;
    state.view = "workspace";
    state.panel = state.remoteProject?.data.permissions?.resources===false?"takeoffs":"acu";
    state.selectedLineId = null;
    await loadEstimates();
    state.estimateId = state.estimates[0]?.id || null;
    state.search = "";
    await loadEstimate();
  }
  async function openEstimate(id) {
    if (id && !state.estimates.some((e) => e.id === id))
      throw new Error("El presupuesto no pertenece a la obra abierta");
    clearBudget();
    state.selectedSectionId = null;
    state.estimateId = id || null;
    state.selectedLineId = null;
    state.panel = "acu";
    await loadEstimate();
  }
  async function reloadCatalog() {
    [state.resources, state.analyses] = await Promise.all([
      invoke("list_resources"),
      invoke("list_analyses"),
    ]);
  }
  async function refreshResource() {
    state.history = state.selectedResourceId
      ? await invoke("list_price_history", {
          resourceId: state.selectedResourceId,
        })
      : [];
  }
  async function refreshAnalysis() {
    state.detail = state.selectedAnalysisId
      ? await invoke("get_analysis_details", {
          analysisId: state.selectedAnalysisId,
        })
      : null;
  }
  return {
    loadCollections,
    loadEstimates,
    loadEstimate,
    loadPanel,
    openProject,
    openEstimate,
    reloadCatalog,
    refreshResource,
    refreshAnalysis,
  };
}
