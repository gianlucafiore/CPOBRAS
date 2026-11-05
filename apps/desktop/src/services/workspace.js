export function createWorkspaceService({ invoke, state, currentLine, render }) {
async function loadCollections() {
  [state.clients, state.projects, state.resources, state.analyses, state.units, state.trades] = await Promise.all([
    invoke("list_clients"), invoke("list_projects"), invoke("list_resources"), invoke("list_analyses"), invoke("list_management_records",{kind:"unit",projectId:null}), invoke("list_management_records",{kind:"trade",projectId:null})
  ]);
}
async function loadEstimates() {
  state.estimates = state.projectId ? await invoke("list_project_estimates", { projectId: state.projectId }) : [];
}
async function loadEstimate() {
  if (!state.estimateId) {
    state.lines = []; state.sections = []; state.assignments = {};
    state.rates = null; state.totals = null; state.detail = null; state.takeoffs = [];
    render(); return;
  }
  const id = state.estimateId;
  const [lines, sections, assignments, rates, totals] = await Promise.all([
    invoke("list_estimate_lines", { estimateId: id }),
    invoke("list_budget_sections", { estimateId: id }),
    invoke("list_line_sections", { estimateId: id }),
    invoke("get_estimate_pricing", { estimateId: id }),
    invoke("priced_estimate_total", { estimateId: id })
  ]);
  if (state.estimateId !== id) return;
  state.lines = lines; state.sections = sections;
  state.assignments = Object.fromEntries(assignments.map(item => [item.line_id, item.section_id]));
  state.rates = rates; state.totals = totals;
  if (!state.lines.some(line => line.id === state.selectedLineId)) state.selectedLineId = state.lines[0]?.id || null;
  await loadPanel();
  render();
}
async function loadPanel() {
  const line = currentLine();
  state.detail = null;
  state.takeoffs = [];
  if (state.panel === "acu" && line?.analysis_id) {
    try { state.detail = await invoke("get_analysis_details", { analysisId: line.analysis_id }); }
    catch { state.detail = null; }
  }
  if (state.panel === "takeoffs" && line) {
    state.takeoffs = await invoke("list_takeoffs", { estimateId: state.estimateId, lineId: line.id });
  }
}
async function openProject(id) {
  state.projectId = id; state.view = "workspace"; state.panel = "acu"; state.selectedLineId = null;
  await loadEstimates();
  state.estimateId = state.estimates[0]?.id || null;
  state.search = "";
  await loadEstimate();
}
async function openEstimate(id) {
  state.estimateId = id || null; state.selectedLineId = null; state.panel = "acu";
  await loadEstimate();
}
async function reloadCatalog() {
  [state.resources, state.analyses] = await Promise.all([invoke("list_resources"), invoke("list_analyses")]);
}
async function refreshResource() {
  state.history = state.selectedResourceId ?
    await invoke("list_price_history", { resourceId: state.selectedResourceId }) : [];
}
async function refreshAnalysis() {
  state.detail = state.selectedAnalysisId ?
    await invoke("get_analysis_details", { analysisId: state.selectedAnalysisId }) : null;
}
return { loadCollections, loadEstimates, loadEstimate, loadPanel, openProject, openEstimate, reloadCatalog, refreshResource, refreshAnalysis };
}
