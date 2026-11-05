export function createState() {
return {
  view: "projects", projectId: null, estimateId: null, selectedLineId: null,
  selectedResourceId: null, selectedAnalysisId: null, panel: "acu",
  units: [], trades: [], backups: [], modal: null, busy: false, message: "", clients: [], projects: [],
  estimates: [], lines: [], sections: [], assignments: {}, resources: [], analyses: [],
  rates: null, totals: null, detail: null, history: [], takeoffs: [], comparison: null,
  costComparison: null, search: "", acuComponents: []
};

}

export function createSelectors(state) {
const currentProject = () => state.projects.find(p => p.id === state.projectId);
const currentEstimate = () => state.estimates.find(p => p.id === state.estimateId);
const currentLine = () => state.lines.find(p => p.id === state.selectedLineId);
const editable = () => Boolean(currentEstimate() && !currentEstimate().issued);
const projectName = id => state.projects.find(p => p.id === id)?.name || "Obra";
const clientName = id => state.clients.find(c => c.id === id)?.name || "Sin cliente";
const locked = () => !editable() ? "disabled title='El presupuesto está emitido o no hay presupuesto'" : "";
return { currentProject, currentEstimate, currentLine, editable, projectName, clientName, locked };
}
