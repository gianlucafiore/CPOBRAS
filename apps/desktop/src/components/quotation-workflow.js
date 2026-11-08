import { e, field, select, dateToday } from "./helpers.js";
import { numeric, money } from "../decimal.js";
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
    preview: null,
    dirty: false,
  };
  async function load() {
    v.requests = await invoke("list_quotation_requests", {
      projectId: model.projectId,
    });
    v.request = null;
    v.selected = null;
    v.preview = null;
    v.dirty = false;
  }
  function read() {
    const form = document.querySelector("#quotation-request-form");
    if (!form || !v.request) return;
    const f = new FormData(form);
    for (const k of [
      "title",
      "scope",
      "delivery",
      "payment",
      "validity",
      "taxes",
      "currency",
    ])
      v.request[k] = String(f.get(k) || "").trim();
    v.request.partner_id = f.get("partner_id") || null;
    const selected = new Map(v.request.items.map((i) => [i.source_id, i]));
    for (const row of form.querySelectorAll("[data-request-source]")) {
      const id = row.dataset.requestSource;
      if (row.querySelector("input[type=checkbox]").checked) {
        const source = sources().find((r) => r.id === id);
        selected.set(id, {
          ...(selected.get(id) || {
            id: window.crypto.randomUUID(),
            source_id: id,
            code: source.code || "",
            description: source.description || source.name,
            unit: source.unit,
          }),
          quantity: row.querySelector("input[type=number]").value || "1",
        });
      } else selected.delete(id);
    }
    v.request.items = [...selected.values()];
  }
  const sources = () =>
    v.kind === "material"
      ? state.resources.filter((r) => !r.archived)
      : model.lines.filter((l) => !l.archived);
  function markup() {
    return (
      `<section class="workflow-card"><div class="feature-toolbar"><h2>Solicitudes de cotización</h2>${state.remoteProject ? "" : '<button class="btn" data-action="ops-rfq-new" data-kind="material">Pedir materiales</button><button class="btn" data-action="ops-rfq-new" data-kind="work">Pedir trabajos a contratistas</button>'}</div><p>Seleccioná insumos o partidas para armar pedidos separados por especialidad. Los PDF y planillas no muestran tus costos internos. Las respuestas crean cotizaciones, sin modificar el presupuesto.</p><table class="data-grid"><thead><tr><th>Solicitud</th><th>Tipo</th><th>Fecha</th><th>Ítems</th><th></th></tr></thead><tbody>${v.requests.map((r) => `<tr><td>${e(r.title)} · ${e(r.number)}</td><td>${r.kind === "material" ? "Materiales" : "Trabajos"}</td><td>${e(r.date)}</td><td>${r.items.length}</td><td><button class="btn" data-action="ops-rfq-select" data-id="${r.id}">Exportar / cargar respuesta</button></td></tr>`).join("")}</tbody></table>${v.selected ? selected() : ""}</section>` +
      editor()
    );
  }
  function selected() {
    const r = v.selected;
    return `<section class="workflow-card"><h3>${e(r.title)}</h3>${field("Nombre del archivo", "rfq-filename", r.title, 'maxlength="150"')}<div class="feature-toolbar"><button class="btn" data-action="ops-rfq-export" data-format="pdf">PDF para enviar</button><button class="btn" data-action="ops-rfq-export" data-format="xlsx">Planilla para completar precios</button></div><p>El proveedor puede completar «Precio unitario» y «Observaciones» y reordenar filas, conservando el ID de renglón. Precios sin impuestos salvo lo indicado en las condiciones. Las celdas vacías quedan sin cotizar; cero es un precio explícito.</p>${state.remoteProject ? "" : `<div class="workflow-grid">${select("Proveedor / contratista que cotiza", "rfq-supplier", [["", "Seleccionar…"], ...model.partners.map((p) => [p.id, p.name])], "")}${field("Referencia del proveedor", "rfq-reference", "", 'maxlength="150"')}<label>Respuesta XLSX<input type="file" accept=".xlsx" data-rfq-import></label><button class="btn" data-action="ops-rfq-preview">Revisar respuesta</button></div>`}${v.preview ? `<h4>Vista previa · ${v.preview.currency} ${money(v.preview.amount)}</h4><table class="data-grid"><thead><tr><th>Descripción</th><th>Cantidad</th><th>Precio</th></tr></thead><tbody>${v.preview.lines.map((l) => `<tr><td>${e(l.description)}</td><td>${numeric(l.quantity)}</td><td>${money(l.unit_price)}</td></tr>`).join("")}</tbody></table><button class="btn primary" data-action="ops-rfq-confirm">Confirmar cotización del proveedor</button>` : ""}</section>`;
  }
  function editor() {
    if (!v.request) return "";
    const r = v.request,
      selected = new Map(r.items.map((i) => [i.source_id, i]));
    return `<section class="workflow-editor" role="dialog" aria-modal="true" aria-label="Solicitud de cotización"><form id="quotation-request-form"><div class="feature-toolbar"><h2>${v.kind === "material" ? "Cotizar materiales" : "Cotizar trabajos"}</h2><button type="button" class="btn" data-action="ops-rfq-close">Cancelar</button><button type="submit" class="btn primary">Guardar solicitud</button></div><div class="workflow-grid">${field("Nombre (ej. Corralón, Sanitarios, Pintores)", "title", r.title, 'required maxlength="150"')}${select(
      "Moneda",
      "currency",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      r.currency,
    )}${select("Destinatario (opcional)", "partner_id", [["", "Sin destinatario"], ...model.partners.map((p) => [p.id, p.name])], r.partner_id)}${field("Alcance: mano de obra / provisión / ejecución", "scope", r.scope, 'required maxlength="4000"')}${field("Entrega / plazo", "delivery", r.delivery)}${field("Condiciones de pago", "payment", r.payment)}${field("Validez solicitada", "validity", r.validity)}${field("Tratamiento de impuestos", "taxes", r.taxes)}</div>${field("Buscar insumos / tareas", "rfq-query", v.query, 'type="search"')}<button type="button" class="btn" data-action="ops-rfq-filter">Buscar</button><div class="workflow-scroll">${sources()
      .filter((s) =>
        (s.description || s.name || "")
          .toLowerCase()
          .includes(v.query.toLowerCase()),
      )
      .map(
        (s) =>
          `<label class="rfq-select" data-request-source="${s.id}"><input type="checkbox" ${selected.has(s.id) ? "checked" : ""}><span>${e(s.code || "")} · ${e(s.description || s.name)} · ${e(s.unit)}</span><input aria-label="Cantidad ${e(s.description || s.name)}" type="number" min="0.000001" ${v.kind === "work" ? `max="${s.quantity}"` : ""} step="any" value="${e(selected.get(s.id)?.quantity || s.quantity || "1")}"></label>`,
      )
      .join("")}</div></form></section>`;
  }
  async function act(b) {
    const a = b.dataset.action;
    if (!a.startsWith("ops-rfq-")) return false;
    read();
    if (a === "ops-rfq-new") {
      if (state.remoteProject) throw new Error("Solo lectura");
      v.kind = b.dataset.kind;
      v.query = "";
      v.request = {
        id: window.crypto.randomUUID(),
        project_id: model.projectId,
        estimate_id: v.kind === "work" ? model.estimateId : null,
        kind: v.kind,
        title: "",
        number: "",
        date: dateToday(),
        currency:
          model.estimates.find((x) => x.id === model.estimateId)?.currency ===
          "Usd"
            ? "USD"
            : "ARS",
        partner_id: null,
        scope: v.kind === "work" ? "Mano de obra" : "Provisión de materiales",
        delivery: "",
        payment: "",
        validity: "",
        taxes: "Precios sin IVA; indicar alícuota y total por separado",
        items: [],
      };
    }
    if (a === "ops-rfq-filter")
      v.query = document.querySelector('[name="rfq-query"]').value;
    if (a === "ops-rfq-close") {
      if (v.dirty && !window.confirm("¿Descartar la solicitud sin guardar?"))
        return true;
      v.request = null;
      v.dirty = false;
    }
    if (a === "ops-rfq-select") {
      v.selected = v.requests.find((r) => r.id === b.dataset.id);
      v.preview = null;
    }
    if (a === "ops-rfq-export")
      model.lastExport = await exportRequest(
        invoke,
        v.selected,
        b.dataset.format,
        document.querySelector('[name="rfq-filename"]').value,
      );
    if (a === "ops-rfq-preview") {
      const file = document.querySelector("[data-rfq-import]").files[0];
      if (!file) throw new Error("Seleccioná la respuesta XLSX");
      const supplierId = document.querySelector('[name="rfq-supplier"]').value;
      if (!supplierId) throw new Error("Elegí quién cotiza");
      const prices = await readQuotedFile(file);
      v.preview = await invoke("preview_quotation_import", {
        requestId: v.selected.id,
        supplierId,
        prices,
        importId: window.crypto.randomUUID(),
        date: dateToday(),
        reference: document.querySelector('[name="rfq-reference"]').value,
      });
    }
    if (a === "ops-rfq-confirm") {
      if (!v.preview) throw new Error("Revisá la respuesta primero");
      await invoke("post_operation", { operation: v.preview });
      v.preview = null;
      await refresh();
      state.message =
        "Cotización registrada; los precios del presupuesto no cambiaron.";
    }
    render();
    return true;
  }
  return {
    load,
    markup,
    act,
    submit: async () => {
      read();
      v.selected = await invoke("create_quotation_request", {
        request: v.request,
      });
      v.request = null;
      v.dirty = false;
      await refresh();
      v.requests = await invoke("list_quotation_requests", {
        projectId: model.projectId,
      });
      render();
    },
    input: (t) => {
      if (t.closest?.("#quotation-request-form")) v.dirty = true;
    },
    protect: () =>
      !v.dirty || window.confirm("¿Descartar la solicitud sin guardar?"),
  };
}
