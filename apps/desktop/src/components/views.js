import { helpBox } from "./help.js";
import { money, numeric, sumDecimals, absoluteDecimal } from "../decimal.js";
import { e, dateToday, kindName, kindBadge, field, select, btn } from "./helpers.js";

export function createViews({ state, currentProject, currentEstimate, currentLine, editable, projectName, clientName, locked, modalMarkup }) {
function chrome(content) {
  const work = state.view === "workspace";
  const active = state.modal?.kind==="backups" ? "backups" : ["workspace","budget-tools"].includes(state.view)?"projects":state.view;
  return `<div class="app">
    <header class="app-header">
      <div class="brand"><span class="brand-mark">▦</span><b>CPOBRAS</b><small>estudio de costos</small></div>
      <div class="context-title">${work ? `<span>${e(currentProject()?.name)}</span><i class="breadcrumb-arrow">›</i><b>${e(currentEstimate()?.title || "Sin presupuesto")}</b>` : `<b>${({ management: "Organización y obras", planning: "Planificación", costing: "Costos y precios", "budget-tools": "Herramientas de presupuesto", projects: "Obras y presupuestos", clients: "Directorio de clientes", resources: "Catálogo de insumos", analyses: "Biblioteca de ACU" })[state.view]}</b>`}</div>
      <div class="header-right">${work && currentEstimate() ? `<span class="status-pill ${currentEstimate().issued ? "issued" : ""}">${currentEstimate().issued ? "● Emitido" : "● En elaboración"}</span>
        <span class="total-head"><small>TOTAL</small> ${e(currentEstimate()?.currency)} <strong>${money(state.totals?.total)}</strong></span>` : `<span class="connection">● SQLite local</span>`}</div>
    </header>
    <nav class="menu-bar" aria-label="Navegación principal">
      ${[["projects", "Obras"], ["clients", "Clientes"], ["resources", "Insumos"], ["analyses", "ACU"]].map(([view, label]) =>
        `<button class="menu-item ${active === view ? "active" : ""}" aria-current="${active===view ? "page" : "false"}" data-action="navigate" data-view="${view}">${label}</button>`).join("")}
      ${work ? `<span class="divider"></span><span class="menu-location">${e(currentProject()?.name)}</span>` : ""}
      <button class="menu-item ${active==="costing"?"active":""}" aria-current="${active==="costing"?"page":"false"}" data-action="open-costing">Costos y precios</button><button class="menu-item ${active==="planning"?"active":""}" aria-current="${active==="planning"?"page":"false"}" data-action="open-planning">Planificación</button><button class="menu-item ${active==="management"?"active":""}" aria-current="${active==="management"?"page":"false"}" data-action="open-management">Organización</button><button class="menu-item ${active==="backups"?"active":""}" aria-current="${active==="backups"?"page":"false"}" data-action="backups">Copias de seguridad</button><span class="grow"></span><span class="kbd-hint">ESC cierra ventanas</span>
    </nav>
    <datalist id="unit-library">${state.units.map(unit=>`<option value="${e(unit.attributes.symbol || unit.code || unit.name)}">${e(unit.name)}</option>`).join("")}</datalist>
    ${helpBox(state.modal?.kind==="backups"?"backups":state.view)}
    ${content}
    ${state.message ? `<div class="toast" role="status">${e(state.message)} <button data-action="dismiss-toast" aria-label="Cerrar">×</button></div>` : ""}
    ${state.modal ? modalMarkup() : ""}
    ${contextMenu()}
  </div>`;
}

function contextMenu(){const menu=state.contextMenu;if(!menu)return "";return `<div class="app-context-menu" role="menu" aria-label="Acciones de CPOBRAS" style="left:${menu.x}px;top:${menu.y}px">${menu.items.map(item=>`<button role="menuitem" data-action="${e(item.action)}" ${item.id?`data-id="${e(item.id)}"`:""} ${item.view?`data-view="${e(item.view)}"`:""} ${item.disabled?"disabled":""}>${e(item.label)}</button>`).join("")}</div>`;}
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
  const lineRow = (line, code = "") => `<tr class="line-row ${line.id === state.selectedLineId ? "selected" : ""}" data-drop-line="true" data-action="select-line" data-id="${e(line.id)}" data-searchable="${e((line.description + " " + line.unit).toLowerCase())}" tabindex="0">
    <td class="col-code muted"><button type="button" class="line-drag-handle" draggable="${editable()}" aria-label="Arrastrar partida ${e(line.description)}" title="Arrastrar para mover" ${locked()}>⋮⋮</button>${e(code)}</td><td class="col-desc">${e(line.description)} ${line.analysis_id ? '<span class="acu-tag">ACU</span>' : ""}</td>
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
    return sumDecimals(state.lines.filter(line => visited.has(state.assignments[line.id])).map(line => line.total));
  };
  const sectionRow = (section, depth = 0) => {
    const children = [...(byParent.get(section.id) || [])].sort((a, b) => a.position - b.position);
    const own = (groups.get(section.id) || []).map((line, i) => lineRow(line, section.code + "." + String(i + 1).padStart(2, "0"))).join("");
    return `<tr class="section-row ${state.selectedSectionId===section.id?"selected":""}" data-drop-section="true" data-action="select-section" data-id="${e(section.id)}" data-searchable="${e((section.code + " " + section.title).toLowerCase())}">
      <td class="col-code">${e(section.code)}</td><td class="col-desc" style="padding-left:${12 + depth * 15}px">▾ &nbsp; ${e(section.title)}</td>
      <td></td><td></td><td></td><td class="number partial">${money(sectionSum(section.id))}</td>
    </tr>${own}${children.map(s => sectionRow(s, depth + 1)).join("")}`;
  };
  const roots = [...(byParent.get("root") || [])].sort((a, b) => a.position - b.position);
  const others = (groups.get("unassigned") || []).map((line, i) => lineRow(line, String(i + 1).padStart(2, "0"))).join("");
  return roots.map(s => sectionRow(s)).join("") +
    `<tr class="section-row unassigned" data-drop-unassigned="true"><td>—</td><td>PARTIDAS SIN RUBRO · soltá aquí para desagrupar</td><td></td><td></td><td></td><td></td></tr>${others}`;
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
      <button class="btn" data-action="open-budget-tools" ${est ? "" : "disabled"}>Herramientas / exportar</button><button class="btn dark" data-action="issue" ${locked()}>Emitir</button>
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
        <div class="detail-tabs" role="tablist" aria-label="Detalle de la partida">
          ${[["acu", "ACU"], ["takeoffs", "Metrados"], ["resources", "Insumos"], ["summary", "Resumen"]].map(([key, title]) => `<button role="tab" aria-selected="${state.panel===key}" data-action="panel" data-panel="${key}" class="tab ${state.panel === key ? "active" : ""}">${title}</button>`).join("")}
        </div>
        <div class="detail-content">${helpBox(state.panel,true)}${rightPanel()}</div>
      </section>
    </div>
  </section>`);
}

function rightPanel() {
  const line = currentLine();
  if (state.panel === "summary") return summaryPane();
  if (state.panel === "resources") return `<div class="detail-heading"><b>INSUMOS</b><span>${line?e(line.description):"Seleccioná una partida para asignar"}</span><button class="btn tiny primary" data-action="edit-line-resources" ${locked()} ${!line?"disabled":""}>Editar insumos</button></div>
    <div class="mini-scroll"><table class="mini-table"><thead><tr><th>TIPO</th><th>DESCRIPCIÓN</th><th>UND.</th><th class="number">PRECIO ARS</th><th>ASIGNAR</th></tr></thead><tbody>
    ${state.resources.map(r => `<tr><td><span class="kind kind-${e(r.kind)}">${kindBadge(r.kind)}</span></td><td>${e(r.description)}</td><td>${e(r.unit)}</td><td class="number">${r.price === null ? "—" : money(r.price)}</td><td><button class="btn tiny" data-action="assign-resource" data-id="${e(r.id)}" ${locked()} ${!line||r.active===false?"disabled":""}>Asignar</button></td></tr>`).join("")}
    </tbody></table></div><div class="detail-footer">${btn("Abrir catálogo", "goto-resources", "primary")}</div>`;
  if (!line) return `<div class="blank-state"><span>▧</span><strong>Seleccioná una partida</strong><p>Su análisis de costos y mediciones aparecerán acá.</p></div>`;
  if (state.panel === "takeoffs") return takeoffPane(line);
  return acuPane(line);
}
function acuPane(line) {
  const d = state.detail;
  const subtitle = d ? `<span class="label-muted">${e(d.is_line_owned?"Insumos de esta partida":d.code)} · ${e(d.unit)}</span>` : "";
  const rows = d?.components || [];
  const byKinds = ["material", "labor", "equipment", "subcontract"].map(type => {
    const group = rows.filter(row => row.kind === type);
    if (!group.length) return "";
    return `<tr class="group-row"><td colspan="5">${kindName(type).toUpperCase()}</td></tr>
      ${group.map(row => `<tr><td><span class="kind kind-${type}">${kindBadge(type)}</span></td><td>${e(row.description)}</td><td class="number">${numeric(row.quantity)}</td><td class="number">${money(row.unit_price)}</td><td class="number">${money(row.total)}</td></tr>`).join("")}`;
  }).join("");
  return `<div class="detail-heading"><div><strong>${e(line.description)}</strong>${subtitle}</div>
    <div class="heading-actions"><button class="btn tiny" data-action="modal-from-acu" ${locked()}>＋ Partida ACU</button><button class="btn tiny primary" data-action="edit-line-resources" ${locked()}>Editar insumos</button><button class="btn tiny" data-action="edit-analysis" data-id="${e(line.analysis_id)}" ${!line.analysis_id||d?.is_line_owned ? "disabled" : ""}>Editar ACU</button><button class="btn tiny" data-action="modal-contracting" ${!line.analysis_id ? "disabled" : ""}>Comparar costos</button></div>
  </div>
  ${d ? `<div class="mini-scroll"><table class="mini-table"><thead><tr><th>TIPO</th><th>DESCRIPCIÓN</th><th class="number">CANT.</th><th class="number">PRECIO</th><th class="number">PARCIAL</th></tr></thead><tbody>${byKinds}</tbody></table></div>` :
    `<div class="blank-state"><span>▤</span><strong>Partida con precio manual</strong><p>Abrí Insumos para asignar recursos a esta partida, o usá Editar insumos para construir su precio.</p></div>`}
  <div class="context-summary"><div><small>Precio unitario guardado</small><b>${money(line.unit_cost)}</b></div><div><small>${d?.is_line_owned?"Precio calculado por insumos":"Precio actual del ACU"}</small><b>${d ? money(d.unit_cost) : "—"}</b></div></div>
  <div class="detail-footer muted-note">El presupuesto conserva el precio unitario original aunque se actualicen los insumos.</div>`;
}
function takeoffPane(line) {
  const qty = sumDecimals(state.takeoffs.map(row => row.quantity));
  return `<div class="detail-heading"><div><strong>METRADOS · ${e(line.description)}</strong><span class="label-muted">Factor × Largo × Ancho × Alto</span></div>
    <button class="btn tiny primary" data-action="modal-takeoff" ${locked()}>＋ Medición</button>
  </div><div class="mini-scroll"><table class="mini-table takeoff-table"><thead><tr><th>DESCRIPCIÓN</th><th class="number">F</th><th class="number">L</th><th class="number">A</th><th class="number">H</th><th class="number">CANT.</th><th></th></tr></thead><tbody>
  ${state.takeoffs.map(row => `<tr><td><button class="link" data-action="edit-takeoff" data-id="${e(row.id)}">${e(row.note || "Medición")}</button></td><td class="number">${numeric(row.factor)}</td><td class="number">${numeric(row.length)}</td><td class="number">${numeric(row.width)}</td><td class="number">${numeric(row.height)}</td><td class="number ${row.sign < 0 ? "negative" : ""}">${row.sign < 0 ? "−" : "+"}${numeric(absoluteDecimal(row.quantity))}</td><td><button class="tiny-danger" data-action="delete-takeoff" data-id="${e(row.id)}" ${locked()}>×</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty-cell">Todavía no hay mediciones.</td></tr>`}
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
        ["Gastos financieros", t.financial_expenses, r.financial_expenses_percent],
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

return { workspace, listViews, chrome, rightPanel };
}
