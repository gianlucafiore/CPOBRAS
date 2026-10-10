import { invoke } from "@tauri-apps/api/core";
import "./style.css";

const root = document.querySelector("#app");
const state = {
  view: "projects", projectId: null, estimateId: null, selectedLineId: null,
  selectedResourceId: null, selectedAnalysisId: null, panel: "acu",
  modal: null, busy: false, message: "", clients: [], projects: [],
  estimates: [], lines: [], sections: [], assignments: {}, resources: [], analyses: [],
  rates: null, totals: null, detail: null, history: [], takeoffs: [], comparison: null,
  costComparison: null, search: "", acuComponents: []
};

const e = (value) => String(value ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const n = (value) => Number(String(value ?? "0").replace(",", ".")) || 0;
const money = (value) => n(value).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numeric = (value) => n(value).toLocaleString("es-AR", { maximumFractionDigits: 4 });
const dateToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const currentProject = () => state.projects.find(p => p.id === state.projectId);
const currentEstimate = () => state.estimates.find(p => p.id === state.estimateId);
const currentLine = () => state.lines.find(p => p.id === state.selectedLineId);
const editable = () => Boolean(currentEstimate() && !currentEstimate().issued);
const projectName = id => state.projects.find(p => p.id === id)?.name || "Obra";
const clientName = id => state.clients.find(c => c.id === id)?.name || "Sin cliente";
const kindName = type => ({ material: "Materiales", labor: "Mano de obra", equipment: "Equipos", subcontract: "Subcontratos" })[type] || type;
const kindBadge = type => ({ material: "MAT", labor: "MO", equipment: "EQ", subcontract: "SC" })[type] || type;
const field = (label, name, value = "", options = "") =>
  `<label class="field"><span>${e(label)}</span><input name="${name}" value="${e(value)}" ${options}></label>`;
const select = (label, name, options, selected = "") =>
  `<label class="field"><span>${e(label)}</span><select name="${name}">${options.map(([v, title]) =>
    `<option value="${e(v)}" ${String(v) === String(selected) ? "selected" : ""}>${e(title)}</option>`).join("")}</select></label>`;
const btn = (label, action, cls = "", other = "") =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${other}>${label}</button>`;

async function loadCollections() {
  [state.clients, state.projects, state.resources, state.analyses] = await Promise.all([
    invoke("list_clients"), invoke("list_projects"), invoke("list_resources"), invoke("list_analyses")
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
const locked = () => !editable() ? "disabled title='El presupuesto está emitido o no hay presupuesto'" : "";

function chrome(content) {
  const work = state.view === "workspace";
  return `<div class="app">
    <header class="app-header">
      <div class="brand"><span class="brand-mark">▦</span><b>CPOBRAS</b><small>estudio de costos</small></div>
      <div class="context-title">${work ? `<span>${e(currentProject()?.name)}</span><i class="breadcrumb-arrow">›</i><b>${e(currentEstimate()?.title || "Sin presupuesto")}</b>` : `<b>${({ projects: "Obras y presupuestos", clients: "Directorio de clientes", resources: "Catálogo de insumos", analyses: "Biblioteca de ACU" })[state.view]}</b>`}</div>
      <div class="header-right">${work && currentEstimate() ? `<span class="status-pill ${currentEstimate().issued ? "issued" : ""}">${currentEstimate().issued ? "● Emitido" : "● En elaboración"}</span>
        <span class="total-head"><small>TOTAL</small> ${e(currentEstimate()?.currency)} <strong>${money(state.totals?.total)}</strong></span>` : `<span class="connection">● SQLite local</span>`}</div>
    </header>
    <nav class="menu-bar" aria-label="Navegación principal">
      ${[["projects", "Obras"], ["clients", "Clientes"], ["resources", "Insumos"], ["analyses", "ACU"]].map(([view, label]) =>
        `<button class="menu-item ${state.view === view ? "active" : ""}" data-action="navigate" data-view="${view}">${label}</button>`).join("")}
      ${work ? `<span class="divider"></span><span class="menu-location">${e(currentProject()?.name)}</span>` : ""}
      <span class="grow"></span><span class="kbd-hint">ESC cierra ventanas</span>
    </nav>
    ${content}
    ${state.message ? `<div class="toast" role="status">${e(state.message)} <button data-action="dismiss-toast" aria-label="Cerrar">×</button></div>` : ""}
    ${state.modal ? modalMarkup() : ""}
  </div>`;
}

function gridSections() {
  const groups = new Map();
  for (const line of state.lines) {
    const id = state.assignments[line.id] || "unassigned";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(line);
  }
  const byParent = new Map();
  const ids = new Set(state.sections.map(s => s.id));
  for (const section of state.sections) {
    const parent = section.parent_id && ids.has(section.parent_id) ? section.parent_id : "root";
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(section);
  }
  const lineRow = (line, code = "") => `<tr class="line-row ${line.id === state.selectedLineId ? "selected" : ""}" data-action="select-line" data-id="${e(line.id)}" data-searchable="${e((line.description + " " + line.unit).toLowerCase())}" tabindex="0">
    <td class="col-code muted">${e(code)}</td><td class="col-desc">${e(line.description)} ${line.analysis_id ? '<span class="acu-tag">ACU</span>' : ""}</td>
    <td class="col-unit">${e(line.unit)}</td><td class="number">${numeric(line.quantity)}</td>
    <td class="number">${money(line.unit_cost)}</td><td class="number partial">${money(line.total)}</td></tr>`;
  const sectionSum = id => {
    const sections = [id], visited = new Set();
    while (sections.length) {
      const next = sections.pop();
      if (visited.has(next)) continue;
      visited.add(next);
      for (const child of byParent.get(next) || []) sections.push(child.id);
    }
    return state.lines.filter(line => visited.has(state.assignments[line.id])).reduce((sum, line) => sum + n(line.total), 0);
  };
  const sectionRow = (section, depth = 0) => {
    const children = [...(byParent.get(section.id) || [])].sort((a, b) => a.position - b.position);
    const own = (groups.get(section.id) || []).map((line, i) => lineRow(line, section.code + "." + String(i + 1).padStart(2, "0"))).join("");
    return `<tr class="section-row" data-action="edit-section" data-id="${e(section.id)}" data-searchable="${e((section.code + " " + section.title).toLowerCase())}">
      <td class="col-code">${e(section.code)}</td><td class="col-desc" style="padding-left:${12 + depth * 15}px">▾ &nbsp; ${e(section.title)}</td>
      <td></td><td></td><td></td><td class="number partial">${money(sectionSum(section.id))}</td>
    </tr>${own}${children.map(s => sectionRow(s, depth + 1)).join("")}`;
  };
  const roots = [...(byParent.get("root") || [])].sort((a, b) => a.position - b.position);
  const others = (groups.get("unassigned") || []).map((line, i) => lineRow(line, String(i + 1).padStart(2, "0"))).join("");
  return roots.map(s => sectionRow(s)).join("") +
    (others ? `<tr class="section-row unassigned"><td>—</td><td>PARTIDAS SIN RUBRO</td><td></td><td></td><td></td><td></td></tr>${others}` : "");
}

function workspace() {
  const est = currentEstimate();
  return chrome(`<section class="workspace">
    <div class="work-toolbar">
      <button class="btn orange" data-action="modal-line" ${locked()}>＋ Partida</button>
      <button class="btn dark" data-action="modal-section" ${locked()}>＋ Rubro</button>
      <button class="btn" data-action="modal-from-acu" ${locked()}>＋ Desde ACU</button>
      <span class="vline"></span>
      ${select("Presupuesto", "estimate-picker", [["", "Seleccionar presupuesto"], ...state.estimates.map(s => [s.id, s.title])], state.estimateId)}
      <button class="btn" data-action="modal-estimate">＋ Presupuesto</button>
      <button class="btn ghost" data-action="duplicate-estimate" ${est ? "" : "disabled"}>Duplicar</button><button class="btn ghost" data-action="refresh-draft-costs" ${locked()}>↻ Actualizar precios ACU</button>
      <button class="btn ghost" data-action="modal-comparison" ${state.estimates.length < 2 ? "disabled" : ""}>Comparar</button>
      <span class="grow"></span>
      <button class="btn dark" data-action="issue" ${locked()}>Emitir</button>
    </div>
    <div class="workspace-columns">
      <section class="grid-pane">
        <div class="pane-toolbar">
          <span class="pane-title">PRESUPUESTO <em>${state.lines.length} partidas · ${state.sections.length} rubros</em></span>
          <span class="grow"></span>
          <input class="search-compact" placeholder="⌕ Buscar partida..." data-search value="${e(state.search)}" aria-label="Buscar partida">
          <button class="icon-btn" data-action="edit-line" title="Editar partida seleccionada" ${locked()}>✎</button>
          <button class="icon-btn" data-action="delete-line" title="Eliminar partida" ${locked()}>🗑</button>
        </div>
        <div class="table-scroll">
          <table class="budget-grid"><colgroup><col style="width:9%"><col style="width:43%"><col style="width:9%"><col style="width:12%"><col style="width:13%"><col style="width:14%"></colgroup>
          <thead><tr><th>ÍTEM</th><th>DESCRIPCIÓN</th><th>UND.</th><th class="number">CANTIDAD</th><th class="number">P. UNITARIO</th><th class="number">PARCIAL</th></tr></thead>
          <tbody>${est ? (state.lines.length || state.sections.length ? gridSections() : `<tr class="empty-row"><td colspan="6">Presupuesto vacío. Agregá una partida o creá un rubro para empezar.</td></tr>`) : `<tr class="empty-row"><td colspan="6">Creá un presupuesto para comenzar a trabajar.</td></tr>`}</tbody>
          </table>
        </div>
        <div class="grid-bottom"><span>${e(est?.title || "Sin presupuesto")}</span><span>DIRECTO <strong>${e(est?.currency || "")} ${money(state.totals?.direct)}</strong></span></div>
      </section>
      <section class="detail-pane">
        <div class="detail-tabs">
          ${[["acu", "ACU"], ["takeoffs", "Metrados"], ["resources", "Insumos"], ["summary", "Resumen"]].map(([key, title]) => `<button data-action="panel" data-panel="${key}" class="tab ${state.panel === key ? "active" : ""}">${title}</button>`).join("")}
        </div>
        <div class="detail-content">${rightPanel()}</div>
      </section>
    </div>
  </section>`);
}

function rightPanel() {
  const line = currentLine();
  if (state.panel === "summary") return summaryPane();
  if (state.panel === "resources") return `<div class="detail-heading"><b>INSUMOS</b><span>Biblioteca general</span></div>
    <div class="mini-scroll"><table class="mini-table"><thead><tr><th>TIPO</th><th>DESCRIPCIÓN</th><th>UND.</th><th class="number">PRECIO ARS</th></tr></thead><tbody>
    ${state.resources.map(r => `<tr><td><span class="kind kind-${e(r.kind)}">${kindBadge(r.kind)}</span></td><td>${e(r.description)}</td><td>${e(r.unit)}</td><td class="number">${r.price === null ? "—" : money(r.price)}</td></tr>`).join("")}
    </tbody></table></div><div class="detail-footer">${btn("Abrir catálogo", "goto-resources", "primary")}</div>`;
  if (!line) return `<div class="blank-state"><span>▧</span><strong>Seleccioná una partida</strong><p>Su análisis de costos y mediciones aparecerán acá.</p></div>`;
  if (state.panel === "takeoffs") return takeoffPane(line);
  return acuPane(line);
}
function acuPane(line) {
  const d = state.detail;
  const subtitle = d ? `<span class="label-muted">${e(d.code)} · ${e(d.unit)}</span>` : "";
  const rows = d?.components || [];
  const byKinds = ["material", "labor", "equipment", "subcontract"].map(type => {
    const group = rows.filter(row => row.kind === type);
    if (!group.length) return "";
    return `<tr class="group-row"><td colspan="5">${kindName(type).toUpperCase()}</td></tr>
      ${group.map(row => `<tr><td><span class="kind kind-${type}">${kindBadge(type)}</span></td><td>${e(row.description)}</td><td class="number">${numeric(row.quantity)}</td><td class="number">${money(row.unit_price)}</td><td class="number">${money(row.total)}</td></tr>`).join("")}`;
  }).join("");
  return `<div class="detail-heading"><div><strong>${e(line.description)}</strong>${subtitle}</div>
    <div class="heading-actions"><button class="btn tiny" data-action="modal-from-acu" ${locked()}>＋ Partida ACU</button><button class="btn tiny" data-action="edit-analysis" data-id="${e(line.analysis_id)}" ${!line.analysis_id ? "disabled" : ""}>Editar ACU</button><button class="btn tiny" data-action="modal-contracting" ${!line.analysis_id ? "disabled" : ""}>Comparar costos</button></div>
  </div>
  ${d ? `<div class="mini-scroll"><table class="mini-table"><thead><tr><th>TIPO</th><th>DESCRIPCIÓN</th><th class="number">CANT.</th><th class="number">PRECIO</th><th class="number">PARCIAL</th></tr></thead><tbody>${byKinds}</tbody></table></div>` :
    `<div class="blank-state"><span>▤</span><strong>Partida con precio manual</strong><p>Para ver el desglose, agregá una partida desde la biblioteca de ACU.</p></div>`}
  <div class="context-summary"><div><small>Precio unitario guardado</small><b>${money(line.unit_cost)}</b></div><div><small>Precio actual del ACU</small><b>${d ? money(d.unit_cost) : "—"}</b></div></div>
  <div class="detail-footer muted-note">El presupuesto conserva el precio unitario original aunque se actualicen los insumos.</div>`;
}
function takeoffPane(line) {
  const qty = state.takeoffs.reduce((total, row) => total + n(row.quantity), 0);
  return `<div class="detail-heading"><div><strong>METRADOS · ${e(line.description)}</strong><span class="label-muted">Factor × Largo × Ancho × Alto</span></div>
    <button class="btn tiny primary" data-action="modal-takeoff" ${locked()}>＋ Medición</button>
  </div><div class="mini-scroll"><table class="mini-table takeoff-table"><thead><tr><th>DESCRIPCIÓN</th><th class="number">F</th><th class="number">L</th><th class="number">A</th><th class="number">H</th><th class="number">CANT.</th><th></th></tr></thead><tbody>
  ${state.takeoffs.map(row => `<tr><td><button class="link" data-action="edit-takeoff" data-id="${e(row.id)}">${e(row.note || "Medición")}</button></td><td class="number">${numeric(row.factor)}</td><td class="number">${numeric(row.length)}</td><td class="number">${numeric(row.width)}</td><td class="number">${numeric(row.height)}</td><td class="number ${row.sign < 0 ? "negative" : ""}">${row.sign < 0 ? "−" : "+"}${numeric(Math.abs(n(row.quantity)))}</td><td><button class="tiny-danger" data-action="delete-takeoff" data-id="${e(row.id)}" ${locked()}>×</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty-cell">Todavía no hay mediciones.</td></tr>`}
  </tbody></table></div><div class="context-summary"><div><small>Cantidad medida</small><b>${numeric(qty)} ${e(line.unit)}</b></div><div><small>Presupuesto</small><b>${numeric(line.quantity)} ${e(line.unit)}</b></div></div>
  <div class="detail-footer"><button class="btn primary" data-action="apply-takeoffs" ${locked()} ${state.takeoffs.length === 0 ? "disabled" : ""}>Aplicar cantidad medida</button><span class="muted-note">Las mediciones negativas descuentan vanos y aberturas.</span></div>`;
}
function summaryPane() {
  const t = state.totals || {};
  const r = state.rates || {};
  return `<div class="detail-heading"><strong>RESUMEN DEL PRESUPUESTO</strong><button class="btn tiny" data-action="modal-rates" ${locked()}>Editar porcentajes</button></div>
    <div class="summary-rows">
      ${[
        ["Costo directo", t.direct, ""],
        ["Gastos generales", t.general_expenses, r.general_expenses_percent],
        ["Beneficio", t.profit, r.profit_percent],
        ["Descuento", t.discount, r.discount_percent],
        ["Subtotal gravado", t.taxable_subtotal, ""],
        ["Impuestos", t.taxes, r.tax_percent]
      ].map(([label, value, rate]) => `<div class="summary-row"><span>${label} ${rate !== "" && rate != null ? `<small>${e(rate)}%</small>` : ""}</span><strong>${money(value)}</strong></div>`).join("")}
    </div><div class="summary-final"><span>TOTAL PRESUPUESTADO</span><strong>${e(currentEstimate()?.currency || "ARS")} ${money(t.total)}</strong></div>
    <div class="detail-footer muted-note">Cálculo decimal realizado en Rust. Los porcentajes son configurables y quedan bloqueados al emitir.</div>`;
}

function listViews() {
  let title, subtitle, action, headers, rows, inspector = "";
  if (state.view === "projects") {
    title = "Obras"; subtitle = "Accedé a tus presupuestos y sus análisis."; action = btn("＋ Nueva obra", "modal-project", "primary");
    headers = ["OBRA", "CLIENTE", "MONEDA", ""];
    rows = state.projects.map(p => `<tr data-searchable="${e((p.name + " " + clientName(p.client_id)).toLowerCase())}"><td><strong>${e(p.name)}</strong></td><td>${e(clientName(p.client_id))}</td><td>${e(p.currency === "Usd" ? "USD" : "ARS")}</td><td class="actions-cell"><button class="btn tiny" data-action="edit-project" data-id="${e(p.id)}">Editar</button><button class="btn tiny primary" data-action="open-project" data-id="${e(p.id)}">Abrir ›</button></td></tr>`).join("");
  } else if (state.view === "clients") {
    title = "Clientes"; subtitle = "Comitentes registrados en la base local."; action = btn("＋ Nuevo cliente", "modal-client", "primary");
    headers = ["CLIENTE", "CUIT", ""];
    rows = state.clients.map(c => `<tr data-searchable="${e(c.name.toLowerCase())}"><td><strong>${e(c.name)}</strong></td><td>${e(c.cuit || "—")}</td><td></td></tr>`).join("");
  } else if (state.view === "resources") {
    title = "Biblioteca de insumos"; subtitle = "Materiales, mano de obra, equipos y subcontratos."; action = btn("＋ Nuevo insumo", "modal-resource", "primary");
    headers = ["CÓDIGO", "DESCRIPCIÓN", "TIPO", "UND.", "PRECIO ARS", ""];
    rows = state.resources.map(r => `<tr class="${state.selectedResourceId === r.id ? "selected" : ""}" data-action="select-resource" data-id="${e(r.id)}" data-searchable="${e((r.code + " " + r.description + " " + r.kind).toLowerCase())}"><td>${e(r.code)}</td><td><strong>${e(r.description)}</strong></td><td><span class="kind kind-${e(r.kind)}">${kindBadge(r.kind)}</span></td><td>${e(r.unit)}</td><td class="number">${r.price == null ? "—" : money(r.price)}</td><td class="actions-cell"><button class="btn tiny" data-action="edit-resource" data-id="${e(r.id)}">Editar</button><button class="btn tiny" data-action="modal-price" data-id="${e(r.id)}">＋ Precio</button></td></tr>`).join("");
    const selected = state.resources.find(r => r.id === state.selectedResourceId);
    inspector = `<aside class="list-inspector"><h3>HISTORIAL DE PRECIOS</h3>${selected ?
      `<strong>${e(selected.description)}</strong><p class="small-muted">${e(selected.code)} · ${e(selected.unit)}</p>
      <button class="btn tiny" data-action="edit-resource" data-id="${e(selected.id)}">Editar insumo</button> <button class="btn primary tiny" data-action="modal-price" data-id="${e(selected.id)}">＋ Registrar precio</button>
      <div class="price-history">${state.history.map(h => `<div><span>${e(h.effective_date)}<small>${e(h.source || "Manual")}</small></span><strong>${e(h.currency)} ${money(h.amount)}</strong></div>`).join("") || '<p class="small-muted">Sin registros.</p>'}</div>` :
      '<p class="small-muted">Seleccioná un insumo para consultar sus precios.</p>'}</aside>`;
  } else {
    title = "Análisis de costos unitarios"; subtitle = "Costos compuestos a partir de insumos y rendimientos."; action = btn("＋ Nuevo ACU", "modal-analysis", "primary");
    headers = ["CÓDIGO", "DESCRIPCIÓN", "UND.", "PRECIO UNITARIO", ""];
    rows = state.analyses.map(a => `<tr class="${state.selectedAnalysisId === a.id ? "selected" : ""}" data-action="select-analysis" data-id="${e(a.id)}" data-searchable="${e((a.code + " " + a.description).toLowerCase())}"><td>${e(a.code)}</td><td><strong>${e(a.description)}</strong></td><td>${e(a.unit)}</td><td class="number">${money(a.unit_cost)}</td><td><button class="btn tiny" data-action="edit-analysis" data-id="${e(a.id)}">Editar ACU</button> <button class="btn tiny" data-action="modal-reprice" data-id="${e(a.id)}">Actualizar precios</button></td></tr>`).join("");
    inspector = `<aside class="list-inspector"><h3>COMPOSICIÓN DEL ACU</h3>${state.detail && state.selectedAnalysisId ?
      `<strong>${e(state.detail.description)}</strong><p class="small-muted">Costo unitario ARS ${money(state.detail.unit_cost)}</p>
      <button class="btn primary tiny" data-action="edit-analysis" data-id="${e(state.selectedAnalysisId)}">✎ Editar ACU</button> <button class="btn tiny" data-action="modal-reprice" data-id="${e(state.selectedAnalysisId)}">Recalcular por fecha</button>
      <div class="component-list">${state.detail.components.map(row => `<div><span><span class="kind kind-${e(row.kind)}">${kindBadge(row.kind)}</span> ${e(row.description)}<small>${numeric(row.quantity)} × ${money(row.unit_price)}</small></span><b>${money(row.total)}</b></div>`).join("")}</div>` :
      '<p class="small-muted">Seleccioná un ACU para ver sus insumos.</p>'}</aside>`;
  }
  return chrome(`<main class="list-workspace">
    <div class="list-top"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="list-top-actions">${action}</div></div>
    <div class="list-content"><section class="list-table-pane"><div class="pane-toolbar"><span class="pane-title">REGISTROS <em>${rows ? "" : "Sin datos"}</em></span><span class="grow"></span><input class="search-compact" data-search placeholder="⌕ Buscar..." value="${e(state.search)}"></div>
      <div class="table-scroll"><table class="data-grid"><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty-cell">No hay registros todavía. Usá el botón superior para crear uno.</td></tr>`}</tbody></table></div></section>${inspector}</div>
  </main>`);
}

function render() {
  const top = document.querySelector(".table-scroll");
  const position = top?.scrollTop || 0;
  root.innerHTML = state.view === "workspace" ? workspace() : listViews();
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
function modalMarkup() {
  const modal = state.modal;
  const kind = modal.kind, item = modal.record || {};
  let title = "", body = "", wide = false;
  const projectOptions = state.clients.map(c => [c.id, c.name]);
  const sectionOptions = [["", "Sin rubro"], ...state.sections.map(s => [s.id, s.code + " · " + s.title])];
  const resourceOptions = state.resources.map(r => [r.id, r.code + " · " + r.description + " (" + r.unit + ")"]);
  if (kind === "client") {
    title = "Nuevo cliente"; body = field("Nombre / razón social", "clientName", "", "required autofocus") + field("CUIT (opcional)", "cuit");
  } else if (kind === "project") {
    title = item.id ? "Editar obra" : "Nueva obra";
    body = field("Nombre de la obra", "projectName", item.name, "required") +
      select("Cliente / comitente", "clientId", projectOptions, item.client_id) +
      select("Moneda base", "currency", [["ARS", "Pesos argentinos (ARS)"], ["USD", "Dólares (USD)"]], item.currency === "Usd" || item.currency === "USD" ? "USD" : "ARS");
  } else if (kind === "estimate") {
    title = "Nuevo presupuesto"; body = field("Nombre o versión", "title", "Presupuesto inicial", "required");
  } else if (kind === "section") {
    title = item.id ? "Editar rubro" : "Agregar rubro / subrubro";
    body = field("Código", "code", item.code || String(state.sections.length + 1).padStart(2, "0"), "required") +
      field("Nombre del rubro", "title", item.title, "required") +
      select("Depende de", "parentId", sectionOptions.filter(([id]) => id !== item.id), item.parent_id || "") +
      field("Orden", "position", item.position ?? state.sections.length, 'type="number" min="0" required');
  } else if (kind === "line") {
    title = item.id ? "Editar partida" : "Agregar partida";
    body = field("Descripción", "description", item.description, "required") +
      `<div class="form-grid three">${field("Unidad", "unit", item.unit || "m²", "required")}${field("Cantidad", "quantity", item.quantity ?? 1, 'type="number" min="0" step="any" required')}${field("Precio unitario", "unitCost", item.unit_cost ?? 0, 'type="number" min="0" step="any" required')}</div>` +
      select("Rubro", "sectionId", sectionOptions, state.assignments[item.id] || "");
  } else if (kind === "from-acu") {
    title = "Insertar partida desde ACU";
    body = select("Análisis de costos", "analysisId", state.analyses.map(a => [a.id, a.code + " · " + a.description + " — ARS " + money(a.unit_cost)])) +
      field("Cantidad", "quantity", 1, 'type="number" min="0" step="any" required') +
      select("Rubro", "sectionId", sectionOptions);
  } else if (kind === "resource") {
    const editing = Boolean(item.id);
    title = editing ? "Editar insumo" : "Agregar insumo";
    body = field("Código", "code", item.code || "", "required") +
      field("Descripción", "description", item.description || "", "required") +
      `<div class="form-grid">${field("Unidad", "unit", item.unit || "kg", "required")}
      ${select("Tipo", "kind", [["material", "Material"], ["labor", "Mano de obra"], ["equipment", "Equipo"], ["subcontract", "Subcontrato"]], item.kind)}</div>` +
      (editing ? select("Estado", "active", [["true", "Activo"], ["false", "Inactivo"]], String(item.active !== false)) +
        `<p class="modal-help">Cambiar los datos del insumo no modifica los precios históricos ni los análisis ya guardados.</p>` :
        field("Precio inicial (ARS)", "price", 0, 'type="number" min="0" step="any" required') +
        field("Fecha del precio", "effectiveDate", dateToday(), 'type="date" required') +
        field("Fuente / proveedor", "source", "Carga manual"));
  } else if (kind === "price") {
    title = "Registrar precio"; body = `<p class="modal-help">${e(state.resources.find(r => r.id === item.id)?.description)}</p>` +
      field("Precio", "amount", "", 'type="number" min="0" step="any" required') +
      select("Moneda", "currency", [["ARS", "ARS"], ["USD", "USD"]]) +
      field("Fecha de vigencia", "effectiveDate", dateToday(), 'type="date" required') +
      field("Fuente / proveedor", "source", "Cotización manual");
  } else if (kind === "analysis") {
    const editing = Boolean(item.id);
    title = editing ? "Editar análisis de costo unitario" : "Crear análisis de costo unitario";
    wide = true;
    body = `<div class="form-grid three">
      ${field("Código ACU", "code", item.code || "", "required")}
      ${field("Descripción", "description", item.description || "", "required")}
      ${field("Unidad de la partida", "unit", item.unit || "m²", "required")}
    </div>
    <div class="form-subhead">COMPOSICIÓN DEL ACU
      <button class="btn tiny" type="button" data-action="add-component">＋ Agregar insumo</button>
    </div>
    <div class="component-editor" id="component-editor">
      ${state.acuComponents.map((row, index) => `<div class="form-grid component-row">
        ${select("Insumo", "resource", resourceOptions, row.resourceId)}
        ${field("Rendimiento / unidad", "quantity", row.quantity ?? 1, 'type="number" min="0" step="any" required')}
        ${field("Precio unitario ARS", "unitPrice", row.unitPrice ?? state.resources.find(r => r.id === row.resourceId)?.price ?? 0, 'type="number" min="0" step="any" required')}
        <button type="button" class="tiny-danger" data-action="remove-component" data-index="${index}" aria-label="Quitar componente">×</button>
      </div>`).join("")}
    </div>
    <p class="modal-help">Podés modificar rendimientos, insumos y precios de este ACU. La edición no cambia los presupuestos anteriores. Para trasladar los nuevos costos a un borrador, utilizá «Actualizar precios ACU».</p>`;
  } else if (kind === "reprice") {
    title = "Actualizar precios del ACU"; body = `<p class="modal-help">Se recalculará ${e(state.analyses.find(a => a.id === item.id)?.description)} con las cotizaciones vigentes a la fecha indicada. Los presupuestos anteriores NO cambian.</p>` +
      field("Precios vigentes al", "effectiveDate", dateToday(), 'type="date" required');
  } else if (kind === "takeoff") {
    title = item.id ? "Editar medición" : "Nueva medición"; wide = true;
    body = field("Descripción de la medición", "note", item.note || "Medición") +
      `<div class="form-grid three">${field("Factor", "factor", item.factor ?? 1, 'type="number" min="0" step="any" required')}${field("Largo", "length", item.length ?? 1, 'type="number" min="0" step="any" required')}${field("Ancho", "width", item.width ?? 1, 'type="number" min="0" step="any" required')}${field("Alto", "height", item.height ?? 1, 'type="number" min="0" step="any" required')}${select("Operación", "sign", [["1", "Sumar"], ["-1", "Descontar"]], item.sign ?? 1)}${field("Orden", "position", item.position ?? state.takeoffs.length, 'type="number" min="0" required')}</div>`;
  } else if (kind === "rates") {
    title = "Gastos generales, utilidad e impuestos";
    body = `<div class="form-grid">${field("Gastos generales %", "generalExpensesPercent", state.rates?.general_expenses_percent ?? 0, 'type="number" min="0" step="any" required')}
    ${field("Beneficio %", "profitPercent", state.rates?.profit_percent ?? 0, 'type="number" min="0" step="any" required')}
    ${field("Descuento %", "discountPercent", state.rates?.discount_percent ?? 0, 'type="number" min="0" max="100" step="any" required')}
    ${field("Impuestos %", "taxPercent", state.rates?.tax_percent ?? 0, 'type="number" min="0" step="any" required')}</div>`;
  } else if (kind === "comparison") {
    title = "Comparar versiones"; body = select("Comparar presupuesto actual contra", "baselineId",
      state.estimates.filter(s => s.id !== state.estimateId).map(s => [s.id, s.title]));
  } else if (kind === "contracting") {
    title = "Ejecución propia vs. subcontrato"; body = `<p class="modal-help">Compará los recursos del ACU con el precio que te cotiza un subcontratista.</p>` +
      select("ACU de ejecución propia", "analysisId", state.analyses.map(a => [a.id, a.code + " · " + a.description]), currentLine()?.analysis_id) +
      field("Cantidad de obra", "quantity", currentLine()?.quantity || 1, 'type="number" min="0" step="any" required') +
      field("Costo adicional propio por unidad", "ownExtraPerUnit", 0, 'type="number" min="0" step="any" required') +
      field("Precio unitario del subcontrato", "subcontractPricePerUnit", 0, 'type="number" min="0" step="any" required');
  } else if (kind === "comparison-result") {
    title = "Diferencias entre presupuestos"; wide = true;
    const d = state.comparison;
    body = `<div class="compare-cards"><span>ORIGINAL<b>${money(d.baseline_total)}</b></span><span>REVISADO<b>${money(d.revised_total)}</b></span><span>DIFERENCIA<b>${money(d.difference)}</b></span></div>
      <div class="comparison-scroll"><table class="mini-table"><thead><tr><th>PARTIDA</th><th>UND.</th><th class="number">ORIGINAL</th><th class="number">REVISADO</th><th class="number">DIFERENCIA</th></tr></thead><tbody>
      ${d.lines.map(l => `<tr><td>${e(l.description)}</td><td>${e(l.unit)}</td><td class="number">${money(l.baseline_cost)}</td><td class="number">${money(l.revised_cost)}</td><td class="number">${money(l.difference)}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (kind === "contracting-result") {
    title = "Alternativas de ejecución";
    const d = state.costComparison;
    body = `<div class="compare-cards"><span>EJECUCIÓN PROPIA<b>${money(d.own_total)}</b></span><span>SUBCONTRATO<b>${money(d.subcontract_total)}</b></span><span>DIFERENCIA<b>${money(d.difference_total)}</b></span></div><p class="modal-help">Diferencia positiva: el subcontrato es más caro. Valores calculados para ${numeric(d.quantity)} unidades, en ARS.</p>`;
  }
  const result = kind.endsWith("-result"), save = kind === "comparison" ? "Comparar" : kind === "contracting" ? "Calcular" : "Guardar";
  return `<div class="modal-overlay" data-action="close-modal"><div class="dialog-shell ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${e(title)}">
    <div class="dialog-header"><h2>${e(title)}</h2><button type="button" class="close-dialog" data-action="close-modal" aria-label="Cerrar">×</button></div>
    <form id="dialog-form" class="dialog-body" data-kind="${kind}">
      ${body}<p class="modal-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="btn" data-action="close-modal">Cerrar</button>${!result ? `<button type="submit" class="btn primary">${save}</button>` : ""}</div>
    </form></div></div>`;
}

async function handleSubmit(form) {
  const kind = form.dataset.kind;
  const data = new FormData(form), v = key => String(data.get(key) ?? "").trim();
  const item = state.modal?.record || {};
  const estimateId = state.estimateId;
  if (kind === "client") await invoke("create_client", { clientName: v("clientName"), cuit: v("cuit") || null });
  else if (kind === "project") {
    const args = { projectName: v("projectName"), clientId: v("clientId"), currency: v("currency") };
    await invoke(item.id ? "update_project" : "create_project", item.id ? { ...args, projectId: item.id } : args);
  } else if (kind === "estimate") {
    const created = await invoke("create_estimate", { projectId: state.projectId, title: v("title") });
    state.estimateId = created.id;
  } else if (kind === "section") {
    await invoke("save_budget_section", { id: item.id || null, estimateId, code: v("code"), title: v("title"), parentId: v("parentId") || null, position: Number(v("position")) });
  } else if (kind === "line") {
    const args = { estimateId, description: v("description"), unit: v("unit"), quantity: v("quantity"), unitCost: v("unitCost") };
    const line = await invoke(item.id ? "update_estimate_line" : "add_estimate_line", item.id ? { ...args, lineId: item.id } : args);
    if (v("sectionId")) await invoke("assign_line_section", { estimateId, lineId: line.id, sectionId: v("sectionId") });
    state.selectedLineId = line.id;
  } else if (kind === "from-acu") {
    const line = await invoke("add_line_from_analysis", { estimateId, analysisId: v("analysisId"), quantity: v("quantity") });
    if (v("sectionId")) await invoke("assign_line_section", { estimateId, lineId: line.id, sectionId: v("sectionId") });
    state.selectedLineId = line.id; state.panel = "acu";
  } else if (kind === "resource") {
    if (item.id) {
      await invoke("update_resource", { resourceId: item.id, code: v("code"),
        description: v("description"), unit: v("unit"), kind: v("kind"), active: v("active") === "true" });
      state.selectedResourceId = item.id;
    } else {
      await invoke("create_resource", { code: v("code"), description: v("description"),
        unit: v("unit"), kind: v("kind"), price: v("price"),
        effectiveDate: v("effectiveDate"), source: v("source") || null });
    }
  } else if (kind === "price") {
    await invoke("register_resource_price", { resourceId: item.id, amount: v("amount"), currency: v("currency"), effectiveDate: v("effectiveDate"), source: v("source") || null });
    state.selectedResourceId = item.id;
  } else if (kind === "analysis") {
    const components = [...form.querySelectorAll(".component-row")].map(row => ({
      resourceId: row.querySelector('select[name="resource"]')?.value,
      quantity: row.querySelector('input[name="quantity"]')?.value,
      unitPrice: row.querySelector('input[name="unitPrice"]')?.value
    }));
    if (!components.length) throw new Error("Agregá al menos un insumo al ACU.");
    const args = { code: v("code"), description: v("description"), unit: v("unit"), components };
    const saved = await invoke(item.id ? "update_analysis" : "create_analysis",
      item.id ? { ...args, analysisId: item.id } : args);
    state.selectedAnalysisId = saved.id;
  } else if (kind === "reprice") {
    await invoke("reprice_analysis", { analysisId: item.id, effectiveDate: v("effectiveDate") });
    state.selectedAnalysisId = item.id;
  } else if (kind === "takeoff") {
    await invoke("save_takeoff", { id: item.id || null, estimateId, lineId: state.selectedLineId, note: v("note"),
      factor: v("factor"), length: v("length"), width: v("width"), height: v("height"),
      sign: Number(v("sign")), position: Number(v("position")) });
  } else if (kind === "rates") {
    await invoke("save_estimate_pricing", { estimateId,
      generalExpensesPercent: v("generalExpensesPercent"), profitPercent: v("profitPercent"),
      discountPercent: v("discountPercent"), taxPercent: v("taxPercent") });
  } else if (kind === "comparison") {
    state.comparison = await invoke("compare_estimates", { baselineId: v("baselineId"), revisedId: estimateId });
    state.modal = { kind: "comparison-result" }; render(); return;
  } else if (kind === "contracting") {
    const detail = await invoke("get_analysis_details", { analysisId: v("analysisId") });
    state.costComparison = await invoke("compare_contracting", {
      ownComponents: detail.components.map(row => ({ resourceId: row.resource_id, quantity: row.quantity })),
      ownExtraPerUnit: v("ownExtraPerUnit"), subcontractPricePerUnit: v("subcontractPricePerUnit"), quantity: v("quantity")
    });
    state.modal = { kind: "contracting-result" }; render(); return;
  }
  state.modal = null;
  await loadCollections();
  if (state.projectId) {
    await loadEstimates();
    await loadEstimate();
  } else if (state.view === "resources") { await refreshResource(); render(); }
  else if (state.view === "analyses") { await refreshAnalysis(); render(); }
  else render();
  state.message = "Cambios guardados";
  render();
}

async function act(button) {
  const action = button.dataset.action;
  if (state.busy && action !== "close-modal") return;
  if (action === "close-modal") {
    closeModal(); return;
  }
  if (action === "dismiss-toast") { state.message = ""; render(); return; }
  if (action === "navigate") {
    state.view = button.dataset.view; state.search = ""; state.selectedLineId = null;
    if (state.view === "resources" && state.selectedResourceId) await refreshResource();
    if (state.view === "analyses" && state.selectedAnalysisId) await refreshAnalysis();
    render(); return;
  }
  if (action === "goto-resources") { state.view = "resources"; state.search = ""; render(); return; }
  if (action === "open-project") { await openProject(button.dataset.id); return; }
  if (action === "open-estimate") { await openEstimate(button.dataset.id); return; }
  if (action === "select-line") {
    state.selectedLineId = button.dataset.id; await loadPanel(); render(); return;
  }
  if (action === "panel") {
    state.panel = button.dataset.panel; await loadPanel(); render(); return;
  }
  if (action === "select-resource") {
    state.selectedResourceId = button.dataset.id; await refreshResource(); render(); return;
  }
  if (action === "select-analysis") {
    state.selectedAnalysisId = button.dataset.id; await refreshAnalysis(); render(); return;
  }
  if (action === "modal-client") return openModal("client");
  if (action === "modal-project") return openModal("project");
  if (action === "edit-project") return openModal("project", state.projects.find(p => p.id === button.dataset.id));
  if (action === "modal-estimate") {
    if (!state.projectId) throw new Error("Abrí una obra antes de crear el presupuesto.");
    return openModal("estimate");
  }
  if (action === "modal-section") return editable() && openModal("section");
  if (action === "edit-section") return editable() && openModal("section", state.sections.find(s => s.id === button.dataset.id));
  if (action === "modal-line") return editable() && openModal("line");
  if (action === "edit-line") return editable() && currentLine() && openModal("line", currentLine());
  if (action === "modal-from-acu") return editable() && openModal("from-acu");
  if (action === "modal-resource") return openModal("resource");
  if (action === "modal-price") return openModal("price", state.resources.find(r => r.id === button.dataset.id));
  if (action === "modal-analysis") return openModal("analysis");
  if (action === "edit-analysis") {
    const id = button.dataset.id || state.selectedAnalysisId;
    if (!id) return;
    const info = await invoke("get_analysis_details", { analysisId: id });
    const entry = state.analyses.find(a => a.id === id);
    if (!entry) throw new Error("El ACU seleccionado ya no existe.");
    return openModal("analysis", { ...entry, components: info.components });
  }
  if (action === "edit-resource") {
    const resource = state.resources.find(r => r.id === button.dataset.id);
    if (resource) return openModal("resource", resource);
    return;
  }
  if (action === "refresh-draft-costs") {
    if (!editable()) return;
    if (!window.confirm("¿Actualizar los precios unitarios de todas las partidas vinculadas a ACU de este borrador? Las cantidades no cambian. Podés duplicar el presupuesto antes para conservar la versión anterior.")) return;
    const result = await invoke("refresh_draft_analysis_costs", { estimateId: state.estimateId });
    await loadEstimate();
    state.message = result.updated_lines +
      " partidas actualizadas. Antes: ARS " + money(result.old_direct_total) +
      " · Ahora: ARS " + money(result.new_direct_total);
    render();
    return;
  }
  if (action === "modal-reprice") return openModal("reprice", state.analyses.find(a => a.id === button.dataset.id));
  if (action === "modal-rates") return editable() && openModal("rates");
  if (action === "modal-takeoff") return editable() && openModal("takeoff");
  if (action === "edit-takeoff") return editable() && openModal("takeoff", state.takeoffs.find(r => r.id === button.dataset.id));
  if (action === "modal-comparison") return openModal("comparison");
  if (action === "modal-contracting") return openModal("contracting");
  if (action === "add-component" || action === "remove-component") {
    const form = document.querySelector("#dialog-form");
    if (form && state.modal?.kind === "analysis") {
      state.modal.record = {
        ...(state.modal.record || {}),
        code: form.querySelector('[name="code"]')?.value || "",
        description: form.querySelector('[name="description"]')?.value || "",
        unit: form.querySelector('[name="unit"]')?.value || "m²"
      };
    }
    if (form) state.acuComponents = [...form.querySelectorAll(".component-row")].map(row => ({
      resourceId: row.querySelector('select[name="resource"]')?.value,
      quantity: row.querySelector('input[name="quantity"]')?.value,
      unitPrice: row.querySelector('input[name="unitPrice"]')?.value
    }));
    if (action === "add-component") state.acuComponents.push({ resourceId: state.resources[0]?.id, quantity: 1, unitPrice: state.resources[0]?.price ?? 0 });
    else state.acuComponents.splice(Number(button.dataset.index), 1);
    render(); return;
  }
  if (action === "delete-line") {
    const line = currentLine();
    if (!editable() || !line || !window.confirm(`¿Eliminar la partida "${line.description}"?`)) return;
    await invoke("delete_estimate_line", { estimateId: state.estimateId, lineId: line.id });
    state.selectedLineId = null; await loadEstimate(); return;
  }
  if (action === "delete-takeoff") {
    if (!editable() || !window.confirm("¿Eliminar esta medición?")) return;
    await invoke("delete_takeoff", { id: button.dataset.id }); await loadPanel(); render(); return;
  }
  if (action === "apply-takeoffs") {
    if (!editable()) return;
    await invoke("apply_takeoff", { estimateId: state.estimateId, lineId: state.selectedLineId });
    await loadEstimate(); return;
  }
  if (action === "duplicate-estimate") {
    const est = currentEstimate();
    if (!est) return;
    const title = window.prompt("Nombre de la nueva versión", est.title + " · Revisión");
    if (!title?.trim()) return;
    const copy = await invoke("duplicate_estimate", { estimateId: est.id, title: title.trim() });
    await loadEstimates(); await openEstimate(copy.id); return;
  }
  if (action === "issue") {
    if (!editable() || !state.lines.length) return;
    if (!window.confirm("¿Emitir el presupuesto? Después no podrás modificar sus partidas, rubros, porcentajes ni mediciones.")) return;
    await invoke("issue_estimate", { estimateId: state.estimateId });
    await loadEstimates(); await loadEstimate();
  }
}

document.addEventListener("click", async evt => {
  const button = evt.target.closest("[data-action]");
  if (!button || button.disabled) return;
  if (button.dataset.action === "close-modal" && button.classList.contains("modal-overlay") && button !== evt.target) return;
  try { await act(button); }
  catch (error) { state.message = "Error: " + String(error); render(); }
});
document.addEventListener("submit", async evt => {
  if (evt.target.id !== "dialog-form") return;
  evt.preventDefault();
  if (state.busy) return;
  const form = evt.target;
  const submit = form.querySelector('[type="submit"]');
  state.busy = true;
  if (submit) submit.disabled = true;
  try { await handleSubmit(form); }
  catch (error) {
    const feedback = document.querySelector(".modal-error");
    if (feedback) feedback.textContent = String(error);
    else { state.message = String(error); render(); }
  } finally { state.busy = false; if (submit?.isConnected) submit.disabled = false; }
});
document.addEventListener("change", async evt => {
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
document.addEventListener("keydown", evt => {
  if (evt.key === "Escape" && state.modal) closeModal();
  if ((evt.key === "Enter" || evt.key === " ") && evt.target.matches("tr[data-action]")) {
    evt.preventDefault(); evt.target.click();
  }
});

(async () => {
  try { await loadCollections(); render(); }
  catch (error) {
    root.innerHTML = `<div class="startup-error"><h2>No se pudo abrir la base de datos local</h2><p>${e(error)}</p><button onclick="location.reload()">Reintentar</button></div>`;
  }
})();
