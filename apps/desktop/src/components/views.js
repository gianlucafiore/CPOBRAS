import { uiText, uiHtml, currentInterfaceLanguage } from "../services/interface-language.js";
import { interfaceText } from "../services/interface-language.js";
import {priceCostFactor,priceRowRate,priceRowLabel} from "../services/price-summary.js";
import { budgetNumbering } from "../services/budget-numbering.js";
import { entityActions } from "./entity-actions.js";
const appLogo = new URL("../../src-tauri/icons/icon.png", import.meta.url).href;
import { helpBox } from "./help.js";
import { money, numeric, sumDecimals, absoluteDecimal, compareDecimals } from "../decimal.js";
import {
  e,
  dateToday,
  kindName,
  kindBadge,
  field,
  select,
  btn,
} from "./helpers.js";

export function createViews({
  state,
  currentProject,
  currentEstimate,
  currentLine,
  editable,
  projectName,
  clientName,
  locked,
  modalMarkup,
  costingMarkup = () => "",
  remindersMarkup = () => "",
  homeCashMarkup = () => "",
  directCostsMarkup = () => "",
  memoryMarkup = () => "",
}) {
  function chrome(content) {
    const t = message => e(interfaceText(state.language, message));
    const work = Boolean(state.projectId);
    const sectionName = {workspace:"Presupuesto", planning:"Planificación", management:"Datos de la obra",
      operations:"Gestión de obra", "budget-tools":"Herramientas / exportar", "budget-printing":"Imprimir presupuesto",
      "price-determination":"Determinación de precio"}[state.view];
    const budget =
      work && Boolean(state.estimateId) && state.view !== "management";
    const active =
      state.modal?.kind === "backups"
        ? "backups"
        : [
              "workspace",
              "budget-tools",
              "budget-printing",
              "price-determination",
            ].includes(state.view)
          ? "projects"
          : state.view;
    return `<div class="app">
    <header class="app-header">
      <div class="brand"><img class="brand-mark" src="${appLogo}" alt="${uiHtml("Yacaré de CPOBRAS")}"><b>CPOBRAS</b><small>${t("estudio de costos")}</small></div>
      <nav class="history-nav" aria-label="${t("Historial de vistas")}"><button class="btn tiny" data-action="history-back" title="${t("Atrás")}" aria-label="${t("Atrás")}" ${state.canGoBack ? "" : "disabled"}>←</button><button class="btn tiny" data-action="history-forward" title="${t("Adelante")}" aria-label="${t("Adelante")}" ${state.canGoForward ? "" : "disabled"}>→</button></nav>
      <div class="context-title">${
        work
          ? `<span>${t("Inicio / Obras")}</span><i class="breadcrumb-arrow">›</i><span>${e(currentProject()?.name)}</span>${budget ? `<i class="breadcrumb-arrow">›</i><span>${e(currentEstimate()?.title)}</span>` : ""}${sectionName ? `<i class="breadcrumb-arrow">›</i><b>${t(sectionName)}</b>` : ""}`
          : `<b>${t({
                "price-determination": "Determinación de precio",
                operations: "Gestión de obra",
                portfolio: "Cartera de obras",
                management: "Organización y obras",
                planning: "Planificación",
                costing: "Costos y precios",
                "budget-tools": "Herramientas de presupuesto",
                organizations: "Organizaciones",
                sharing: "Vinculación P2P",
                "budget-printing": "Imprimir presupuesto",
                projects: "Obras y presupuestos",
                "app-options": "Opciones",
                "system-settings": "Datos generales",
                clients: "Directorio de clientes",
                suppliers: "Directorio de proveedores",
                resources: "Catálogo de insumos",
                analyses: "Biblioteca de ACU",
              }[state.view] || "")}</b>`
      }</div>
      <div class="header-right">
      ${!work && ["projects","app-options"].includes(state.view) ? `<button class="btn" data-action="app-options-open">${t("Opciones")}</button>` : ""}
      ${
        work && currentEstimate()
          ? `${state.remoteProject ? `<span class="status-pill">${t(currentEstimate().issued ? "● Emitido" : "● En elaboración")} · ${t("Solo lectura")}</span>` : `<select class="status-pill ${currentEstimate().issued ? "issued" : ""}" name="estimate-status" aria-label="${t("Estado del presupuesto")}"><option value="draft" ${!currentEstimate().issued ? "selected" : ""}>${t("● En elaboración")}</option><option value="issued" ${currentEstimate().issued ? "selected" : ""}>${t("● Emitido")}</option></select>`}
        <span class="total-head"><small>${state.view === "price-determination" && state.pricePreview?.dirty ? "VISTA PREVIA" : "TOTAL"}</small> ${e(currentEstimate()?.currency)} <strong>${state.view === "price-determination" && state.pricePreview ? (state.pricePreview.total == null ? "—" : money(state.pricePreview.total)) : state.totals?.pricing_error ? "—" : money(state.totals?.total)}</strong></span>`
          : `<span class="connection">${t(state.remoteProject ? "Solo lectura · Obra externa" : "● SQLite local")}</span>`
      }</div>
    </header>
    <nav class="menu-bar" aria-label="${uiHtml("Navegación principal")}">
      ${
        work
          ? `<button class="menu-item" data-action="go-home">${t("← Inicio")}</button>${[
              [
                "open-management",
                budget ? "← Volver al proyecto" : "Proyecto",
                "management",
              ],
              ["open-workspace", "Presupuesto", "workspace"],
              [
                "open-price-determination",
                "Determinación de precio",
                "price-determination",
              ],
              ["open-planning", "Planificación", "planning"],
              ["open-operations", "Gestión de obra", "operations"],
            ]
              .filter(([, , view]) => budget || view === "management")
              .map(
                ([action, label, view]) =>
                  `<button class="menu-item ${state.view === view || (view === "workspace" && ["budget-tools", "budget-printing"].includes(state.view)) ? "active" : ""}" aria-current="${state.view === view || (view === "workspace" && ["budget-tools", "budget-printing"].includes(state.view)) ? "page" : "false"}" data-action="${action}" ${view === "price-determination" && !currentEstimate() ? "disabled" : ""}>${t(label)}</button>`,
              )
              .join("")}`
          : `<button class="menu-item ${state.view === "projects" ? "active" : ""}" aria-current="${state.view === "projects" ? "page" : "false"}" data-action="navigate" data-view="projects">${t("Inicio / Obras")}</button>${[
              ["clients", "Clientes"],
              ["suppliers", "Proveedores"],
              ["resources", "Insumos"],
              ["analyses", "ACU"],
            ]
              .map(
                ([view, label]) =>
                  `<button class="menu-item ${active === view ? "active" : ""}" aria-current="${active === view ? "page" : "false"}" data-action="navigate" data-view="${view}">${t(label)}</button>`,
              )
              .join(
                "",
              )}<button class="menu-item ${active === "portfolio" ? "active" : ""}" aria-current="${active === "portfolio" ? "page" : "false"}" data-action="open-portfolio">${t("Cartera de obras")}</button><button class="menu-item ${active === "organizations" ? "active" : ""}" aria-current="${active === "organizations" ? "page" : "false"}" data-action="open-organizations">${t("Organizaciones")}</button><button class="menu-item ${active === "sharing" ? "active" : ""}" aria-current="${active === "sharing" ? "page" : "false"}" data-action="open-sharing">${t("Vinculación P2P")}</button><button class="menu-item ${active === "system-settings" ? "active" : ""}" aria-current="${active === "system-settings" ? "page" : "false"}" data-action="open-system-settings">${t("Datos generales")}</button><button class="menu-item ${active === "backups" ? "active" : ""}" aria-current="${active === "backups" ? "page" : "false"}" data-action="backups">${t("Copias de seguridad")}</button>`
      }<span class="grow"></span><span class="kbd-hint">${t("ESC cierra ventanas")}</span>
    </nav>

    ${state.remoteProject ? `<div class="remote-context" role="status"><strong>${uiHtml("Obra externa de solo lectura")}</strong> · ${e(currentProject()?.organization_name)} ${uiHtml("· Copia recibida")} ${e(new Date(state.remoteProject.received_at * 1000).toLocaleString(currentInterfaceLanguage()))}${state.remoteProject.revoked ? uiHtml(" · Acceso revocado") : state.remoteProject.error ? uiHtml(" · Sin actualizar") : ""}${uiHtml(". Las modificaciones corresponden al propietario.")}</div>` : ""}
    <datalist id="unit-library">${state.units.map((unit) => `<option value="${e(unit.attributes.symbol || unit.code || unit.name)}">${e(unit.name)}</option>`).join("")}</datalist>
    ${helpBox(state.modal?.kind === "backups" ? "backups" : state.view === "management" && state.projectId ? "project-data" : state.view)}
    ${state.databaseError?`<div class="startup-error database-error" role="alert"><strong>${uiHtml("No se pudo cambiar la base de datos")}</strong><p>${e(state.databaseError)}</p></div>`:""}
    ${content}
    ${state.message ? `<div class="toast" role="status">${state.message.path
      ? `${e(state.message.text)} <a href="#" class="toast-export-link" data-action="open-recent-export" data-path="${e(state.message.path)}">${e(state.message.path)}</a>`
      : e(state.message)} <button data-action="dismiss-toast" aria-label="${uiHtml("Cerrar")}">×</button></div>` : ""}
    ${state.modal ? modalMarkup() : ""}
    ${contextMenu()}
  </div>`;
  }

  function contextMenu() {
    const menu = state.contextMenu;
    if (!menu) return "";
    return `<div class="app-context-menu" role="menu" aria-label="${uiHtml("Acciones de CPOBRAS")}" style="left:${menu.x}px;top:${menu.y}px">${menu.items.map((item) => `<button role="menuitem" data-action="${e(item.action)}" ${item.id ? `data-id="${e(item.id)}"` : ""} ${item.view ? `data-view="${e(item.view)}"` : ""} ${item.disabled ? "disabled" : ""}>${uiHtml(item.label)}</button>`).join("")}</div>`;
  }
  function gridSections() {
    const groups = new Map();
    for (const line of state.lines) {
      const id = state.assignments[line.id] || "unassigned";
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(line);
    }
    const byParent = new Map();
    const ids = new Set(state.sections.map((s) => s.id));
    for (const section of state.sections) {
      const parent =
        section.parent_id && ids.has(section.parent_id)
          ? section.parent_id
          : "root";
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(section);
    }
    const numbering = budgetNumbering(state.sections,state.lines,state.assignments);
    const lineRow = (
      line,
      code = "",
      depth = 0,
    ) => `<tr class="line-row ${line.id === state.selectedLineId ? "selected" : ""}" data-drop-line="true" data-action="select-line" data-id="${e(line.id)}" data-searchable="${e((line.description + " " + line.unit).toLowerCase())}" style="--budget-depth:${depth}" tabindex="0">
    <td class="muted"><div class="budget-line-order"><button type="button" class="line-drag-handle" draggable="${editable()}" aria-label="${uiHtml("Arrastrar partida {0}", [line.description])}" title="${uiHtml("Arrastrar para mover")}" ${locked()}>⋮⋮</button><span class="budget-order-code" title="${e(code)}">${e(code)}</span></div></td>
    <td class="col-desc">${line.has_excluded_components ? ("<span class=\"acu-exclusion-warning\" role=\"img\" aria-label=\"" + uiHtml("Hay insumos sin sumar") + "\" title=\"" + uiHtml("Esta partida tiene insumos que no se cobran en el presupuesto. Revisá su ACU.") + "\">!</span>") : ""}${e(line.description)} ${line.analysis_id ? '<span class="acu-tag">ACU</span>' : ""} ${(state.measuredLineIds || []).includes(line.id) ? ("<span class=\"metrado-tag\" title=\"" + uiHtml("Cantidad calculada y aplicada desde un metrado") + "\">" + uiHtml("Metrado") + "</span>") : ""}</td>
    <td class="col-unit">${e(line.unit)}</td><td class="number">${numeric(line.quantity)}</td>
    <td class="number">${money(line.unit_cost)}</td><td class="number partial">${money(line.total)}</td></tr>`;
    const sectionSum = (id) => {
      const sections = [id],
        visited = new Set();
      while (sections.length) {
        const next = sections.pop();
        if (visited.has(next)) continue;
        visited.add(next);
        for (const child of byParent.get(next) || []) sections.push(child.id);
      }
      return sumDecimals(
        state.lines
          .filter((line) => visited.has(state.assignments[line.id]))
          .map((line) => line.total),
      );
    };
    const sectionRow = (section, depth = 0) => {
      const children = [...(byParent.get(section.id) || [])].sort(
        (a, b) => a.position - b.position,
      );
      const own = (groups.get(section.id) || [])
        .map((line) => lineRow(line, numbering.lines.get(line.id), depth))
        .join("");
      return `<tr class="section-row ${state.selectedSectionId === section.id ? "selected" : ""}" data-drop-section="true" data-action="select-section" data-id="${e(section.id)}" data-searchable="${e((section.code + " " + section.title).toLowerCase())}" style="--budget-depth:${depth}">
      <td colspan="2"><div class="budget-section-label">
        <button type="button" class="section-drag-handle" draggable="${editable()}" aria-label="${uiHtml("Arrastrar rubro {0}", [section.title])}" title="${uiHtml("Arrastrar rubro · Alt + ↑ / ↓ para reordenar")}" ${locked()}>⋮⋮</button>
        <span class="budget-order-code">${e(numbering.sections.get(section.id))}</span><span aria-hidden="true">▾</span>
        <span class="budget-section-title">${e(section.title)}</span>
      </div></td>
      <td></td><td></td><td></td><td class="number partial">${money(sectionSum(section.id))}</td>
    </tr>${own}${children.map((s) => sectionRow(s, depth + 1)).join("")}`;
    };
    const roots = [...(byParent.get("root") || [])].sort(
      (a, b) => a.position - b.position,
    );
    const others = (groups.get("unassigned") || [])
      .map((line) => lineRow(line, numbering.lines.get(line.id)))
      .join("");
    return (
      roots.map((s) => sectionRow(s)).join("") +
      `<tr class="section-row unassigned" data-drop-unassigned="true"><td>—</td><td>${uiHtml("PARTIDAS SIN RUBRO · soltá aquí para desagrupar")}</td><td></td><td></td><td></td><td></td></tr>${others}`
    );
  }

  function workspace() {
    const est = currentEstimate();
    return chrome(`<section class="workspace">
    <div class="work-toolbar">
      <button class="btn orange" data-action="modal-line" ${locked()}>${uiHtml("＋ Partida")}</button>
      <button class="btn dark" data-action="modal-section" ${locked()}>${uiHtml("＋ Rubro")}</button>
      <button class="btn" data-action="modal-from-acu" ${locked()}>${uiHtml("＋ Desde ACU")}</button>
      ${state.aiActionsEnabled && editable() && est ? `<button class="btn ai-button" data-action="form-ai-open" data-kind="items">${uiHtml("Proponer partidas con IA")}</button>` : ""}
      <button class="btn" data-action="open-patterns" ${est ? "" : "disabled"}>${uiHtml("Patrones de cómputo")}</button>
      <span class="vline"></span>
      <span class="grow"></span>
      <button class="btn" data-action="open-budget-printing" ${est ? "" : "disabled"}>${uiHtml("Imprimir presupuesto")}</button><button class="btn" data-action="open-budget-tools" ${est ? "" : "disabled"}>${uiHtml("Herramientas / exportar")}</button><button class="btn dark" data-action="${est?.issued ? "reopen-estimate" : "issue"}" ${!est || state.remoteProject ? "disabled" : ""}>${est?.issued ? uiHtml("Volver a En elaboración") : uiHtml("Emitir")}</button>
    </div>
    <div class="workspace-columns">
      <section class="grid-pane">
        <div class="pane-toolbar">
          <span class="pane-title">${uiHtml("PRESUPUESTO")} <em>${state.lines.length} ${uiHtml("partidas ·")} ${state.sections.length} ${uiHtml("rubros")}</em></span>
          <span class="grow"></span>
          <input class="search-compact" placeholder="${uiHtml("⌕ Buscar partida...")}" data-search value="${e(state.search)}" aria-label="${uiHtml("Buscar partida")}">
          <button class="icon-btn" data-action="edit-line" title="${uiHtml("Editar partida seleccionada")}" ${locked()}>✎</button>
          <button class="icon-btn" data-action="delete-line" aria-label="${uiHtml("Eliminar partida")}" title="${uiHtml("Eliminar partida")}" ${locked()}>🗑</button>
        </div>
        <div class="table-scroll">
          <table class="budget-grid"><colgroup><col class="budget-code-column"><col><col style="width:9%"><col style="width:12%"><col style="width:13%"><col style="width:14%"></colgroup>
          <thead><tr><th>${uiHtml("ÍTEM")}</th><th>${uiHtml("DESCRIPCIÓN")}</th><th>${uiHtml("UND.")}</th><th class="number">${uiHtml("CANTIDAD")}</th><th class="number">${uiHtml("P. UNITARIO")}</th><th class="number">${uiHtml("PARCIAL")}</th></tr></thead>
          <tbody>${est ? (state.lines.length || state.sections.length ? gridSections() : `<tr class="empty-row"><td colspan="6">${uiHtml("Presupuesto vacío. Agregá una partida o creá un rubro para empezar.")}</td></tr>`) : `<tr class="empty-row"><td colspan="6">${uiHtml("Creá un presupuesto para comenzar a trabajar.")}</td></tr>`}</tbody>
          </table>
        </div>
        <div class="grid-bottom"><span>${est?.title ? e(est.title) : uiHtml("Sin presupuesto")}</span><span>${uiHtml("DIRECTO")} <strong>${e(est?.currency || "")} ${money(state.totals?.direct)}</strong></span></div>
      </section>
      <section class="detail-pane">
        <div class="detail-tab-groups">
        ${[['Partida seleccionada',[['acu','ACU'],['takeoffs','Metrados']]],['Presupuesto',[['memory','Memoria descriptiva'],['resources','Insumos'],['direct-costs','Gastos Directos'],['summary','Resumen']]]].map(([label,tabs])=>`<div class="detail-tabs" role="tablist" aria-label="${uiHtml(label)}"><span class="detail-tab-scope">${uiHtml(label)}</span>${tabs.map(([key,title])=>`<button role="tab" aria-selected="${state.panel===key}" data-action="panel" data-panel="${key}" class="tab ${state.panel===key?'active':''}">${uiHtml(title)}</button>`).join('')}</div>`).join('')}
        </div>
        <div class="detail-content">${helpBox(state.panel, true)}${rightPanel()}</div>
      </section>
    </div>
  </section>`);
  }

  function rightPanel() {
    const line = currentLine();
    if (state.panel === "memory") return memoryMarkup();
    if (state.panel === "direct-costs") return directCostsMarkup();
    if (state.panel === "summary") return summaryPane();
    if (state.panel === "resources")
      return `<div class="detail-heading"><b>${uiHtml("INSUMOS DEL PRESUPUESTO")}</b><div class="heading-actions"><label><input type="checkbox" data-resources-export-prices> ${uiHtml("Incluir importes en PDF")}</label><button class="btn" data-action="budget-resources-xlsx">${uiHtml("Descargar Excel")}</button><button class="btn" data-action="budget-resources-pdf">${uiHtml("Descargar PDF")}</button></div></div>
    <div class="mini-scroll"><table class="mini-table"><thead><tr><th>${uiHtml("TIPO")}</th><th>${uiHtml("DESCRIPCIÓN")}</th><th>${uiHtml("UND.")}</th><th class="number">${uiHtml("CANT. TOTAL")}</th><th class="number">${uiHtml("PRECIO TOTAL {0}", [currentEstimate()?.currency || "ARS"])}</th></tr></thead><tbody>
    ${(state.estimateResourceTotals||[]).map((r) => `<tr><td><span class="kind kind-${e(r.kind)}">${kindBadge(r.kind)}</span></td><td>${e(r.description)}</td><td>${e(r.unit)}</td><td class="number">${numeric(r.quantity)}</td><td class="number">${r.total==null?'—':money(r.total)}</td></tr>`).join("") || ("<tr><td colspan=\"5\" class=\"empty-cell\">" + uiHtml("Todavía no hay insumos en este presupuesto. Cargalos en el ACU de una partida o en Gastos Directos.") + "</td></tr>")}
    </tbody></table></div><div class="detail-footer"><span>${uiHtml("Totales de los insumos de todas las partidas y de Gastos Directos. Para modificar su composición, abrí el ACU de la partida o Gastos Directos.")}</span></div>`;
    if (!line)
      return `<div class="blank-state"><span>▧</span><strong>${uiHtml("Seleccioná una partida")}</strong><p>${uiHtml("Su análisis de costos y mediciones aparecerán acá.")}</p></div>`;
    if (state.panel === "takeoffs") return takeoffPane(line);
    return acuPane(line);
  }
  function acuPane(line) {
    const d = state.detail;
    const subtitle = d
      ? `<span class="label-muted">${e(d.is_line_owned ? uiText("Insumos de esta partida") : d.code)} · ${e(d.unit)}</span>`
      : "";
    const rows = d?.components || [];
    const byKinds = ["material", "labor", "equipment", "subcontract"]
      .map((type) => {
        const group = rows.filter((row) => row.kind === type);
        if (!group.length) return "";
        return `<tr class="group-row"><td colspan="6">${kindName(type).toUpperCase()}</td><td class="number group-total">${money(sumDecimals(group.map(row=>row.total)))} <button class="btn tiny inclusion-bulb ${group.every(row=>row.included===false)?"is-off":""}" data-action="toggle-line-resource-group" data-kind="${type}" aria-label="${group.every(row=>row.included!==false)?uiHtml("Excluir"):uiHtml("Incluir")} ${uiHtml("grupo")} ${kindName(type)} ${uiHtml("del costo")}" aria-pressed="${group.every(row=>row.included!==false)?"true":group.every(row=>row.included===false)?"false":"mixed"}" title="${uiHtml("Incluir / excluir este grupo del costo")}" ${locked()}>💡</button></td></tr>
      ${group.map((row) => `<tr class="line-resource-row ${row.included===false?"component-excluded":""}" data-component-index="${rows.indexOf(row)}" tabindex="0" aria-label="${uiHtml("Insumo {0}", [row.description])}"><td><span class="kind kind-${type}">${kindBadge(type)}</span></td><td>${e(row.description)}${row.daily_output?`<small class="component-productivity">${uiHtml("Rendimiento: {0} {1}/día hábil", [numeric(row.daily_output), state.resources.find(r=>r.id===row.resource_id)?.unit||row.unit||'unidad'])}</small>`:''}</td><td class="component-unit">${e(state.resources.find(r => r.id === row.resource_id)?.unit || row.unit || "—")}</td><td class="number">${numeric(row.quantity)}</td><td class="number">${row.price_pending ? `<small>${uiHtml("Pendiente de cotizar")}</small>` : money(row.unit_price)}</td><td class="number">${row.price_pending ? "—" : money(row.total)}</td><td class="component-actions"><button class="btn tiny inclusion-bulb ${row.included===false?"is-off":""}" data-action="toggle-line-resource" data-index="${rows.indexOf(row)}" aria-label="${row.included===false?uiHtml("Incluir"):uiHtml("Excluir")} ${e(row.description)} ${uiHtml("del costo")}" aria-pressed="${row.included===false?"false":"true"}" title="${row.included===false?uiHtml("Apagado: sin sumar. Encender para incluir"):uiHtml("Encendido: incluido. Apagar para excluir")}" ${locked()}>💡</button><button class="btn tiny" data-action="edit-line-resource" data-index="${rows.indexOf(row)}" ${locked()}>${uiHtml("Editar")}</button><button class="btn tiny tiny-danger" data-action="remove-line-resource" data-index="${rows.indexOf(row)}" aria-label="${uiHtml("Quitar {0} de la partida", [row.description])}" ${locked()}>×</button></td></tr>`).join("")}`;
      })
      .join("");
    return `<div class="detail-heading"><div><strong>${e(line.description)}</strong>${subtitle}</div>
    <div class="heading-actions"><button class="btn tiny" data-action="save-acu-pattern" ${!line.analysis_id || !d?.components?.length || state.remoteProject ? "disabled" : ""}>${uiHtml("Guardar como patrón de ACU")}</button><button class="btn tiny primary" data-action="edit-line-resources" ${locked()}>${uiHtml("＋ Agregar insumo")}</button><button class="btn tiny" data-action="edit-analysis" data-id="${e(line.analysis_id)}" ${!line.analysis_id || d?.is_line_owned ? "disabled" : ""}>${uiHtml("Editar ACU")}</button><button class="btn tiny" data-action="modal-contracting" ${!line.analysis_id ? "disabled" : ""}>${uiHtml("Comparar costos")}</button></div>
  </div>
  ${
    d
      ? `<div class="mini-scroll"><table class="mini-table"><thead><tr><th>${uiHtml("TIPO")}</th><th>${uiHtml("DESCRIPCIÓN")}</th><th>${uiHtml("UNIDAD")}</th><th class="number">${uiHtml("CANT.")}</th><th class="number">${uiHtml("PRECIO")}</th><th class="number">${uiHtml("PARCIAL")}</th><th>${uiHtml("ACCIÓN")}</th></tr></thead><tbody>${byKinds}</tbody></table></div>`
      : `<div class="blank-state"><span>▤</span><strong>${uiHtml("Partida con precio manual")}</strong><p>${uiHtml("Abrí Insumos para asignar recursos a esta partida, o usá Agregar insumo para construir su precio.")}</p></div>`
  }
  <div class="context-summary"><div><small>${uiHtml("Precio unitario guardado")}</small><b>${money(line.unit_cost)}</b></div><div><small>${d?.is_line_owned ? uiHtml("Precio calculado por insumos") : uiHtml("Precio actual del ACU")}</small><b>${d ? money(d.unit_cost) : "—"}</b></div></div>
  <div class="detail-footer muted-note">${uiHtml("Cada insumo tiene un precio único en este presupuesto. Los apagados no se cobran, pero siguen en el total de insumos para provisión. Las otras versiones conservan sus precios.")}</div>`;
  }
  function takeoffPane(line) {
    const qty = sumDecimals(state.takeoffs.map((row) => row.quantity));
    const hasUnappliedQuantity = state.takeoffs.length > 0 && compareDecimals(qty, line.quantity) !== 0;
    return `<div class="detail-heading"><div><strong>${uiHtml("METRADOS · {0}", [line.description])}</strong><span class="label-muted">${uiHtml("Factor × Largo × Ancho × Alto")}</span></div>
    <div class="heading-actions">${hasUnappliedQuantity ? `<button class="btn tiny" data-action="apply-takeoffs" ${locked()}>${uiHtml("Aplicar cantidad medida")}</button>` : ""}
    <button class="btn tiny primary" data-action="modal-takeoff" ${locked()}>${uiHtml("＋ Medición")}</button></div>
  </div><div class="mini-scroll"><table class="mini-table takeoff-table"><thead><tr><th>${uiHtml("DESCRIPCIÓN")}</th><th class="number">F</th><th class="number" title="${uiHtml("Largo")}">${uiHtml("L")}</th><th class="number" title="${uiHtml("Ancho")}">${uiHtml("A")}</th><th class="number" title="${uiHtml("Alto")}">${uiHtml("H")}</th><th class="number">${uiHtml("CANT.")}</th><th></th></tr></thead><tbody>
  ${state.takeoffs.map((row) => `<tr><td><button class="link" data-action="edit-takeoff" data-id="${e(row.id)}">${e(row.note || "Medición")}</button></td><td class="number">${numeric(row.factor)}</td><td class="number">${numeric(row.length)}</td><td class="number">${numeric(row.width)}</td><td class="number">${numeric(row.height)}</td><td class="number ${row.sign < 0 ? "negative" : ""}">${row.sign < 0 ? "−" : "+"}${numeric(absoluteDecimal(row.quantity))}</td><td><button class="tiny-danger" data-action="delete-takeoff" data-id="${e(row.id)}" ${locked()}>×</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty-cell">${uiHtml("Todavía no hay mediciones.")}</td></tr>`}
  </tbody></table></div><div class="context-summary"><div><small>${uiHtml("Cantidad medida")}</small><b>${numeric(qty)} ${e(line.unit)}</b></div><div><small>${uiHtml("Presupuesto")}</small><b>${numeric(line.quantity)} ${e(line.unit)}</b></div></div>
  <div class="detail-footer muted-note">${uiHtml("Las mediciones negativas descuentan vanos y aberturas.")}</div>`;
  }
  function summaryPane() {
    const t = state.totals || {};
    const definition=state.priceDefinition;
    const rows=t.rows||[];
    return `<div class="detail-heading"><strong>${uiHtml("RESUMEN DEL PRESUPUESTO")}</strong><button class="btn tiny" data-action="open-price-determination">${uiHtml("Determinación de precio")}</button></div>
    <div class="summary-rows">${t.pricing_error?`<p class="price-error">${uiHtml("{0}. Revisá Determinación de precio.", [t.pricing_error])}</p>`:`<div class="summary-row"><span>${uiHtml("Costo directo")}</span><strong>${money(t.direct)}</strong></div>${rows.filter(row=>row.enabled).map(row=>{
      const source=definition?.rows?.find(r=>r.id===row.id),rate=priceRowRate(source);
      return `<div class="summary-row ${row.kind==='subtotal'?'price-subtotal':''}"><span>${e(priceRowLabel(row))}${rate?` <small>${e(rate)}</small>`:''}${row.kind==='subtotal'?`<small class="price-cost-factor">${uiHtml("Factor precio / costo directo:")} <b>${priceCostFactor(row.amount,t.direct)}</b></small>`:''}</span><strong>${money(row.amount)}</strong></div>`;
    }).join('')}`}

    </div><div class="summary-final"><span>${uiHtml("TOTAL PRESUPUESTADO")}</span><strong>${e(currentEstimate()?.currency || "ARS")} ${t.pricing_error ? "—" : money(t.total)}</strong></div>
    <div class="detail-footer muted-note">${uiHtml("Cálculo decimal realizado en Rust. La determinación queda bloqueada al emitir.")}</div>`;
  }

  function listViews() {
    let title,
      subtitle,
      action,
      headers,
      rows,
      inspector = "";
    if (state.view === "projects") {
      title = uiHtml("Obras");
      subtitle = uiHtml("Obras propias y vinculadas. Las externas se consultan en modo de solo lectura.");
      action = btn(uiText("＋ Nueva obra"), "modal-project", "primary");
      headers = [uiHtml("OBRA"), uiHtml("ORGANIZACIÓN"), uiHtml("CLIENTE"), uiHtml("MONEDA"), ""];
      rows = state.projects
        .map(
          (p) =>
            `<tr data-searchable="${e((p.name + " " + (p.organization_name || "") + " " + clientName(p.client_id)).toLowerCase())}"><td><strong>${e(p.name)}</strong></td><td>${e(p.organization_name || "—")}${p.read_only ? (" <span class=\"organization-badge external\">" + uiHtml("Externa · solo lectura") + "</span>") : ""}</td><td>${e(clientName(p.client_id))}</td><td>${e(p.currency === "Usd" ? "USD" : "ARS")}</td><td class="actions-cell"><button class="btn tiny" data-action="edit-project" data-id="${e(p.id)}" ${p.read_only ? "disabled" : ""}>${uiHtml("Editar")}</button><button class="btn tiny primary" data-action="open-project" data-id="${e(p.id)}">${uiHtml("Abrir ›")}</button></td></tr>`,
        )
        .join("");
      rows += (state.externalProjects || [])
        .map(
          (p) =>
            `<tr class="external-project-row" data-searchable="${e([p.name, p.organization_name, p.client_name, p.owner].filter(Boolean).join(" ").toLowerCase())}"><td><strong>${e(p.name)}</strong> <span class="organization-badge external">${uiHtml("Externa · Solo lectura")}</span><small class="project-origin">${p.has_snapshot ? uiHtml("Última copia: {0}", [e(new Date(p.received_at * 1000).toLocaleString(currentInterfaceLanguage()))]) : uiHtml("Pendiente de recibir")}${p.revoked ? uiHtml(" · Acceso revocado") : p.error ? uiHtml(" · Sin actualizar") : ""}</small></td><td>${e(p.organization_name || "Origen pendiente")}<small class="project-origin">${uiHtml("Equipo propietario: {0}…", [p.owner?.slice(0, 12) || "—"])}</small></td><td>${e(p.client_name || "—")}</td><td>${e(p.currency ? String(p.currency).toUpperCase() : "—")}</td><td class="actions-cell"><button class="btn tiny primary" data-action="open-external-project" data-id="${e(p.id)}" ${p.has_snapshot ? "" : "disabled"}>${uiHtml("Abrir ›")}</button></td></tr>`,
        )
        .join("");
    } else if (state.view === "clients") {
      title = uiHtml("Clientes");
      subtitle = uiHtml("Comitentes registrados en la base local.");
      action = btn(uiText("＋ Nuevo cliente"), "modal-client", "primary");
      headers = [uiHtml("CLIENTE"), uiHtml("CUIT"), ""];
      rows = state.clients
        .map(
          (c) =>
            `<tr data-searchable="${e(c.name.toLowerCase())}"><td><strong>${e(c.name)}</strong></td><td>${e(c.cuit || "—")}</td><td></td></tr>`,
        )
        .join("");
    } else if (state.view === "resources") {
      title = uiHtml("Biblioteca de insumos");
      subtitle = uiHtml("Materiales, mano de obra, equipos y subcontratos.");
      action = btn(uiText("Descargar listado"), "resource-import-template") + btn(uiText("Importar Excel"), "resource-import-open") + (state.aiEnabled ? btn(uiText("Preparar insumos con IA"), "ai-resource-open") : "") + btn(uiText("＋ Nuevo insumo"), "modal-resource", "primary");
      headers = [uiHtml("CÓDIGO"), uiHtml("DESCRIPCIÓN"), uiHtml("TIPO"), uiHtml("UND."), uiHtml("PRECIO ARS"), ""];
      rows = state.resources
        .map(
          (r) =>
            `<tr class="${state.selectedResourceId === r.id ? "selected" : ""}" data-action="select-resource" data-id="${e(r.id)}" data-searchable="${e((r.code + " " + r.description + " " + r.kind).toLowerCase())}"><td>${e(r.code)}</td><td><strong>${e(r.description)}</strong></td><td><span class="kind kind-${e(r.kind)}">${kindBadge(r.kind)}</span></td><td>${e(r.unit)}</td><td class="number">${r.price == null ? "—" : money(r.price)}</td><td class="actions-cell"><button class="btn tiny" data-action="edit-resource" data-id="${e(r.id)}">${uiHtml("Editar")}</button><button class="btn tiny" data-action="modal-price" data-id="${e(r.id)}">${uiHtml("＋ Precio")}</button></td></tr>`,
        )
        .join("");
      const selected = state.resources.find(
        (r) => r.id === state.selectedResourceId,
      );
      inspector = `<aside class="list-inspector"><h3>${uiHtml("HISTORIAL DE PRECIOS")}</h3>${
        selected
          ? `<strong>${e(selected.description)}</strong><p class="small-muted">${e(selected.code)} · ${e(selected.unit)}</p>
      <button class="btn tiny" data-action="edit-resource" data-id="${e(selected.id)}">${uiHtml("Editar insumo")}</button> <button class="btn primary tiny" data-action="modal-price" data-id="${e(selected.id)}">${uiHtml("＋ Registrar precio")}</button>
      <div class="price-history">${state.history.map((h) => `<div><span>${e(h.effective_date)}<small>${e(h.source || "Manual")}</small></span><strong>${e(h.currency)} ${money(h.amount)}</strong></div>`).join("") || ("<p class=\"small-muted\">" + uiHtml("Sin registros.") + "</p>")}</div>`
          : ("<p class=\"small-muted\">" + uiHtml("Seleccioná un insumo para consultar sus precios.") + "</p>")
      }</aside>`;
    } else {
      title = uiHtml("Análisis de costos unitarios");
      subtitle = uiHtml("Costos compuestos a partir de insumos y rendimientos.");
      action = btn(uiText("＋ Nuevo ACU"), "modal-analysis", "primary");
      headers = [uiHtml("CÓDIGO"), uiHtml("DESCRIPCIÓN"), uiHtml("UND."), uiHtml("PRECIO UNITARIO"), ""];
      rows = state.analyses
        .map(
          (a) =>
            `<tr class="${state.selectedAnalysisId === a.id ? "selected" : ""}" data-action="select-analysis" data-id="${e(a.id)}" data-searchable="${e((a.code + " " + a.description).toLowerCase())}"><td>${e(a.code)}</td><td><strong>${e(a.description)}</strong></td><td>${e(a.unit)}</td><td class="number">${money(a.unit_cost)}</td><td>${entityActions("analysis",a.id,a.description)}</td></tr>`,
        )
        .join("");
      inspector = `<aside class="list-inspector"><h3>${uiHtml("COMPOSICIÓN DEL ACU")}</h3>${
        state.detail && state.selectedAnalysisId
          ? `<strong>${e(state.detail.description)}</strong><p class="small-muted">${uiHtml("Costo unitario ARS {0}", [money(state.detail.unit_cost)])}</p>
      <button class="btn primary tiny" data-action="edit-analysis" data-id="${e(state.selectedAnalysisId)}">${uiHtml("✎ Editar ACU")}</button> <button class="btn tiny" data-action="modal-reprice" data-id="${e(state.selectedAnalysisId)}">${uiHtml("Recalcular por fecha")}</button>
      <div class="component-list">${state.detail.components.map((row) => `<div><span><span class="kind kind-${e(row.kind)}">${kindBadge(row.kind)}</span> ${e(row.description)}<small>${numeric(row.quantity)} × ${money(row.unit_price)}</small></span><b>${money(row.total)}</b></div>`).join("")}</div>`
          : ("<p class=\"small-muted\">" + uiHtml("Seleccioná un ACU para ver sus insumos.") + "</p>")
      }</aside>`;
    }
    return chrome(`<main class="list-workspace">
    <div class="list-top"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="list-top-actions">${action}</div></div>
    <div class="list-content ${state.view === "projects" ? "home-project-columns" : ""}">${state.view === "projects" ? '<div class="home-project-main">' : ""}<section class="list-table-pane"><div class="pane-toolbar"><span class="pane-title">${uiHtml("REGISTROS")} <em>${rows ? "" : uiHtml("Sin datos")}</em></span><span class="grow"></span><input class="search-compact" data-search placeholder="${uiHtml("⌕ Buscar...")}" value="${e(state.search)}"></div>
      <div class="table-scroll"><table class="data-grid"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty-cell">${uiHtml("No hay registros todavía. Usá el botón superior para crear uno.")}</td></tr>`}</tbody></table></div></section>${state.view === "projects" ? homeCashMarkup()+"</div>"+remindersMarkup() : inspector}</div>${["resources","analyses"].includes(state.view)?costingMarkup(state.view):""}
  </main>`);
  }

  return { workspace, listViews, chrome, rightPanel };
}
