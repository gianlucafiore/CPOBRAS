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
    request: null,
    selected: null,
    kind: "material",
    query: "",
    responses: [],
    files: [],
    balances: [],
    orders: [],
    dirty: false,
    editRevision: null,
    guardOpen: false,
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
        p.attributes?.person_primary !== "false",
    );
  async function selectRequest(id) {
    v.selected = v.requests.find((r) => r.id === id) || null;
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
  async function load() {
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
    for (const input of document.querySelectorAll("[data-quote-cell]")) {
      const response = v.responses.find((r) => r.id === input.dataset.response),
        p = response?.prices.find((p) => p.row_id === input.dataset.row);
      if (p) p.unit_price = input.value.trim() === "" ? null : input.value;
    }
    for (const input of document.querySelectorAll("[data-response-term]")) {
      const r = v.responses.find((r) => r.id === input.dataset.response);
      if (r) r[input.dataset.responseTerm] = input.value;
    }
  }
  async function saveResponses() {
    readResponses();
    for (const r of v.responses)
      for (const p of r.prices) {
        if (p.unit_price !== null && !/^\d+(\.\d+)?$/.test(p.unit_price))
          throw new Error(
            "Ingresá precios unitarios positivos sin IVA, o dejá la celda vacía",
          );
      }
    for (let i = 0; i < v.responses.length; i++)
      v.responses[i] = await invoke("save_quote_response", {
        response: v.responses[i],
      });
    v.dirty = false;
    updateSaveState();
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
    return `<section class="workflow-card"><div class="feature-toolbar"><h2>Solicitudes de cotización</h2>${state.remoteProject ? "" : `<button class="btn primary" data-action="ops-rfq-new" data-kind="${kind()}">+ Nueva</button>`}</div><div class="quotation-layout"><aside class="quotation-list" aria-label="Solicitudes de cotización">${rows.map((r) => `<div class="quotation-list-row"><button class="quotation-item ${v.selected?.id === r.id ? "selected" : ""}" data-action="ops-rfq-select" data-id="${r.id}"><strong>${e(r.title)}</strong><small>${e(r.number)} · ${e(r.date)} · ${r.items.length} ítems</small></button>${state.remoteProject ? "" : `<button class="btn tiny quotation-edit" title="Editar solicitud ${e(r.title)}" data-action="ops-rfq-edit" data-id="${r.id}" aria-label="Editar solicitud ${e(r.title)}">✎</button>`}</div>`).join("") || "<p>Todavía no hay solicitudes.</p>"}</aside><div class="quotation-detail">${v.selected ? selected() : "<p>Creá o seleccioná una solicitud para ver sus respuestas.</p>"}</div></div></section>${orders()}${editor()}${awardEditor()}${receiveEditor()}${paymentEditor()}${movementEditor()}`;
  }
  function selected() {
    const r = v.selected;
    return `<div class="feature-toolbar"><h3>${e(r.title)}</h3><button class="btn" data-action="ops-rfq-export" data-format="pdf">PDF para enviar</button><button class="btn" data-action="ops-rfq-export" data-format="xlsx">Planilla para completar precios</button></div><details><summary>Condiciones y nombre de archivo</summary>${field("Nombre del archivo", "rfq-filename", r.title, 'maxlength="150"')}<p>${e(r.scope)} · ${e(r.delivery)} · ${e(r.payment)} · ${e(r.validity)}</p></details><p>Precios unitarios <strong>sin IVA</strong> en ${e(r.currency)}. Editá directamente las celdas. Vacío = sin cotizar; cero = precio explícito. Se resalta el menor precio disponible, sin imponer proveedor.</p>${
      state.remoteProject
        ? ""
        : `<div class="feature-toolbar">${select(
            "Agregar proveedor",
            "rfq-add-supplier",
            [
              ["", "Seleccionar…"],
              ...partners()
                .filter((p) => !v.responses.some((r) => r.supplier_id === p.id))
                .map((p) => [p.id, p.name]),
            ],
            "",
          )}<button class="btn" data-action="ops-rfq-add-provider">Agregar proveedor</button><button class="btn" data-action="ops-rfq-save-prices">Guardar precios</button><button class="btn primary" data-action="ops-rfq-distribute">Distribuir pedido</button><span role="status" aria-live="polite" data-quote-save-state class="quote-save-state ${v.dirty ? "dirty" : ""}">${v.dirty ? "Cambios sin guardar" : v.responses.length ? "Precios guardados" : ""}</span></div>`
    }<div class="quotation-matrix"><table class="data-grid"><thead><tr><th>${r.kind === "material" ? "Material" : "Tarea"}</th><th class="quote-unit">Unidad</th><th class="quote-quantity">Cantidad solicitada</th>${v.responses.map((p) => `<th class="quote-provider">${e(supplier(p.supplier_id))}<small>Precio unitario sin IVA</small>${state.remoteProject ? "" : `<button class="btn tiny" data-action="ops-rfq-remove-provider" data-id="${p.id}">Quitar proveedor</button>`}</th>`).join("")}</tr></thead><tbody>${r.items.map((row) => `<tr><td>${e(row.description)}</td><td class="quote-unit">${e(row.unit)}</td><td class="quote-quantity">${numeric(row.quantity)}<small>Pendiente de asignar: ${numeric(pending(row.id))}</small></td>${v.responses.map((p) => `<td class="${cheapest(row.id) === p.id ? "quote-best" : ""}"><input type="number" min="0" step="any" data-quote-cell data-response="${p.id}" data-row="${row.id}" value="${e(price(p, row.id) ?? "")}" aria-label="Precio sin IVA ${e(row.description)} de ${e(supplier(p.supplier_id))}" ${state.remoteProject ? "readonly" : ""}></td>`).join("")}</tr>`).join("")}<tr><th colspan="3">Subtotal cotizado sin IVA</th>${v.responses.map((p) => `<td><strong data-quote-total="${p.id}">${money(sumDecimals(r.items.filter((i) => price(p, i.id) !== null).map((i) => multiplyDecimals(i.quantity, price(p, i.id)))))}</strong><small>${p.prices.filter((x) => x.unit_price !== null).length} de ${r.items.length} cotizados</small></td>`).join("")}</tr><tr><th colspan="3">Referencia y condiciones</th>${v.responses.map((p) => `<td><input data-response-term="reference" data-response="${p.id}" value="${e(p.reference)}" placeholder="Referencia" aria-label="Referencia de ${e(supplier(p.supplier_id))}"><textarea data-response-term="terms" data-response="${p.id}" placeholder="Pago, entrega, validez" aria-label="Condiciones de ${e(supplier(p.supplier_id))}">${e(p.terms)}</textarea>${state.remoteProject ? "" : `<button class="btn" data-action="ops-rfq-distribute" data-response="${p.id}">Asignar todo a este proveedor</button>`}</td>`).join("")}</tr><tr><th colspan="3">Presupuestos adjuntos / importar precios</th>${v.responses
      .map(
        (p) =>
          `<td>${v.files
            .filter((f) => f.response_id === p.id)
            .map(
              (f) =>
                `<button class="btn tiny" data-action="ops-rfq-open-file" data-id="${f.id}">${e(f.name)}</button>`,
            )
            .join(
              "",
            )}${state.remoteProject ? "" : `<label class="attachment-picker">Adjuntar PDF / imagen<input type="file" data-quote-attachment="${p.id}" accept="application/pdf,image/png,image/jpeg,image/webp"></label><label class="attachment-picker">Importar respuesta XLSX<input type="file" data-quote-import="${p.id}" accept=".xlsx"></label>`}</td>`,
      )
      .join("")}</tr></tbody></table></div>`;
  }
  function orders() {
    const material = kind() === "material";
    return `<section class="workflow-card"><div class="feature-toolbar"><h2>${material ? "Pedidos a proveedores" : "Subcontratos adjudicados"}</h2>${material && !state.remoteProject ? '<button class="btn" data-action="ops-stock-declare">Declarar acopio existente</button>' : ""}</div><p>${material ? "Pago y entrega se siguen por separado. El pago cubre el acopio en proveedor; las recepciones parciales lo trasladan a obra." : "Los certificados aprobados reconocen el avance y el saldo por pagar del contratista."} Los importes adjudicados son sin IVA; los comprobantes fiscales y su conciliación se administran en Finanzas.</p><table class="data-grid"><thead><tr><th>Pedido / proveedor</th><th>Importe sin IVA</th><th>Pago</th><th>${material ? "Entrega" : "Avance"}</th><th></th></tr></thead><tbody>${v.orders.map((o) => `<tr><td>${e(o.document.number)} · ${e(supplier(o.document.partner_id))}<details><summary>${o.lines.length} ${material ? "materiales" : "tareas"}</summary>${o.lines.map((l) => `<div class="order-line-item"><p>${e(l.description)}</p><div class="order-item-prices"><span>Cantidad: <b>${numeric(l.quantity)}</b></span><span>Unitario sin IVA: <b>${e(o.document.currency)} ${money(l.unit_price)}</b></span><span>Subtotal sin IVA: <b>${e(o.document.currency)} ${money(multiplyDecimals(l.quantity, l.unit_price))}</b></span></div><p class="order-item-delivery">${numeric(l.received)} ${material ? "recibidos" : "certificados"} · Pendiente: ${numeric(l.remaining)}${material ? `<small>Acopio en proveedor: ${numeric(l.vendor_stock || "0")} · Entrega solicitada: ${numeric(l.requested || "0")}</small>` : ""}</p></div>`).join("")}</details></td><td>${e(o.document.currency)} ${money(o.document.amount)}</td><td>${e(o.payment_state)}<small>Cubierto: ${money(o.paid)} · Pendiente: ${money(o.pending_payment)}${o.cash_paid != null ? `<br>Pagos registrados: ${money(o.cash_paid)}` : ""}${Number(o.supplier_credit) > 0 ? `<br>Saldo a favor en proveedor: ${money(o.supplier_credit)}` : ""}</small></td><td>${e(o.delivery_state)}${(o.files || []).map((f) => `<button class="btn tiny" data-action="ops-rfq-proof-open" data-id="${f.id}" title="${e(f.date || "")} · ${e(f.document_number || "Comprobante")}">${e(f.document_number || "")} · ${e(f.name)}</button>`).join("")}</td><td>${state.remoteProject ? (material ? "" : `<button class="btn" data-action="ops-cert-contract" data-contract="${o.document.id}">Ver certificados</button>`) : material ? `<button class="btn" data-action="ops-rfq-receive" data-id="${o.document.id}" ${o.delivery_state === "Completa" ? "disabled" : ""}>Registrar entrega</button><button class="btn" data-action="ops-rfq-pay" data-id="${o.document.id}" ${Number(o.pending_payment) <= 0 ? "disabled" : ""}>Registrar pago</button><button class="btn" data-action="ops-rfq-movement" data-kind="edit" data-id="${o.document.id}" ${o.editable ? "" : "disabled"} title="Solo se edita antes de registrar movimientos">Editar pedido</button><button class="btn" data-action="ops-rfq-movement" data-kind="request" data-id="${o.document.id}">Solicitar entrega</button><button class="btn" data-action="ops-rfq-movement" data-kind="release" data-id="${o.document.id}">Canjear materiales</button>${Number(o.supplier_credit) > 0 && Number(o.pending_payment) > 0 ? `<button class="btn" data-action="ops-rfq-movement" data-kind="apply" data-id="${o.document.id}">Aplicar saldo (${money(o.supplier_credit)})</button>` : ""}<button class="btn" data-action="ops-rfq-movement" data-kind="history" data-id="${o.document.id}">Historial</button>` : `<button class="btn" data-action="ops-cert-contract" data-contract="${o.document.id}">Certificar avances / pagos</button><button class="btn" data-action="ops-rfq-movement" data-kind="scope" data-id="${o.document.id}">Reducir / dar de baja</button><button class="btn" data-action="ops-rfq-movement" data-kind="history" data-id="${o.document.id}">Historial</button>`}</td></tr>`).join("") || '<tr><td colspan="5">Al distribuir una solicitud aparecerán aquí los pedidos adjudicados.</td></tr>'}</tbody></table>${material && model.stock.length ? `<details><summary>Material recibido en obra</summary><table class="data-grid"><thead><tr><th>Material</th><th>Cantidad</th></tr></thead><tbody>${model.stock.map((s) => `<tr><td>${e(state.resources.find((r) => r.id === s.resource_id)?.description || "Material")}</td><td>${numeric(s.quantity)}</td></tr>`).join("")}</tbody></table></details>` : ""}</section>`;
  }
  function sourceRows(rows, selected, needed = false) {
    return rows
      .map((s) => {
        const need = model.report?.needs?.find((n) => n.resource_id === s.id);
        const suggested = needed
          ? String(
              Math.max(
                0,
                (Number(need.shortage) || 0) -
                  Math.max(0, Number(need.ordered) - Number(need.received)),
              ),
            )
          : s.quantity || "1";
        return `<label class="rfq-select ${needed ? "required-material" : ""}" data-request-source="${s.id}"><input type="checkbox" ${selected.has(s.id) ? "checked" : ""}><span>${e(s.code || "")} · ${e(s.description || s.name)} · ${e(s.unit)}${needed ? `<small>Necesario: ${numeric(need.required)} · Acopio: ${numeric(need.stock)} · Comprado: ${numeric(need.ordered)} · Sugerido a pedir: ${numeric(suggested)}</small>` : ""}</span><input aria-label="Cantidad ${e(s.description || s.name)}" type="number" min="0" ${v.kind === "work" ? `max="${s.quantity}"` : ""} step="any" value="${e(selected.get(s.id)?.quantity || suggested)}"></label>`;
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
        model.report?.needs?.some(
          (n) => n.resource_id === s.id && Number(n.required) > 0,
        ),
      );
    return `<section class="workflow-editor" role="dialog" aria-modal="true" aria-label="Solicitud de cotización"><form id="quotation-request-form"><div class="feature-toolbar"><h2>${v.editRevision !== null ? "Editar solicitud" : v.kind === "material" ? "Cotizar materiales" : "Cotizar subcontratos"}</h2><button type="button" class="btn" data-action="ops-rfq-close">Cancelar</button><button type="submit" class="btn primary">${v.editRevision !== null ? "Guardar cambios" : "Guardar solicitud"}</button></div><div class="workflow-grid">${field("Nombre de la solicitud", "title", r.title, 'required maxlength="150"')}${select(
      "Moneda",
      "currency",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      r.currency,
    )}${select("Destinatario (opcional)", "partner_id", [["", "Sin destinatario"], ...partners().map((p) => [p.id, p.name])], r.partner_id)}${field("Alcance", "scope", r.scope, 'required maxlength="4000"')}${field("Entrega / plazo", "delivery", r.delivery)}${field("Condiciones de pago", "payment", r.payment)}${field("Validez solicitada", "validity", r.validity)}</div><p>Todos los precios se solicitarán por unidad y sin IVA. ${v.editRevision !== null ? "Los materiales ya adjudicados no pueden quitarse ni reducirse por debajo de lo pedido." : ""}</p>${field("Buscar materiales / tareas", "rfq-query", v.query, 'type="search"')}<button type="button" class="btn" data-action="ops-rfq-filter">Buscar</button><div class="workflow-scroll">${
      v.kind === "material"
        ? `<h3>Materiales necesarios para esta obra</h3>${sourceRows(needed, chosen, true) || "<p>Sin materiales calculados para esta selección. Vinculá ACU a las partidas para obtener necesidades.</p>"}<details open><summary>Otros materiales del catálogo</summary>${sourceRows(
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
    return `<section class="workflow-editor" role="dialog" aria-modal="true" aria-label="Distribuir pedido"><form id="quotation-award-form"><div class="feature-toolbar"><h2>${work ? "Adjudicar subcontratos" : "Distribuir pedido"}</h2><button class="btn" type="button" data-action="ops-rfq-award-close">Cancelar</button><button class="btn primary" type="submit">Confirmar adjudicación</button></div><p>Se sugiere el menor precio unitario sin IVA. Podés elegir otro proveedor y adjudicar una cantidad parcial; el resto seguirá pendiente.</p>${field("Fecha prevista de pago", "due_date", dateToday(), 'type="date" required')}<table class="data-grid"><thead><tr><th>Pedir</th><th>${work ? "Tarea" : "Material"}</th><th>Cantidad</th><th>Proveedor / precio unitario sin IVA</th><th>Subtotal sin IVA</th></tr></thead><tbody>${r.items
      .filter((row) => Number(pending(row.id)) > 0)
      .map((row) => {
        const c = v.award.choices.find((c) => c.row_id === row.id),
          options = v.responses.filter((p) => price(p, row.id) !== null);
        return `<tr data-award-row="${row.id}"><td><input type="checkbox" ${c.selected ? "checked" : ""} ${options.length ? "" : "disabled"}></td><td>${e(row.description)} · ${e(row.unit)}</td><td><input aria-label="Cantidad a adjudicar ${e(row.description)}" type="number" min="0.000001" max="${pending(row.id)}" step="any" value="${e(c.quantity)}"></td><td><select aria-label="Proveedor para ${e(row.description)}"><option value="">Seleccionar…</option>${options.map((p) => `<option value="${p.id}" ${p.id === c.response_id ? "selected" : ""}>${e(supplier(p.supplier_id))} · ${money(price(p, row.id))}${cheapest(row.id) === p.id ? " · Menor precio" : ""}</option>`).join("")}</select></td><td data-award-subtotal="${row.id}">${
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
            : "Sin cotizar"
        }</td></tr>`;
      })
      .join("")}</tbody></table>${
      work
        ? `<h3>Condiciones del subcontrato</h3><div class="workflow-grid">${field("Alcance contratado", "contract_scope", r.scope, "required")}${select(
            "Modalidad de liquidación",
            "method",
            [
              ["quantity", "Por cantidades ejecutadas"],
              ["percent", "Por avance porcentual"],
              ["fixed", "Importe fijo por período"],
              ["daily", "Por jornada"],
              ["hourly", "Por hora"],
            ],
            "quantity",
          )}${select(
            "Frecuencia de pago",
            "frequency",
            [
              ["weekly", "Semanal (viernes)"],
              ["fortnight", "Quincenal"],
              ["monthly", "Mensual"],
              ["by_progress", "Al certificar avance"],
            ],
            "weekly",
          )}${field("Tarifa por período / jornada / hora", "rate", "0", 'type="number" min="0" step="any"')}${field("Tope total para tarifa fija o por tiempo", "ceiling", "0", 'type="number" min="0" step="any"')}${field("Jornadas / horas estimadas por pago", "forecast_units", "1", 'type="number" min="0" step="any"')}${field("Inicio contratado", "contract_start", "", 'type="date"')}${field("Fin contratado", "contract_end", "", 'type="date"')}${field("Demora de pago (días)", "payment_delay_days", "0", 'type="number" min="0" max="365"')}${field("Recuperación de anticipo %", "advance_recovery_percent", "0", 'type="number" min="0" max="100" step="any"')}${field("Fondo de reparo %", "retention_percent", "0", 'type="number" min="0" max="100" step="any"')}</div><label><input type="checkbox" name="contributes_progress" checked> Aporta ejecución física (desmarcar apoyos, alquileres y servicios)</label>`
        : ""
    }</form></section>`;
  }
  function receiveEditor() {
    if (!v.receive) return "";
    return `<section class="workflow-editor compact-editor" role="dialog" aria-modal="true" aria-label="Registrar entrega"><form id="quotation-receive-form"><h2>Registrar entrega · ${e(v.receive.document.number)}</h2><p>Ingresá solo las cantidades recibidas ahora. Las pendientes se conservan y lo recibido se incorpora al acopio de esta obra.</p>${v.receive.lines
      .filter((l) => Number(l.remaining) > 0)
      .map(
        (l) =>
          `<div class="feature-toolbar">${field(l.description + " · Pendiente " + numeric(l.remaining), l.source_id, "0", `type="number" min="0" max="${l.remaining}" step="any"`)}</div>`,
      )
      .join(
        "",
      )}<label>Remito firmado (opcional)<input type="file" name="proof" accept="application/pdf,image/png,image/jpeg,image/webp"></label><button class="btn primary" type="submit">Confirmar recepción</button><button class="btn" type="button" data-action="ops-rfq-receive-close">Cancelar</button></form></section>`;
  }
  function paymentEditor() {
    if (!v.payment) return "";
    return `<section class="workflow-editor compact-editor" role="dialog" aria-modal="true" aria-label="Registrar pago"><form id="quotation-payment-form"><h2>Registrar pago · ${e(v.payment.document.number)}</h2><p>Saldo del pedido sin IVA: ${money(v.payment.pending_payment)}. Si ya registraste una factura, aplicá el pago desde Finanzas para conciliarla.</p>${field("Importe pagado", "amount", v.payment.pending_payment, `type="number" min="0.000001" max="${v.payment.pending_payment}" step="any" required`)}${field("Fecha del pago", "date", dateToday(), 'type="date" required')}<label>Recibo de pago (opcional)<input type="file" name="proof" accept="application/pdf,image/png,image/jpeg,image/webp"></label><button class="btn primary" type="submit">Registrar pago</button><button class="btn" type="button" data-action="ops-rfq-pay-close">Cancelar</button></form></section>`;
  }
  const movementTitles = {
    edit: "Editar pedido",
    reserve: "Acopio en proveedor",
    request: "Solicitar entrega",
    release: "Canjear materiales / generar saldo",
    apply: "Aplicar saldo a favor",
    history: "Historial del pedido",
    scope: "Reducir o dar de baja el subcontrato",
  };
  function movementEditor() {
    const m = v.movement;
    if (!m) return "";
    const o = m.order;
    return `<section class="workflow-editor compact-editor" role="dialog" aria-modal="true" aria-label="${movementTitles[m.kind]}"><form id="supplier-movement-form"><h2>${movementTitles[m.kind]} · ${e(o.document.number)}</h2><button type="button" class="btn" data-action="ops-rfq-movement-close">Cerrar</button>${
      m.kind === "scope"
        ? `<p>Conservá la cantidad ya certificada. Reducí el total contratado o usá «Dar de baja el trabajo pendiente» para liberar todo lo restante y adjudicarlo a otro contratista.</p><button class="btn" type="button" data-action="ops-rfq-scope-cancel">Dar de baja el trabajo pendiente</button>${o.lines.map((l) => field(l.description + " · Certificado " + numeric(l.received), "q:" + l.source_id, l.quantity, `type="number" min="${l.received}" max="${l.quantity}" step="any" required`)).join("")}`
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
                .join("") || "Sin modificaciones posteriores al pedido."
            }</ol>`
          : m.kind === "edit"
            ? `${select(
                "Proveedor",
                "partner_id",
                partners().map((p) => [p.id, p.name]),
                o.document.partner_id,
              )}${field("Fecha prevista de pago", "due_date", o.document.due_date, 'type="date" required')}<div>${m.lines
                .map(
                  (l, i) =>
                    `<div class="movement-edit-row" data-movement-row="${i}">${select(
                      "Material",
                      "resource_id",
                      state.resources
                        .filter(
                          (r) => String(r.kind).toLowerCase() === "material",
                        )
                        .map((r) => [r.id, r.description]),
                      l.resource_id,
                    )}${field("Cantidad", "quantity", l.quantity, 'type="number" min="0.000001" step="any" required')}${field("Precio unitario sin IVA", "unit_price", l.unit_price, 'type="number" min="0" step="any" required')}<button class="btn" type="button" data-action="ops-rfq-movement-remove" data-index="${i}">Quitar</button></div>`,
                )
                .join(
                  "",
                )}</div><button class="btn" type="button" data-action="ops-rfq-movement-add">Agregar material</button>`
            : m.kind === "apply"
              ? `<p>Saldo disponible en este proveedor y moneda: ${money(o.supplier_credit)}. Se aplica sin generar un nuevo pago.</p>${field("Saldo a aplicar", "amount", String(Math.min(Number(o.supplier_credit), Number(o.pending_payment))), 'type="number" min="0.000001" step="any" required')}`
              : `<p>${m.kind === "reserve" ? "Registrá las cantidades pagadas que el proveedor confirma tener reservadas para esta obra." : m.kind === "request" ? "Indicá cuánto del acopio en proveedor pedís que sea enviado a la obra. La recepción se registra por separado." : "Solo se cancelan cantidades no entregadas. El pago original se conserva y el importe reconocido queda como saldo para otros materiales del mismo proveedor y moneda."}</p>${o.lines
                  .filter((l) => Number(l.remaining) > 0)
                  .map((l) =>
                    field(
                      l.description +
                        " · Pendiente " +
                        numeric(l.remaining) +
                        " · En proveedor " +
                        numeric(l.vendor_stock || "0"),
                      "q:" + l.source_id,
                      "0",
                      'type="number" min="0" step="any"',
                    ),
                  )
                  .join(
                    "",
                  )}${m.kind === "release" ? field("Saldo reconocido por el proveedor (sin IVA)", "amount", "0", 'type="number" min="0" step="any" required') : ""}`
    }${m.kind !== "history" ? `<label>Motivo / referencia<textarea name="reason" maxlength="2000" ${["release", "scope"].includes(m.kind) ? "required" : ""}></textarea></label>${m.kind === "scope" ? "" : '<label>Comprobante (opcional)<input type="file" name="proof" accept="application/pdf,image/png,image/jpeg,image/webp"></label>'}<button class="btn primary" type="submit">Confirmar</button>` : ""}</form></section>`;
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
      throw new Error("Máximo 10 MB por comprobante");
    return {
      name: file.name,
      content: [...new Uint8Array(await file.arrayBuffer())],
    };
  }
  async function act(b) {
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
      v.editRevision = saved.revision;
      v.query = "";
      v.dirty = false;
    }
    if (a === "ops-rfq-remove-provider") {
      if (!(await protect())) return true;
      const response = v.responses.find((r) => r.id === b.dataset.id);
      if (
        !window.confirm(
          "¿Quitar este proveedor de la comparativa? Sus pedidos adjudicados, precios históricos y adjuntos se conservarán.",
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
    if (a === "ops-rfq-add-provider") {
      const id = document.querySelector('[name="rfq-add-supplier"]').value;
      if (!id) throw new Error("Elegí un proveedor");
      if (v.responses.some((r) => r.supplier_id === id))
        throw new Error("El proveedor ya está agregado");
      v.responses.push(
        await invoke("add_quote_supplier", {
          requestId: v.selected.id,
          supplierId: id,
        }),
      );
    }
    if (a === "ops-rfq-save-prices") {
      await saveResponses();
      state.message = "Precios unitarios sin IVA guardados.";
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
        throw new Error("Máximo 10 MB por adjunto");
      await saveResponses();
      await invoke("attach_quote_file", {
        responseId: t.dataset.quoteAttachment,
        name: file.name,
        content: [...new Uint8Array(await file.arrayBuffer())],
      });
      v.files = await invoke("list_quote_files", { requestId: v.selected.id });
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
          throw new Error("La planilla contiene renglones de otro pedido");
        Object.assign(existing, p);
      }
      v.dirty = true;
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
          : "Sin cotizar";
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
        throw new Error("Seleccioná materiales o tareas para adjudicar");
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
        "Adjudicación confirmada. Los precios del presupuesto no cambiaron.";
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
      state.message = "Movimiento del proveedor registrado.";
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
    readRequest();
    readResponses();
    if (!v.dirty) return true;
    if (v.guardOpen) return false;
    if (v.request || v.movement || v.receive || v.payment) {
      if (!window.confirm("¿Descartar los cambios del formulario sin guardar?"))
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
      status.textContent = v.dirty
        ? "Cambios sin guardar"
        : "Precios guardados";
      status.classList.toggle("dirty", v.dirty);
    }
  }

  return {
    v,
    load,
    markup,
    act,
    change,
    submit,
    protect,
    input: (t) => {
      if (
        t.closest?.(
          "#quotation-request-form,#supplier-movement-form,#quotation-receive-form,#quotation-payment-form",
        ) ||
        t.matches?.("[data-quote-cell],[data-response-term]")
      ) {
        v.dirty = true;
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
