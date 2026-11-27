import { uiText, uiHtml } from "../services/interface-language.js";
import {budgetResourceTotals,loadBudgetAnalyses,materialNeedsFromTotals} from "../services/budget-resources.js";
import { askUnsavedPrices } from "./unsaved-prices.js";
import { e, field, select, dateToday } from "./helpers.js";
import {
  numeric,
  money,
  multiplyDecimals,
  sumDecimals,
  compareDecimals,
} from "../decimal.js";
import {
  exportRequest,
  readQuotedFile,
} from "../services/construction-export.js";
export function createQuotationWorkflow({
  invoke,
  state,
  model,
  render,
  document,
  window,
  FormData,
  refresh,
}) {
  const v = {
    requests: [],
    materialNeeds: null,
    request: null,
    selected: null,
    kind: "material",
    query: "",
    responses: [],
    files: [],
    balances: [],
    orders: [],
    expandedOrders: new Set(),
    dirty: false,
    editRevision: null,
    guardOpen: false,
    analysisOpen: {material:true,work:true},
    providerPicker: null,
    providerMenu: null,
    providerAdding: false,
    exportName: null,
    editVersion: 0,
    saving: false,
    saveError: "",
    award: null,
    receive: null,
    payment: null,
    movement: null,
  };
  const kind = () => (model.tab === "contracts" ? "work" : "material");
  const supplier = (id) =>
    model.partners.find((p) => p.id === id)?.name || "Proveedor";
  const partners = () =>
    model.partners.filter(
      (p) =>
        ["supplier", "subcontractor", "crew"].includes(p.kind) &&
        p.attributes?.person_primary !== "false" && p.attributes?.person_active !== "false",
    );
  async function selectRequest(id) {
    v.providerPicker = null;
    v.providerMenu = null;
    v.selected = v.requests.find((r) => r.id === id) || null;
    v.exportName = v.selected?.title || null;
    v.responses = [];
    v.files = [];
    v.balances = [];
    if (!v.selected) return;
    [v.responses, v.files, v.balances] = await Promise.all([
      invoke("list_quote_responses", { requestId: id }),
      invoke("list_quote_files", { requestId: id }),
      invoke("award_balances", { requestId: id }),
    ]);
  }
  function rememberExpandedOrders() {
    for (const details of document.querySelectorAll("[data-order-details]")) {
      if (details.open) v.expandedOrders.add(details.dataset.orderDetails);
      else v.expandedOrders.delete(details.dataset.orderDetails);
    }
  }
  async function load() {
    rememberExpandedOrders();
    const selected = v.selected?.id;
    v.requests =
      (await invoke("list_quotation_requests", {
        projectId: model.projectId,
      })) || [];
    v.kind = kind();
    v.orders =
      (await invoke("list_supplier_orders", {
        projectId: model.projectId,
        kind: v.kind,
      })) || [];
    v.orders = v.orders.filter(
      (o) =>
        v.kind === "material" || o.document.estimate_id === model.estimateId,
    );
    v.materialNeeds = null;
    v.request = null;
    v.editRevision = null;
    v.award = null;
    v.receive = null;
    v.payment = null;
    v.movement = null;
    v.dirty = false;
    const rows = v.requests.filter(
      (r) =>
        r.kind === v.kind &&
        (r.kind === "material" || r.estimate_id === model.estimateId),
    );
    await selectRequest(
      rows.some((r) => r.id === selected) ? selected : rows.at(-1)?.id,
    );
  }
  const sources = () =>
    v.kind === "material"
      ? state.resources.filter(
          (r) => !r.archived && String(r.kind).toLowerCase() === "material",
        )
      : model.lines.filter((l) => !l.archived);
  function readRequest() {
    const form = document.querySelector("#quotation-request-form");
    if (!form || !v.request) return;
    const f = new FormData(form);
    for (const k of [
      "title",
      "scope",
      "delivery",
      "payment",
      "validity",
      "currency",
    ])
      v.request[k] = String(f.get(k) ?? v.request[k] ?? "").trim();
    v.request.taxes = "Precios unitarios sin IVA";
    v.request.partner_id = f.get("partner_id") || null;
    const selected = new Map(v.request.items.map((i) => [i.source_id, i]));
    for (const row of form.querySelectorAll("[data-request-source]")) {
      const id = row.dataset.requestSource;
      if (row.querySelector("input[type=checkbox]").checked) {
        const s = sources().find((r) => r.id === id);
        selected.set(id, {
          ...(selected.get(id) || {
            id: window.crypto.randomUUID(),
            source_id: id,
            code: s.code || "",
            description: s.description || s.name,
            unit: s.unit,
          }),
          quantity: row.querySelector("input[type=number]").value || "1",
        });
      } else selected.delete(id);
    }
    v.request.items = [...selected.values()];
  }
  function readResponses() {
    const filename = document.querySelector('[name="rfq-filename"]');
    if (filename) v.exportName = filename.value;
    for (const input of document.querySelectorAll("[data-quote-cell]")) {
      const response = v.responses.find((r) => r.id === input.dataset.response),
        p = response?.prices.find((p) => p.row_id === input.dataset.row);
      if (p) p.unit_price = input.value.trim() === "" ? null : input.value;
    }
    for (const input of document.querySelectorAll("[data-response-term]")) {
      const r = v.responses.find((r) => r.id === input.dataset.response);
      if (r) {
        const prefix = r.reference ? r.reference + (r.terms ? "\n" : "") : "";
        if (input.dataset.responseTerm === "terms" && prefix && input.value.startsWith(prefix)) {
          r.terms = input.value.slice(prefix.length);
        } else {
          r[input.dataset.responseTerm] = input.value;
          if (input.dataset.responseTerm === "terms") r.reference = "";
        }
      }
    }
  }
  let priceSaveQueue = Promise.resolve();
  let pendingPriceSaves = 0;
  function saveResponses() {
    const requestId = v.selected?.id;
    pendingPriceSaves++;
    const run = priceSaveQueue.catch(() => {}).then(async () => {
      if(v.selected?.id !== requestId) throw new Error(uiText("La solicitud cambió antes de guardar los precios"));
      readResponses();
      const version = v.editVersion;
      const responses = structuredClone(v.responses);
      for(const r of responses) for(const p of r.prices) {
        if(p.unit_price !== null && !/^\d+(\.\d+)?$/.test(p.unit_price)) throw new Error(uiText("Ingresá precios unitarios positivos sin IVA, o dejá la celda vacía"));
      }
      v.saving=true;v.saveError="";updateSaveState();
      try {
        for(const response of responses) {
          const saved=await invoke("save_quote_response",{response});
          if(v.selected?.id !== requestId) continue;
          const current=v.responses.find(r=>r.id===saved.id);
          if(current) {if(v.editVersion===version) Object.assign(current,saved);else current.revision=saved.revision;}
        }
        if(v.selected?.id===requestId) v.dirty=v.editVersion!==version;
      } catch(error) {v.saveError="No se pudo guardar: "+error;v.dirty=true;throw error;}
      finally {v.saving=false;updateSaveState();}
    });
    priceSaveQueue=run.finally(()=>{pendingPriceSaves--;});return priceSaveQueue;
  }
  function price(response, row) {
    return response.prices.find((p) => p.row_id === row)?.unit_price ?? null;
  }
  function cheapest(row) {
    return v.responses
      .filter((r) => price(r, row) !== null)
      .sort((a, b) => compareDecimals(price(a, row), price(b, row)))[0]?.id;
  }
  function pending(id) {
    return (
      v.balances.find((b) => b.row_id === id)?.quantity ??
      v.selected?.items.find((i) => i.id === id)?.quantity ??
      "0"
    );
  }
  function markup() {
    const rows = v.requests
      .filter(
        (r) =>
          r.kind === kind() &&
          (r.kind === "material" || r.estimate_id === model.estimateId),
      )
      .slice()
      .reverse();
    return `<details class="workflow-card rfq-cost-analysis" data-quote-analysis="${kind()}" ${v.analysisOpen[kind()] ? "open" : ""}><summary>${uiHtml("Análisis de costos de proveedores")}</summary><div class="rfq-analysis-body"><div class="feature-toolbar"><h3>${uiHtml("Solicitudes de cotización")}</h3>${state.remoteProject ? "" : `<button class="btn primary" data-action="ops-rfq-new" data-kind="${kind()}">${uiHtml("+ Nueva")}</button>`}</div><div class="quotation-layout"><aside class="quotation-list" aria-label="${uiHtml("Solicitudes de cotización")}">${rows.map((r) => `<div class="quotation-list-row"><button class="quotation-item ${v.selected?.id === r.id ? "selected" : ""}" data-action="ops-rfq-select" data-id="${r.id}"><strong>${e(r.title)}</strong><small>${e(r.number)} · ${e(r.date)} · ${r.items.length} ${uiHtml("ítems")}</small></button>${state.remoteProject ? "" : `<button class="btn tiny quotation-edit" title="${uiHtml("Editar solicitud {0}", [r.title])}" data-action="ops-rfq-edit" data-id="${r.id}" aria-label="${uiHtml("Editar solicitud {0}", [r.title])}">✎</button>`}</div>`).join("") || ("<p>" + uiHtml("Todavía no hay solicitudes.") + "</p>")}</aside><div class="quotation-detail">${v.selected ? selected() : ("<p>" + uiHtml("Creá o seleccioná una solicitud para ver sus respuestas.") + "</p>")}</div></div></div></details>${orders()}${editor()}${awardEditor()}${receiveEditor()}${paymentEditor()}${movementEditor()}`;
  }
  function popupPosition(button) {
    const rect = button.getBoundingClientRect();
    return {left:Math.max(8,Math.min(rect.right-280,window.innerWidth-296)),top:Math.max(8,Math.min(rect.bottom+5,window.innerHeight-340))};
  }
  function availableProviders(query = "") {
    const normalize = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
    return partners().filter(p => !v.responses.some(r => r.supplier_id === p.id) && tokens.every(token => normalize(`${p.code || ""} ${p.name}`).includes(token)));
  }
  function providerOptions(query = "") {
    return availableProviders(query).map(p => `<button type="button" role="option" data-action="ops-rfq-add-provider" data-id="${e(p.id)}">${e(p.name)}${p.code ? `<small>${e(p.code)}</small>` : ""}</button>`).join("") || ("<p class=\"small-muted\">" + uiHtml("No hay proveedores disponibles con esa búsqueda.") + "</p>");
  }
  function quotePopovers() {
    if (v.providerPicker) {
      const position = v.providerPicker;
      return `<div class="quote-popover quote-provider-picker" role="dialog" aria-label="${uiHtml("Seleccionar proveedor")}" style="left:${position.left}px;top:${position.top}px"><div class="quote-popover-title"><b>${uiHtml("Agregar proveedor")}</b><button class="btn tiny" data-action="ops-rfq-close-popover" aria-label="${uiHtml("Cerrar selector de proveedor")}">×</button></div><input type="search" role="combobox" aria-label="${uiHtml("Buscar proveedor")}" aria-autocomplete="list" aria-expanded="true" aria-controls="quote-provider-options" data-quote-provider-query placeholder="${uiHtml("Buscar proveedor…")}" autocomplete="off"><div id="quote-provider-options" role="listbox" aria-label="${uiHtml("Proveedores disponibles")}">${providerOptions()}</div></div>`;
    }
    const menu = v.providerMenu, response = v.responses.find(r => r.id === menu?.id);
    if (!menu || !response) return "";
    return `<div class="quote-popover quote-provider-actions" role="region" aria-label="${uiHtml("Opciones de {0}", [supplier(response.supplier_id)])}" style="left:${menu.left}px;top:${menu.top}px"><div class="quote-popover-title"><b>${e(supplier(response.supplier_id))}</b><button class="btn tiny" data-action="ops-rfq-close-popover" aria-label="${uiHtml("Cerrar opciones de proveedor")}">×</button></div>${state.remoteProject ? "" : `<button type="button" data-action="ops-rfq-distribute" data-response="${response.id}">${uiHtml("Asignar todo a este proveedor")}</button><label class="attachment-picker">${uiHtml("Importar respuesta XLSX")}<input type="file" data-quote-import="${response.id}" accept=".xlsx"></label><label class="attachment-picker">${uiHtml("Adjuntar PDF / imagen")}<input type="file" data-quote-attachment="${response.id}" accept="application/pdf,image/png,image/jpeg,image/webp"></label>`}${v.files.filter(f => f.response_id === response.id).map(f => `<button type="button" data-action="ops-rfq-open-file" data-id="${f.id}">${e(f.name)}</button>`).join("")}${state.remoteProject ? "" : `<button type="button" class="quote-remove-provider" data-action="ops-rfq-remove-provider" data-id="${response.id}">${uiHtml("Quitar proveedor")}</button>`}</div>`;
  }
  function selected() {
    const r = v.selected, editable = !state.remoteProject;
    const trailing = editable ? '<td class="quote-add-column"></td>' : v.responses.length ? "" : '<td class="quote-empty-provider">—</td>';
    return `<div class="feature-toolbar rfq-request-heading"><h3>${e(r.title)}</h3><button class="btn tiny" data-action="ops-rfq-export" data-format="pdf">${uiHtml("PDF para enviar")}</button><button class="btn tiny" data-action="ops-rfq-export" data-format="xlsx">${uiHtml("Planilla para completar precios")}</button></div><details class="rfq-file-settings"><summary>${uiHtml("Condiciones y nombre de archivo")}</summary>${field(uiText("Nombre del archivo"), "rfq-filename", v.exportName ?? r.title, 'maxlength="150"')}<p>${e(r.scope)} · ${e(r.delivery)} · ${e(r.payment)} · ${e(r.validity)}</p></details><p class="rfq-price-help">${uiHtml("Precios unitarios")} <strong>${uiHtml("sin IVA")}</strong> ${uiHtml("en {0}. Vacío = sin cotizar; cero = precio explícito. Verde: menor precio disponible.", [r.currency])}</p>${editable ? `<div class="rfq-comparison-actions"><button class="btn tiny" data-action="ops-rfq-save-prices">${uiHtml("Guardar precios")}</button><button class="btn primary tiny" data-action="ops-rfq-distribute" ${v.responses.length ? "" : "disabled"}>${uiHtml("Distribuir pedido")}</button><span role="status" aria-live="polite" data-quote-save-state class="quote-save-state ${v.dirty ? "dirty" : ""}">${v.dirty ? uiHtml("Cambios sin guardar") : v.responses.length ? uiHtml("Precios guardados") : ""}</span></div>` : ""}<div class="quotation-matrix"><table class="data-grid"><thead><tr class="quote-header-groups"><th rowspan="2" class="quote-item">${r.kind === "material" ? uiHtml("Material") : uiHtml("Tarea")}</th><th rowspan="2" class="quote-unit">${uiHtml("Unidad")}</th><th rowspan="2" class="quote-quantity">${uiHtml("Cantidad solicitada")}</th><th scope="colgroup" colspan="${Math.max(1,v.responses.length + (editable ? 1 : 0))}" class="quote-providers-heading">${uiHtml("Proveedores")}</th></tr><tr class="quote-header-providers">${v.responses.map(p => `<th class="quote-provider"><div class="quote-provider-heading"><span>${e(supplier(p.supplier_id))}</span><button type="button" class="btn tiny" title="${uiHtml("Opciones de {0}", [supplier(p.supplier_id)])}" aria-label="${uiHtml("Opciones de {0}", [supplier(p.supplier_id)])}" aria-expanded="${v.providerMenu?.id === p.id}" data-action="ops-rfq-provider-menu" data-id="${p.id}">⋯</button></div><small>${uiHtml("Precio unitario sin IVA")}</small></th>`).join("")}${editable ? `<th class="quote-add-column"><button type="button" class="btn tiny quote-add-provider" data-action="ops-rfq-provider-picker" title="${uiHtml("Agregar proveedor")}" aria-label="${uiHtml("Agregar proveedor")}" aria-expanded="${Boolean(v.providerPicker)}">+</button></th>` : v.responses.length ? "" : ("<th class=\"quote-empty-provider\">" + uiHtml("Sin propuestas") + "</th>")}</tr></thead><tbody>${r.items.map(row => `<tr><td class="quote-item">${e(row.description)}</td><td class="quote-unit">${e(row.unit)}</td><td class="quote-quantity">${numeric(row.quantity)}<small>${uiHtml("Pendiente: {0}", [numeric(pending(row.id))])}</small></td>${v.responses.map(p => `<td class="quote-provider-cell ${cheapest(row.id) === p.id ? "quote-best" : ""}"><input type="number" min="0" step="any" data-quote-cell data-response="${p.id}" data-row="${row.id}" value="${e(price(p,row.id) ?? "")}" aria-label="${uiHtml("Precio sin IVA {0} de {1}", [row.description, supplier(p.supplier_id)])}" ${editable ? "" : "readonly"}></td>`).join("")}${trailing}</tr>`).join("")}<tr class="quote-subtotal-row"><th colspan="3">${uiHtml("Subtotal cotizado sin IVA")}</th>${v.responses.map(p => `<td><strong data-quote-total="${p.id}">${money(sumDecimals(r.items.filter(i => price(p,i.id) !== null).map(i => multiplyDecimals(i.quantity,price(p,i.id)))))}</strong><small data-quote-count="${p.id}">${p.prices.filter(x => x.unit_price !== null).length} ${uiHtml("de")} ${r.items.length} ${uiHtml("cotizados")}</small></td>`).join("")}${trailing}</tr><tr class="quote-comments-row"><th colspan="3">${uiHtml("Comentarios / condiciones")}</th>${v.responses.map(p => `<td><textarea data-response-term="terms" data-response="${p.id}" rows="2" placeholder="${uiHtml("Comentarios o condiciones")}" aria-label="${uiHtml("Comentarios y condiciones de {0}", [supplier(p.supplier_id)])}" ${editable ? "" : "readonly"}>${e([p.reference,p.terms].filter(Boolean).join("\n"))}</textarea></td>`).join("")}${trailing}</tr></tbody></table></div>${quotePopovers()}`;
  }
  function orders() {
    const material = kind() === "material";
    return `<section class="workflow-card"><div class="feature-toolbar"><h2>${material ? uiHtml("Pedidos a proveedores") : uiHtml("Subcontratos adjudicados")}</h2>${material && !state.remoteProject ? ("<button class=\"btn\" data-action=\"ops-stock-declare\">" + uiHtml("Declarar acopio existente") + "</button>") : ""}</div><p>${material ? uiHtml("Pago y entrega se siguen por separado. El pago cubre el acopio en proveedor; las recepciones parciales lo trasladan a obra.") : uiHtml("Los certificados aprobados reconocen el avance y el saldo por pagar del contratista.")} ${uiHtml("Los importes adjudicados son sin IVA; los comprobantes fiscales y su conciliación se administran en Finanzas.")}</p><table class="data-grid"><thead><tr><th>${uiHtml("Pedido / proveedor")}</th><th>${uiHtml("Importe sin IVA")}</th><th>${uiHtml("Pago")}</th><th>${material ? uiHtml("Entrega") : uiHtml("Avance")}</th><th></th></tr></thead><tbody>${v.orders.map((o) => `<tr><td>${e(o.document.number)} · ${e(supplier(o.document.partner_id))}<details data-order-details="${e(o.document.id)}" ${v.expandedOrders.has(o.document.id) ? "open" : ""}><summary>${o.lines.length} ${material ? uiHtml("materiales") : uiHtml("tareas")}</summary>${o.lines.map((l) => `<div class="order-line-item"><p>${e(l.description)}</p><div class="order-item-prices"><span>${uiHtml("Cantidad:")} <b>${numeric(l.quantity)}</b></span><span>${uiHtml("Unitario sin IVA:")} <b>${e(o.document.currency)} ${money(l.unit_price)}</b></span><span>${uiHtml("Subtotal sin IVA:")} <b>${e(o.document.currency)} ${money(multiplyDecimals(l.quantity, l.unit_price))}</b></span></div><p class="order-item-delivery">${numeric(l.received)} ${material ? uiHtml("recibidos") : uiHtml("certificados")} ${uiHtml("· Pendiente:")} ${numeric(l.remaining)}${material ? `<small>${uiHtml("En proveedor (total): {0} · Solicitado por recibir: {1}", [numeric(l.vendor_stock || "0"), numeric(l.requested || "0")])}<br><strong>${uiHtml("Disponible para solicitar: {0}", [numeric(movementMaximum(l, "request"))])}</strong></small>` : ""}</p></div>`).join("")}</details></td><td>${e(o.document.currency)} ${money(o.document.amount)}</td><td>${uiHtml(o.payment_state)}<small>${uiHtml("Cubierto:")} ${money(o.paid)} ${uiHtml("· Pendiente:")} ${money(o.pending_payment)}${o.cash_paid != null ? `<br>${uiHtml("Pagos registrados: {0}", [money(o.cash_paid)])}` : ""}${Number(o.supplier_credit) > 0 ? `<br>${uiHtml("Saldo a favor en proveedor: {0}", [money(o.supplier_credit)])}` : ""}</small></td><td>${uiHtml(o.delivery_state)}${material && o.lines.some(l => compareDecimals(l.requested || "0", "0") > 0) ? ("<small>" + uiHtml("Con entregas solicitadas pendientes de recepción") + "</small>") : ""}${(o.files || []).map((f) => `<button class="btn tiny" data-action="ops-rfq-proof-open" data-id="${f.id}" title="${e(f.date || "")} · ${f.document_number ? e(f.document_number) : uiHtml("Comprobante")}">${e(f.document_number || "")} · ${e(f.name)}</button>`).join("")}</td><td>${state.remoteProject ? (material ? "" : `<button class="btn" data-action="ops-cert-contract" data-contract="${o.document.id}">${uiHtml("Ver certificados")}</button>`) : material ? `<button class="btn" data-action="ops-rfq-receive" data-id="${o.document.id}" ${o.delivery_state === "Completa" ? "disabled" : ""}>${uiHtml("Registrar entrega")}</button><button class="btn" data-action="ops-rfq-pay" data-id="${o.document.id}" ${Number(o.pending_payment) <= 0 ? "disabled" : ""}>${uiHtml("Registrar pago")}</button><button class="btn" data-action="ops-rfq-movement" data-kind="${o.editable ? "edit" : "view"}" data-id="${o.document.id}" title="${o.editable ? uiHtml("Editar pedido") : uiHtml("Consultar pedido fijado por sus movimientos")}">${o.editable ? uiHtml("Editar pedido") : uiHtml("Ver pedido")}</button><button class="btn" data-action="ops-rfq-movement" data-kind="request" data-id="${o.document.id}">${uiHtml("Solicitar entrega")}</button><button class="btn" data-action="ops-rfq-movement" data-kind="release" data-id="${o.document.id}">${uiHtml("Canjear materiales")}</button>${Number(o.supplier_credit) > 0 && Number(o.pending_payment) > 0 ? `<button class="btn" data-action="ops-rfq-movement" data-kind="apply" data-id="${o.document.id}">${uiHtml("Aplicar saldo ({0})", [money(o.supplier_credit)])}</button>` : ""}<button class="btn" data-action="ops-rfq-movement" data-kind="history" data-id="${o.document.id}">${uiHtml("Historial")}</button>` : `<button class="btn" data-action="ops-cert-contract" data-contract="${o.document.id}">${uiHtml("Certificar avances / pagos")}</button><button class="btn" data-action="ops-rfq-movement" data-kind="scope" data-id="${o.document.id}">${uiHtml("Reducir / dar de baja")}</button><button class="btn" data-action="ops-rfq-movement" data-kind="history" data-id="${o.document.id}">${uiHtml("Historial")}</button>`}</td></tr>`).join("") || ("<tr><td colspan=\"5\">" + uiHtml("Al distribuir una solicitud aparecerán aquí los pedidos adjudicados.") + "</td></tr>")}</tbody></table>${material && model.stock.length ? `<details><summary>${uiHtml("Material recibido en obra")}</summary><table class="data-grid"><thead><tr><th>${uiHtml("Material")}</th><th>${uiHtml("Cantidad")}</th></tr></thead><tbody>${model.stock.map((s) => `<tr><td>${e(state.resources.find((r) => r.id === s.resource_id)?.description || uiText("Material"))}</td><td>${numeric(s.quantity)}</td></tr>`).join("")}</tbody></table></details>` : ""}</section>`;
  }
  function sourceRows(rows, selected, needed = false) {
    return rows
      .map((s) => {
        const need = (v.materialNeeds??model.report?.needs)?.find((n) => n.resource_id === s.id);
        const suggested = needed
          ? need.suggested??String(Math.max(0,(Number(need.shortage)||0)-Math.max(0,Number(need.ordered)-Number(need.received))))
          : s.quantity || "1";
        return `<label class="rfq-select ${needed ? "required-material" : ""}" data-request-source="${s.id}"><input type="checkbox" ${selected.has(s.id) ? "checked" : ""}><span>${e(s.code || "")} · ${e(s.description || s.name)} · ${e(s.unit)}${needed ? `<small>${uiHtml("Necesario: {0} · Acopio: {1} · Comprado: {2} · Sugerido a pedir: {3}", [numeric(need.required), numeric(need.stock), numeric(need.ordered), numeric(suggested)])}</small>` : ""}</span><input aria-label="${uiHtml("Cantidad {0}", [s.description || s.name])}" type="number" min="0" ${v.kind === "work" ? `max="${s.quantity}"` : ""} step="any" value="${e(selected.get(s.id)?.quantity || suggested)}"></label>`;
      })
      .join("");
  }
  function editor() {
    if (!v.request) return "";
    const r = v.request,
      chosen = new Map(r.items.map((i) => [i.source_id, i])),
      rows = sources().filter((s) =>
        (s.description || s.name || "")
          .toLowerCase()
          .includes(v.query.toLowerCase()),
      ),
      needed = rows.filter((s) =>
        (v.materialNeeds??model.report?.needs)?.some(
          (n) => n.resource_id === s.id && Number(n.required) > 0,
        ),
      );
    return `<section class="workflow-editor" role="dialog" aria-modal="true" aria-label="${uiHtml("Solicitud de cotización")}"><form id="quotation-request-form"><div class="feature-toolbar"><h2>${v.editRevision !== null ? uiHtml("Editar solicitud") : v.kind === "material" ? uiHtml("Cotizar materiales") : uiHtml("Cotizar subcontratos")}</h2><button type="button" class="btn" data-action="ops-rfq-close">${uiHtml("Cancelar")}</button><button type="submit" class="btn primary">${v.editRevision !== null ? uiHtml("Guardar cambios") : uiHtml("Guardar solicitud")}</button></div><div class="workflow-grid">${field(uiText("Nombre de la solicitud"), "title", r.title, 'required maxlength="150"')}${select(
      uiText("Moneda"),
      "currency",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      r.currency,
    )}${select(uiText("Destinatario (opcional)"), "partner_id", [["", uiText("Sin destinatario")], ...partners().map((p) => [p.id, p.name])], r.partner_id)}${field(uiText("Alcance"), "scope", r.scope, 'required maxlength="4000"')}${field(uiText("Entrega / plazo"), "delivery", r.delivery)}${field(uiText("Condiciones de pago"), "payment", r.payment)}${field(uiText("Validez solicitada"), "validity", r.validity)}</div><p>${uiHtml("Todos los precios se solicitarán por unidad y sin IVA.")} ${v.editRevision !== null ? uiHtml("Los materiales ya adjudicados no pueden quitarse ni reducirse por debajo de lo pedido.") : ""}</p>${field(uiText("Buscar materiales / tareas"), "rfq-query", v.query, 'type="search"')}<button type="button" class="btn" data-action="ops-rfq-filter">${uiHtml("Buscar")}</button><div class="workflow-scroll">${
      v.kind === "material"
        ? `<h3>${uiHtml("Materiales necesarios para esta obra")}</h3>${sourceRows(needed, chosen, true) || ("<p>" + uiHtml("Sin materiales calculados para esta selección. Vinculá ACU a las partidas para obtener necesidades.") + "</p>")}<details open><summary>${uiHtml("Otros materiales del catálogo")}</summary>${sourceRows(
            rows.filter((s) => !needed.some((n) => n.id === s.id)),
            chosen,
          )}</details>`
        : sourceRows(rows, chosen)
    }</div></form></section>`;
  }
  function readAward() {
    const form = document.querySelector("#quotation-award-form");
    if (!form) return;
    v.award.choices = [...form.querySelectorAll("[data-award-row]")].map(
      (row) => ({
        row_id: row.dataset.awardRow,
        response_id: row.querySelector("select").value,
        quantity: row.querySelector("input[type=number]").value,
        selected: row.querySelector("input[type=checkbox]").checked,
      }),
    );
  }
  function awardEditor() {
    if (!v.award) return "";
    const r = v.selected,
      work = r.kind === "work";
    return `<section class="workflow-editor" role="dialog" aria-modal="true" aria-label="${uiHtml("Distribuir pedido")}"><form id="quotation-award-form"><div class="feature-toolbar"><h2>${work ? uiHtml("Adjudicar subcontratos") : uiHtml("Distribuir pedido")}</h2><button class="btn" type="button" data-action="ops-rfq-award-close">${uiHtml("Cancelar")}</button><button class="btn primary" type="submit">${uiHtml("Confirmar adjudicación")}</button></div><p>${uiHtml("Se sugiere el menor precio unitario sin IVA. Podés elegir otro proveedor y adjudicar una cantidad parcial; el resto seguirá pendiente.")}</p>${field(uiText("Fecha prevista de pago"), "due_date", dateToday(), 'type="date" required')}<table class="data-grid"><thead><tr><th>${uiHtml("Pedir")}</th><th>${work ? uiHtml("Tarea") : uiHtml("Material")}</th><th>${uiHtml("Cantidad")}</th><th>${uiHtml("Proveedor / precio unitario sin IVA")}</th><th>${uiHtml("Subtotal sin IVA")}</th></tr></thead><tbody>${r.items
      .filter((row) => Number(pending(row.id)) > 0)
      .map((row) => {
        const c = v.award.choices.find((c) => c.row_id === row.id),
          options = v.responses.filter((p) => price(p, row.id) !== null);
        return `<tr data-award-row="${row.id}"><td><input type="checkbox" ${c.selected ? "checked" : ""} ${options.length ? "" : "disabled"}></td><td>${e(row.description)} · ${e(row.unit)}</td><td><input aria-label="${uiHtml("Cantidad a adjudicar {0}", [row.description])}" type="number" min="0.000001" max="${pending(row.id)}" step="any" value="${e(c.quantity)}"></td><td><select aria-label="${uiHtml("Proveedor para {0}", [row.description])}"><option value="">${uiHtml("Seleccionar…")}</option>${options.map((p) => `<option value="${p.id}" ${p.id === c.response_id ? "selected" : ""}>${e(supplier(p.supplier_id))} · ${money(price(p, row.id))}${cheapest(row.id) === p.id ? uiHtml(" · Menor precio") : ""}</option>`).join("")}</select></td><td data-award-subtotal="${row.id}">${
          c.response_id
            ? money(
                multiplyDecimals(
                  c.quantity || "0",
                  price(
                    v.responses.find((p) => p.id === c.response_id),
                    row.id,
                  ) || "0",
                ),
              )
            : uiHtml("Sin cotizar")
        }</td></tr>`;
      })
      .join("")}</tbody></table>${
      work
        ? `<h3>${uiHtml("Condiciones del subcontrato")}</h3><div class="workflow-grid">${field(uiText("Alcance contratado"), "contract_scope", r.scope, "required")}${select(
            uiText("Modalidad de liquidación"),
            "method",
            [
              ["quantity", uiText("Por cantidades ejecutadas")],
              ["percent", uiText("Por avance porcentual")],
              ["fixed", uiText("Importe fijo por período")],
              ["daily", uiText("Por jornada")],
              ["hourly", uiText("Por hora")],
            ],
            "quantity",
          )}${select(
            uiText("Frecuencia de pago"),
            "frequency",
            [
              ["weekly", uiText("Semanal (viernes)")],
              ["fortnight", uiText("Quincenal")],
              ["monthly", uiText("Mensual")],
              ["by_progress", uiText("Al certificar avance")],
            ],
            "weekly",
          )}${field(uiText("Tarifa por período / jornada / hora"), "rate", "0", 'type="number" min="0" step="any"')}${field(uiText("Tope total para tarifa fija o por tiempo"), "ceiling", "0", 'type="number" min="0" step="any"')}${field(uiText("Jornadas / horas estimadas por pago"), "forecast_units", "1", 'type="number" min="0" step="any"')}${field(uiText("Inicio contratado"), "contract_start", "", 'type="date"')}${field(uiText("Fin contratado"), "contract_end", "", 'type="date"')}${field(uiText("Demora de pago (días)"), "payment_delay_days", "0", 'type="number" min="0" max="365"')}${field(uiText("Recuperación de anticipo %"), "advance_recovery_percent", "0", 'type="number" min="0" max="100" step="any"')}${field(uiText("Fondo de reparo %"), "retention_percent", "0", 'type="number" min="0" max="100" step="any"')}</div><label><input type="checkbox" name="contributes_progress" checked> ${uiHtml("Aporta ejecución física (desmarcar apoyos, alquileres y servicios)")}</label>`
        : ""
    }</form></section>`;
  }
  function receiveEditor() {
    if (!v.receive) return "";
    return `<section class="workflow-editor compact-editor" role="dialog" aria-modal="true" aria-label="${uiHtml("Registrar entrega")}"><form id="quotation-receive-form"><h2>${uiHtml("Registrar entrega · {0}", [v.receive.document.number])}</h2><p>${uiHtml("Ingresá solo las cantidades recibidas ahora. Las pendientes se conservan y lo recibido se incorpora al acopio de esta obra.")}</p>${v.receive.lines
      .filter((l) => Number(l.remaining) > 0)
      .map(
        (l) =>
          `<div class="feature-toolbar">${field(`${l.description} · ${uiText("Pendiente: {0}", [numeric(l.remaining)])}`, l.source_id, "0", `type="number" min="0" max="${l.remaining}" step="any"`)}</div>`,
      )
      .join(
        "",
      )}<label>${uiHtml("Remito firmado (opcional)")}<input type="file" name="proof" accept="application/pdf,image/png,image/jpeg,image/webp"></label><button class="btn primary" type="submit">${uiHtml("Confirmar recepción")}</button><button class="btn" type="button" data-action="ops-rfq-receive-close">${uiHtml("Cancelar")}</button></form></section>`;
  }
  function paymentEditor() {
    if (!v.payment) return "";
    return `<section class="workflow-editor compact-editor" role="dialog" aria-modal="true" aria-label="${uiHtml("Registrar pago")}"><form id="quotation-payment-form"><h2>${uiHtml("Registrar pago · {0}", [v.payment.document.number])}</h2><p>${uiHtml("Saldo del pedido sin IVA: {0}. Si ya registraste una factura, aplicá el pago desde Finanzas para conciliarla.", [money(v.payment.pending_payment)])}</p>${field(uiText("Importe pagado"), "amount", v.payment.pending_payment, `type="number" min="0.000001" max="${v.payment.pending_payment}" step="any" required`)}${field(uiText("Fecha del pago"), "date", dateToday(), 'type="date" required')}<label>${uiHtml("Recibo de pago (opcional)")}<input type="file" name="proof" accept="application/pdf,image/png,image/jpeg,image/webp"></label><button class="btn primary" type="submit">${uiHtml("Registrar pago")}</button><button class="btn" type="button" data-action="ops-rfq-pay-close">${uiHtml("Cancelar")}</button></form></section>`;
  }
  const movementTitles = {
    edit: "Editar pedido",
    view: "Ver pedido",
    reserve: "Acopio en proveedor",
    request: "Solicitar entrega",
    release: "Canjear materiales / generar saldo",
    apply: "Aplicar saldo a favor",
    history: "Historial del pedido",
    scope: "Reducir o dar de baja el subcontrato",
  };
  function movementMaximum(line, kind) {
    const available = kind === "request"
      ? sumDecimals([line.vendor_stock || "0", multiplyDecimals(line.requested || "0", "-1")])
      : kind === "reserve"
        ? sumDecimals([line.remaining, multiplyDecimals(line.vendor_stock || "0", "-1")])
        : line.remaining;
    return compareDecimals(available, "0") < 0 ? "0" : available;
  }
  function validateMovementQuantity(input) {
    const error = input.closest(".movement-quantity").querySelector("[data-quantity-error]");
    let message = "";
    try {
      if (compareDecimals(input.value || "0", input.max) > 0)
        message = `No puede superar el máximo disponible: ${input.max}.`;
      else if (compareDecimals(input.value || "0", "0") < 0)
        message = "La cantidad no puede ser negativa.";
    } catch { message = "Ingresá una cantidad válida."; }
    input.setCustomValidity(message);
    input.setAttribute("aria-invalid", String(Boolean(message)));
    error.textContent = message;
  }
  function movementEditor() {
    const m = v.movement;
    if (!m) return "";
    const o = m.order;
    return `<section class="workflow-editor compact-editor" role="dialog" aria-modal="true" aria-label="${movementTitles[m.kind]}"><form id="supplier-movement-form"><div class="feature-toolbar order-dialog-heading"><h2>${movementTitles[m.kind]} · ${e(o.document.number)}</h2><button type="button" class="btn" data-action="ops-rfq-movement-close">${uiHtml("Cerrar")}</button></div>${
      m.kind === "scope"
        ? `<p>${uiHtml("Conservá la cantidad ya certificada. Reducí el total contratado o usá «Dar de baja el trabajo pendiente» para liberar todo lo restante y adjudicarlo a otro contratista.")}</p><button class="btn" type="button" data-action="ops-rfq-scope-cancel">${uiHtml("Dar de baja el trabajo pendiente")}</button>${o.lines.map((l) => field(l.description + " · Certificado " + numeric(l.received), "q:" + l.source_id, l.quantity, `type="number" min="${l.received}" max="${l.quantity}" step="any" required`)).join("")}`
        : m.kind === "history"
          ? `<ol>${
              m.history
                .map(
                  (h) =>
                    `<li>${h.created_at ? e(new Date(h.created_at).toLocaleString("es-AR", { timeZone: "America/Buenos_Aires" })) + " · " : ""}${e(movementTitles[h.kind] || h.kind)} · ${e(h.reason)}${Object.entries(
                      h.quantities || {},
                    )
                      .map(
                        ([id, q]) =>
                          ` · ${e(o.lines.find((l) => l.source_id === id)?.description || "Material")}: ${numeric(q)}`,
                      )
                      .join(
                        "",
                      )}${Number(h.amount) ? ` · ${money(h.amount)}` : ""}</li>`,
                )
                .join("") || uiHtml("Sin modificaciones posteriores al pedido.")
            }</ol>`
          : ["edit", "view"].includes(m.kind)
            ? `<fieldset class="order-edit-fields" ${m.kind === "view" ? "disabled" : ""}>${select(
                uiText("Proveedor"),
                "partner_id",
                partners().map((p) => [p.id, p.name]),
                o.document.partner_id,
              )}${field(uiText("Fecha prevista de pago"), "due_date", o.document.due_date, 'type="date" required')}<div>${m.lines
                .map(
                  (l, i) =>
                    `<div class="movement-edit-row" data-movement-row="${i}">${select(
                      uiText("Material"),
                      "resource_id",
                      state.resources
                        .filter(
                          (r) => String(r.kind).toLowerCase() === "material",
                        )
                        .map((r) => [r.id, r.description]),
                      l.resource_id,
                    )}${field(uiText("Cantidad"), "quantity", l.quantity, 'type="number" min="0.000001" step="any" required')}${field(uiText("Precio unitario sin IVA"), "unit_price", l.unit_price, 'type="number" min="0" step="any" required')}<button class="btn order-remove-item" type="button" data-action="ops-rfq-movement-remove" data-index="${i}" title="${uiHtml("Quitar material")}" aria-label="${uiHtml("Quitar material {0}", [state.resources.find(r=>r.id===l.resource_id)?.description || String(i+1)])}">×</button></div>`,
                )
                .join(
                  "",
                )}</div><button class="btn" type="button" data-action="ops-rfq-movement-add">${uiHtml("Agregar material")}</button></fieldset>`
            : m.kind === "apply"
              ? `<p>${uiHtml("Saldo disponible en este proveedor y moneda: {0}. Se aplica sin generar un nuevo pago.", [money(o.supplier_credit)])}</p>${field(uiText("Saldo a aplicar"), "amount", String(Math.min(Number(o.supplier_credit), Number(o.pending_payment))), 'type="number" min="0.000001" step="any" required')}`
              : `<p>${m.kind === "reserve" ? uiHtml("Registrá las cantidades pagadas que el proveedor confirma tener reservadas para esta obra.") : m.kind === "request" ? uiHtml("Indicá cuánto del acopio en proveedor pedís que sea enviado a la obra. La recepción se registra por separado.") : uiHtml("Solo se cancelan cantidades no entregadas. El pago original se conserva y el importe reconocido queda como saldo para otros materiales del mismo proveedor y moneda.")}</p>${o.lines
                  .filter((l) => Number(l.remaining) > 0)
                  .map((l, i) => {
                    const maximum = movementMaximum(l, m.kind);
                    return `<div class="movement-quantity">${field(
                      l.description + " · Pendiente " + numeric(l.remaining) + " · En proveedor " + numeric(l.vendor_stock || "0"),
                      "q:" + l.source_id, "0",
                      `type="number" min="0" max="${e(maximum)}" step="any" data-movement-quantity aria-describedby="movement-error-${i}"`,
                    )}<button class="btn tiny" type="button" data-action="ops-rfq-movement-all" data-source="${e(l.source_id)}">${uiHtml("Todo")}</button><small class="movement-quantity-error" id="movement-error-${i}" data-quantity-error aria-live="polite"></small></div>`;
                  })
                  .join(
                    "",
                  )}${m.kind === "release" ? field(uiText("Saldo reconocido por el proveedor (sin IVA)"), "amount", "0", 'type="number" min="0" step="any" required') : ""}`
    }${!["history","view"].includes(m.kind) ? `<label>${uiHtml("Motivo / referencia")}<textarea name="reason" maxlength="2000" ${["release", "scope"].includes(m.kind) ? "required" : ""}></textarea></label>${m.kind === "scope" ? "" : ("<label>" + uiHtml("Comprobante (opcional)") + "<input type=\"file\" name=\"proof\" accept=\"application/pdf,image/png,image/jpeg,image/webp\"></label>")}<div class="movement-actions"><button class="btn primary" type="submit">${m.kind === "edit" ? uiHtml("Guardar cambios") : uiHtml("Confirmar")}</button></div>` : ""}</form></section>`;
  }
  function readMovementLines() {
    if (v.movement?.kind !== "edit") return;
    v.movement.lines = [
      ...document.querySelectorAll("[data-movement-row]"),
    ].map((row) => ({
      resource_id: row.querySelector('[name="resource_id"]').value,
      quantity: row.querySelector('[name="quantity"]').value,
      unit_price: row.querySelector('[name="unit_price"]').value,
    }));
  }
  async function proofFrom(form) {
    const file = form.querySelector('[name="proof"]')?.files?.[0];
    if (!file) return null;
    if (file.size > 10 * 1024 * 1024)
      throw new Error(uiText("Máximo 10 MB por comprobante"));
    return {
      name: file.name,
      content: [...new Uint8Array(await file.arrayBuffer())],
    };
  }
  async function refreshMaterialNeeds(){
    v.materialNeeds=null;
    if(v.kind!=='material'||!model.estimateId)return;
    const lines=await invoke('list_estimate_lines',{estimateId:model.estimateId});
    const [analyses,pricing]=await Promise.all([loadBudgetAnalyses(invoke,lines),invoke("get_price_definition",{estimateId:model.estimateId})]);
    v.materialNeeds=materialNeedsFromTotals(budgetResourceTotals(lines,analyses,state.resources,{},pricing.definition),model.report?.needs||[]);
  }
  async function act(b) {
    rememberExpandedOrders();
    const a = b.dataset.action;
    if (!a.startsWith("ops-rfq-")) return false;
    readRequest();
    readResponses();
    if (a === "ops-rfq-proof-open") {
      await invoke("open_operation_file", {
        projectId: model.projectId,
        id: b.dataset.id,
      });
    }
    if (a === "ops-rfq-movement") {
      if (!(await protect())) return true;
      const order = v.orders.find((o) => o.document.id === b.dataset.id);
      v.movement = {
        kind: b.dataset.kind,
        order,
        lines: structuredClone(order.document.lines),
        history: await invoke("list_supplier_movements", {
          projectId: model.projectId,
          orderId: order.document.id,
        }),
      };
    }
    if (a === "ops-rfq-scope-cancel") {
      for (const l of v.movement.order.lines)
        document.querySelector(`[name="q:${l.source_id}"]`).value = l.received;
      v.dirty = true;
      return true;
    }
    if (a === "ops-rfq-movement-all") {
      const input = [...document.querySelectorAll("[data-movement-quantity]")].find(t => t.name === "q:" + b.dataset.source);
      if (input) {
        input.value = input.max;
        validateMovementQuantity(input);
        v.dirty = true;
      }
      return true;
    }
    if (a === "ops-rfq-movement-close") {
      if (!(await protect())) return true;
      v.movement = null;
    }
    if (a === "ops-rfq-movement-add") {
      readMovementLines();
      v.movement.lines.push({
        resource_id: "",
        quantity: "1",
        unit_price: "0",
      });
    }
    if (a === "ops-rfq-movement-remove") {
      readMovementLines();
      v.movement.lines.splice(Number(b.dataset.index), 1);
    }
    if (a === "ops-rfq-new") {
      if (!(await protect())) return true;
      v.kind = kind();
      await refreshMaterialNeeds();
      v.editRevision = null;
      v.query = "";
      v.request = {
        id: window.crypto.randomUUID(),
        project_id: model.projectId,
        estimate_id: v.kind === "work" ? model.estimateId : null,
        kind: v.kind,
        title: "",
        number: "",
        date: dateToday(),
        currency: ["Usd", "USD"].includes(
          model.estimates.find((x) => x.id === model.estimateId)?.currency,
        )
          ? "USD"
          : "ARS",
        partner_id: null,
        scope: v.kind === "work" ? "Mano de obra" : "Provisión de materiales",
        delivery: "",
        payment: "",
        validity: "",
        taxes: "Precios unitarios sin IVA",
        items: [],
      };
    }
    if (a === "ops-rfq-close") {
      if (!(await protect())) return true;
      v.request = null;
      v.dirty = false;
    }
    if (a === "ops-rfq-edit") {
      if (!(await protect())) return true;
      const saved = await invoke("get_editable_quotation_request", {
        id: b.dataset.id,
      });
      v.request = structuredClone(saved.request);
      v.kind = v.request.kind;
      await refreshMaterialNeeds();
      v.editRevision = saved.revision;
      v.query = "";
      v.dirty = false;
    }
    if (a === "ops-rfq-remove-provider") {
      if (!(await protect())) return true;
      const response = v.responses.find((r) => r.id === b.dataset.id);
      if (
        !window.confirm(
          uiText("¿Quitar este proveedor de la comparativa? Sus pedidos adjudicados, precios históricos y adjuntos se conservarán."),
        )
      )
        return true;
      await invoke("hide_quote_response", {
        requestId: v.selected.id,
        id: response.id,
        revision: response.revision,
      });
      v.responses = v.responses.filter((r) => r.id !== response.id);
    }
    if (a === "ops-rfq-filter")
      v.query = document.querySelector('[name="rfq-query"]').value;
    if (a === "ops-rfq-select") {
      if (!(await protect())) return true;
      await selectRequest(b.dataset.id);
      v.dirty = false;
    }
    if (a === "ops-rfq-provider-picker") {
      const opening = !v.providerPicker;
      v.providerMenu = null;
      v.providerPicker = opening ? popupPosition(b) : null;
      render();
      document.querySelector("[data-quote-provider-query]")?.focus();
      return true;
    }
    if (a === "ops-rfq-provider-menu") {
      const opening = v.providerMenu?.id !== b.dataset.id;
      v.providerPicker = null;
      v.providerMenu = opening ? {...popupPosition(b), id:b.dataset.id} : null;
      render();
      return true;
    }
    if (a === "ops-rfq-close-popover") { closeQuotePopover(true); return true; }
    if (a === "ops-rfq-add-provider") {
      if (v.providerAdding) return true;
      const id = b.dataset.id;
      if (!availableProviders().some(p => p.id === id)) throw new Error(uiText("El proveedor ya está agregado o no está disponible"));
      v.providerAdding = true;
      try {
        v.responses.push(await invoke("add_quote_supplier", {requestId:v.selected.id,supplierId:id}));
        v.providerPicker = null;
      } finally { v.providerAdding = false; }
    }
    if (!["ops-rfq-provider-picker","ops-rfq-provider-menu"].includes(a)) v.providerMenu = null;
    if (a === "ops-rfq-save-prices") {
      await saveResponses();
      state.message = uiText("Precios unitarios sin IVA guardados.");
    }
    if (a === "ops-rfq-export")
      model.lastExport = await exportRequest(
        invoke,
        v.selected,
        b.dataset.format,
        document.querySelector('[name="rfq-filename"]')?.value ||
          v.selected.title,
      );
    if (a === "ops-rfq-distribute") {
      await saveResponses();
      v.balances = await invoke("award_balances", { requestId: v.selected.id });
      v.award = {
        choices: v.selected.items
          .filter((row) => Number(pending(row.id)) > 0)
          .map((row) => ({
            row_id: row.id,
            response_id: b.dataset.response || cheapest(row.id) || "",
            quantity: pending(row.id),
            selected: b.dataset.response
              ? price(
                  v.responses.find((r) => r.id === b.dataset.response),
                  row.id,
                ) !== null
              : Boolean(cheapest(row.id)),
          })),
      };
    }
    if (a === "ops-rfq-award-close") v.award = null;
    if (a === "ops-rfq-receive")
      v.receive = v.orders.find((o) => o.document.id === b.dataset.id);
    if (a === "ops-rfq-receive-close") {
      if (!(await protect())) return true;
      v.receive = null;
    }
    if (a === "ops-rfq-pay")
      v.payment = v.orders.find((o) => o.document.id === b.dataset.id);
    if (a === "ops-rfq-pay-close") {
      if (!(await protect())) return true;
      v.payment = null;
    }
    if (a === "ops-rfq-open-file")
      await invoke("open_quote_file", {
        projectId: model.projectId,
        id: b.dataset.id,
      });
    render();
    if (v.editRevision !== null) {
      const currency = document.querySelector(
        '#quotation-request-form [name="currency"]',
      );
      if (currency) currency.disabled = true;
    }
    return true;
  }
  async function change(t) {
    if (t.dataset.quoteAttachment) {
      const file = t.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024)
        throw new Error(uiText("Máximo 10 MB por adjunto"));
      await saveResponses();
      await invoke("attach_quote_file", {
        responseId: t.dataset.quoteAttachment,
        name: file.name,
        content: [...new Uint8Array(await file.arrayBuffer())],
      });
      v.files = await invoke("list_quote_files", { requestId: v.selected.id });
      v.providerMenu = null;
      render();
      return true;
    }
    if (t.dataset.quoteImport) {
      const file = t.files?.[0];
      if (!file) return;
      readResponses();
      const prices = await readQuotedFile(file),
        r = v.responses.find((r) => r.id === t.dataset.quoteImport);
      for (const p of prices) {
        const existing = r.prices.find((x) => x.row_id === p.row_id);
        if (!existing)
          throw new Error(uiText("La planilla contiene renglones de otro pedido"));
        Object.assign(existing, p);
      }
      v.dirty = true;
      v.providerMenu = null;
      render();
      return true;
    }
    if (t.closest?.("#quotation-award-form")) {
      readAward();
      for (const output of document.querySelectorAll("[data-award-subtotal]")) {
        const c = v.award.choices.find(
            (c) => c.row_id === output.dataset.awardSubtotal,
          ),
          response = v.responses.find((r) => r.id === c?.response_id);
        output.textContent = response
          ? money(
              multiplyDecimals(
                c.quantity || "0",
                price(response, c.row_id) || "0",
              ),
            )
          : uiText("Sin cotizar");
      }
      return true;
    }
    return false;
  }
  async function submit(form) {
    const data = new FormData(form);
    if (form.id === "quotation-request-form") {
      readRequest();
      const saved =
        v.editRevision === null
          ? await invoke("create_quotation_request", { request: v.request })
          : (
              await invoke("update_quotation_request", {
                request: v.request,
                revision: v.editRevision,
              })
            ).request;
      v.request = null;
      v.editRevision = null;
      v.dirty = false;
      await refresh();
      v.requests = await invoke("list_quotation_requests", {
        projectId: model.projectId,
      });
      await selectRequest(saved.id);
    }
    if (form.id === "quotation-award-form") {
      readAward();
      const choices = v.award.choices
        .filter((c) => c.selected)
        .map(({ selected, ...c }) => ({
          ...c,
          response_revision:
            v.responses.find((r) => r.id === c.response_id)?.revision || 0,
        }));
      if (!choices.length)
        throw new Error(uiText("Seleccioná materiales o tareas para adjudicar"));
      const contractTerms =
        v.selected.kind === "work"
          ? {
              method: String(data.get("method")),
              frequency: String(data.get("frequency")),
              rate: String(data.get("rate") || "0"),
              ceiling: String(data.get("ceiling") || "0"),
              forecast_units: String(data.get("forecast_units") || "1"),
              start: String(data.get("contract_start") || ""),
              end: String(data.get("contract_end") || ""),
              scope: String(data.get("contract_scope")),
              contributes_progress: data.has("contributes_progress"),
              payment_delay_days: Number(data.get("payment_delay_days") || 0),
              advance_recovery_percent: String(
                data.get("advance_recovery_percent") || "0",
              ),
              retention_percent: String(data.get("retention_percent") || "0"),
            }
          : null;
      await invoke("award_quotation", {
        requestId: v.selected.id,
        choices,
        dueDate: String(data.get("due_date")),
        contractTerms,
      });
      await refresh();
      await load();
      state.message =
        uiText("Adjudicación confirmada. Los precios del presupuesto no cambiaron.");
    }
    if (form.id === "supplier-movement-form") {
      readMovementLines();
      const m = v.movement;
      const quantities = Object.fromEntries(
        [...data]
          .filter(([k]) => k.startsWith("q:"))
          .map(([k, q]) => [k.slice(2), String(q)]),
      );
      if (m.kind === "scope") {
        await invoke("revise_subcontract", {
          projectId: model.projectId,
          orderId: m.order.document.id,
          revision: m.order.revision,
          quantities,
          reason: String(data.get("reason") || ""),
        });
      } else
        await invoke("record_supplier_movement", {
          movement: {
            order_id: m.order.document.id,
            project_id: model.projectId,
            kind: m.kind,
            revision: m.order.revision,
            quantities,
            amount: String(data.get("amount") || "0"),
            reason: String(data.get("reason") || ""),
            lines:
              m.kind === "edit"
                ? m.lines.map((l) => ({
                    ...l,
                    description:
                      state.resources.find((r) => r.id === l.resource_id)
                        ?.description || "Material",
                  }))
                : [],
            partner_id: data.get("partner_id") || null,
            due_date: data.get("due_date") || null,
            proof: await proofFrom(form),
          },
        });
      v.dirty = false;
      await refresh();
      await load();
      state.message = uiText("Movimiento del proveedor registrado.");
    }
    if (form.id === "quotation-receive-form") {
      const quantities = Object.fromEntries(
        [...data]
          .filter(([id]) => id !== "proof")
          .map(([id, q]) => [id, String(q)]),
      );
      await invoke("receive_material_order_with_proof", {
        projectId: model.projectId,
        orderId: v.receive.document.id,
        quantities,
        proof: await proofFrom(form),
      });
      await refresh();
      await load();
    }
    if (form.id === "quotation-payment-form") {
      const o = v.payment.document;
      await invoke("material_payment_with_proof", {
        proof: await proofFrom(form),
        operation: {
          id: window.crypto.randomUUID(),
          project_id: model.projectId,
          estimate_id: o.estimate_id,
          partner_id: o.partner_id,
          reference_id: o.id,
          kind: "payment",
          number: "",
          date: String(data.get("date")),
          currency: o.currency,
          amount: String(data.get("amount")),
        },
      });
      await refresh();
      await load();
    }
    render();
  }
  async function protect() {
    if(pendingPriceSaves){try{await priceSaveQueue;}catch{ /* The existing unsaved-changes dialog offers retry. */ }}
    readRequest();
    readResponses();
    if (!v.dirty) return true;
    if (v.guardOpen) return false;
    if (v.request || v.movement || v.receive || v.payment) {
      if (!window.confirm(uiText("¿Descartar los cambios del formulario sin guardar?")))
        return false;
      v.dirty = false;
      return true;
    }
    v.guardOpen = true;
    try {
      const choice = await askUnsavedPrices({
        document,
        onSave: saveResponses,
      });
      if (choice === "cancel") return false;
      if (choice === "discard") {
        await selectRequest(v.selected.id);
        v.dirty = false;
      }
      return true;
    } finally {
      v.guardOpen = false;
    }
  }
  function updateSaveState() {
    const status = document.querySelector("[data-quote-save-state]");
    if (status) {
      status.textContent = v.saveError || (v.saving ? "Guardando…" : v.dirty ? "Cambios sin guardar" : "Precios guardados");
      status.classList.toggle("dirty", v.dirty);
    }
  }

  function closeQuotePopover(restoreFocus = false) {
    const menu = v.providerMenu;
    v.providerPicker = null; v.providerMenu = null;
    document.querySelectorAll(".quote-popover").forEach(p => p.remove());
    document.querySelectorAll('[data-action="ops-rfq-provider-picker"],[data-action="ops-rfq-provider-menu"]').forEach(b => b.setAttribute("aria-expanded","false"));
    if (restoreFocus) {
      const button = menu ? [...document.querySelectorAll('[data-action="ops-rfq-provider-menu"]')].find(b => b.dataset.id === menu.id) : document.querySelector('[data-action="ops-rfq-provider-picker"]');
      button?.focus();
    }
  }
  document.addEventListener("focusout", event => {
    if(!event.target.isConnected || !event.target.matches?.("[data-quote-cell],[data-response-term]") || !v.dirty || state.remoteProject) return;
    saveResponses().catch(error => {v.saveError="No se pudo guardar. Tus cambios siguen en pantalla: "+error;updateSaveState();});
  });
  document.addEventListener("toggle", event => {
    if(event.target.isConnected && event.target.matches?.("[data-quote-analysis]")) {
      v.analysisOpen[event.target.dataset.quoteAnalysis] = event.target.open;
      if(!event.target.open) closeQuotePopover();
    }
  }, true);
  document.addEventListener("click", event => {
    if((v.providerPicker || v.providerMenu) && !event.target.closest?.('.quote-popover,[data-action="ops-rfq-provider-picker"],[data-action="ops-rfq-provider-menu"]')) closeQuotePopover();
  }, true);
  document.addEventListener("keydown", event => {
    if(!(v.providerPicker || v.providerMenu))return;
    if(event.key === "Escape") {event.preventDefault();event.stopPropagation();closeQuotePopover(true);return;}
    if(event.target.matches?.("[data-quote-provider-query]") && event.key === "Enter") {
      event.preventDefault();document.querySelector('#quote-provider-options [role="option"]')?.click();
    }
    if(event.key === "ArrowDown" || event.key === "ArrowUp") {
      const options = [...document.querySelectorAll('#quote-provider-options [role="option"]')];
      if(!options.length)return;
      event.preventDefault();const current=options.indexOf(document.activeElement), step=event.key === "ArrowDown" ? 1 : -1;
      options[current < 0 ? (step > 0 ? 0 : options.length-1) : (current+step+options.length)%options.length]?.focus();
    }
  }, true);
  return {
    v,
    load,
    markup,
    act,
    change,
    submit,
    protect,
    isSaving: () => pendingPriceSaves > 0,
    input: (t) => {
      if(t.name==='rfq-query'&&t.value===''){
        readRequest();v.query='';render();document.querySelector('[name="rfq-query"]')?.focus();return;
      }
      if (t.matches?.("[data-quote-provider-query]")) {
        const list = document.querySelector("#quote-provider-options");
        if(list)list.innerHTML = providerOptions(t.value);
        return;
      }
      if (t.matches?.("[data-movement-quantity]")) validateMovementQuantity(t);
      if (
        t.closest?.(
          "#quotation-request-form,#supplier-movement-form,#quotation-receive-form,#quotation-payment-form",
        ) ||
        t.matches?.("[data-quote-cell],[data-response-term]")
      ) {
        v.dirty = true;
        v.editVersion++;v.saveError="";
        updateSaveState();
      }
      if (t.matches?.("[data-quote-cell]")) {
        readResponses();
        try {
          for (const input of document.querySelectorAll("[data-quote-cell]"))
            input
              .closest("td")
              .classList.toggle(
                "quote-best",
                cheapest(input.dataset.row) === input.dataset.response,
              );
          for(const count of document.querySelectorAll("[data-quote-count]")) {
            const response=v.responses.find(r=>r.id===count.dataset.quoteCount);
            if(response) count.textContent=`${response.prices.filter(p=>p.unit_price!==null).length} de ${v.selected.items.length} cotizados`;
          }
          for (const output of document.querySelectorAll(
            "[data-quote-total]",
          )) {
            const r = v.responses.find(
              (r) => r.id === output.dataset.quoteTotal,
            );
            output.textContent = money(
              sumDecimals(
                v.selected.items
                  .filter((i) => price(r, i.id) !== null)
                  .map((i) => multiplyDecimals(i.quantity, price(r, i.id))),
              ),
            );
          }
        } catch {}
      }
    },
  };
}
