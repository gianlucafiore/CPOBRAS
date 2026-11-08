import { e, field, select } from "./helpers.js";
import { money, numeric } from "../decimal.js";
import { exportPriceDetermination } from "../services/price-export.js";
const kinds = [
  ["detailed", "Con detalle"],
  ["percent_direct", "% costo directo"],
  ["percent_subtotal", "% subtotal acumulado"],
  ["percent_profit", "% utilidad anterior"],
  ["fixed", "Monto fijo"],
  ["subtotal", "Separador / subtotal"],
];
const roles = [
  ["overhead", "Gastos generales"],
  ["finance", "Gastos financieros"],
  ["profit", "Beneficio / utilidad"],
  ["discount", "Descuento"],
  ["tax", "Impuestos"],
  ["other", "Otros cargos"],
];
export function createPriceDetermination({
  invoke,
  state,
  render,
  loadEstimate,
  editable,
  currentEstimate,
  document,
  window,
  FormData,
}) {
  const m = {
    definition: { rows: [] },
    calculation: null,
    direct: "0",
    revision: 0,
    selectedId: null,
    dirty: false,
    error: "",
    templates: [],
    templateId: "",
    modal: null,
    focus: null,
    drag: null,
    sequence: 0,
    busy: false,
    timer: null,
    lastExport: "",
  };
  const selected = () => m.definition.rows.find((r) => r.id === m.selectedId);
  const result = (id) => m.calculation?.rows.find((r) => r.id === id);
  const lock = () => (!editable() ? "disabled" : "");
  function newRow(kind) {
    return {
      id: window.crypto.randomUUID(),
      label:
        kind === "subtotal"
          ? "Subtotal"
          : kind === "detailed"
            ? "Nuevo concepto detallado"
            : kind === "fixed"
              ? "Monto fijo"
              : "Nuevo porcentaje",
      enabled: true,
      kind,
      role: "other",
      subtract: false,
      percent: "0",
      amount: "0",
      detail_mode: "items",
      reference_percent: "0",
      items: [],
    };
  }
  function cloneDefinition(definition) {
    const copy = structuredClone(definition);
    for (const row of copy.rows) {
      row.id = window.crypto.randomUUID();
      const ids = new Map(
        row.items.map((i) => [i.id, window.crypto.randomUUID()]),
      );
      for (const item of row.items) {
        item.id = ids.get(item.id);
        item.parent_id = item.parent_id ? ids.get(item.parent_id) : null;
      }
    }
    return copy;
  }
  function previewState() {
    state.pricePreview = {
      total: m.calculation?.breakdown.total ?? null,
      error: m.error,
      dirty: m.dirty,
    };
  }
  function capture() {
    const active = document.activeElement;
    if (active?.name && active.closest?.(".price-workspace"))
      m.focus = { name: active.name, start: active.selectionStart };
  }
  function redraw() {
    capture();
    previewState();
    render();
  }
  function afterRender() {
    if (m.focus) {
      const input = document.querySelector(`[name="${m.focus.name}"]`);
      input?.focus();
      if (m.focus.start != null && input?.type !== "number")
        input?.setSelectionRange?.(m.focus.start, m.focus.start);
      m.focus = null;
    }
  }
  async function preview() {
    if (m.timer) {
      window.clearTimeout(m.timer);
      m.timer = null;
    }
    const seq = ++m.sequence;
    try {
      const calculation = await invoke("calculate_price_definition", {
        estimateId: state.estimateId,
        definition: m.definition,
      });
      if (seq !== m.sequence) return;
      m.calculation = calculation;
      m.direct = calculation.breakdown.direct;
      m.error = "";
    } catch (error) {
      if (seq !== m.sequence) return;
      m.calculation = null;
      m.error = String(error);
    }
    if (!m.modal && state.view === "price-determination") redraw();
  }
  function schedule() {
    if (m.timer) window.clearTimeout(m.timer);
    m.timer = window.setTimeout(() => preview(), 250);
  }
  function leave() {
    if (m.busy || state.busy) return false;
    if (m.modal) {
      if (!closeModal()) return false;
    }
    if (
      m.dirty &&
      !window.confirm(
        "Tenés cambios sin guardar en Determinación de precio. ¿Descartarlos?",
      )
    )
      return false;
    if (m.timer) window.clearTimeout(m.timer);
    m.sequence++;
    m.dirty = false;
    state.pricePreview = null;
    return true;
  }
  function closeModal() {
    if (state.busy || m.busy) return false;
    if (
      m.modal?.dirty &&
      !window.confirm(
        "Tenés cambios sin guardar en esta ventana. ¿Descartarlos?",
      )
    )
      return false;
    m.modal = null;
    redraw();
    return true;
  }
  function rowEditor() {
    const row = selected();
    if (!row)
      return '<div class="blank-state"><strong>Seleccioná una línea</strong><p>Podés agregar un concepto, porcentaje o subtotal desde la lista.</p></div>';
    const calculated = result(row.id);
    return `<div class="price-detail-heading"><h2>${e(row.label)}</h2><strong>${m.calculation ? money(calculated?.amount) : "—"}</strong></div><fieldset class="price-properties" ${lock()}><div class="form-grid">${select("Tipo de cálculo", "price-kind", kinds, row.kind)}${select("Categoría del concepto", "price-role", roles, row.role)}${select(
      "Operación",
      "price-sign",
      [
        ["false", "Sumar"],
        ["true", "Restar"],
      ],
      String(row.subtract),
    )}${row.kind === "detailed" ? field("Referencia % del costo directo", "price-reference", row.reference_percent, 'type="number" min="0" step="any" ' + lock()) : ""}</div><p class="small-muted">La categoría Beneficio define la base de «% utilidad anterior». El subtotal es el acumulado inmediatamente anterior; los separadores no suman cargos.</p></fieldset>${row.kind === "detailed" ? `<div class="work-toolbar"><button class="btn ${row.detail_mode === "items" ? "primary" : ""}" data-action="price-mode" data-mode="items" ${lock()}>Con detalle</button><button class="btn ${row.detail_mode === "manual" ? "primary" : ""}" data-action="price-mode" data-mode="manual" ${lock()}>Monto manual</button><button class="btn ${row.detail_mode === "reference" ? "primary" : ""}" data-action="price-mode" data-mode="reference" ${lock()}>% CD de referencia</button><span class="grow"></span><button class="btn" data-action="price-add-group" ${lock()}>＋ Grupo</button><button class="btn" data-action="price-add-item" ${lock()}>＋ Ítem</button></div>${row.detail_mode === "manual" ? field("Monto manual del concepto", "price-manual", row.amount, 'type="number" min="0" step="any" ' + lock()) : ""}${row.detail_mode === "reference" ? `<p class="context-help">Se aplica ${numeric(row.reference_percent)}% del costo directo. El detalle se conserva y no se suma en este modo.</p>` : ""}${details(row)}<div class="price-detail-totals"><span>Total del detalle: <b>${calculated ? money(calculated.detail_total) : "—"}</b></span><span>Referencia ${numeric(row.reference_percent)}% CD: <b>${calculated ? money(calculated.reference_total) : "—"}</b></span><span>Aplicado: <b>${calculated ? money(calculated.amount) : "—"}</b></span></div>` : row.kind === "subtotal" ? '<p class="context-help">Esta línea muestra el acumulado a esta altura de la determinación. No vuelve a sumarlo.</p>' : `<p class="context-help">Base de cálculo: ${calculated ? money(calculated.base) : "—"}. Importe aplicado: ${calculated ? money(calculated.amount) : "—"}.</p>`}`;
  }
  function details(row) {
    const calculation = result(row.id);
    const renderChildren = (parent, depth = 0) => {
      if (depth > 100) return "";
      return row.items
        .filter((i) => i.parent_id === parent)
        .map(
          (item) =>
            `<tr class="price-item-row ${item.group ? "price-group" : ""}" data-price-item="${item.id}"><td style="padding-left:${12 + depth * 18}px">${item.group ? "▾ " : ""}${e(item.description)}${item.periodic ? `<small class="muted"> · Alquiler mensual · ${e(item.periodic.start)} → ${e(item.periodic.end)}</small>` : ""}</td><td>${item.group ? "" : e(item.unit)}</td><td class="number">${item.group ? "" : numeric(item.participation_percent) + "%"}</td><td class="number">${item.group ? "" : numeric(item.quantity)}</td><td class="number">${item.group ? "" : money(item.unit_price)}</td><td class="number">${calculation ? money(calculation.item_totals[item.id] ?? "0") : "—"}</td><td><button class="btn tiny" data-action="price-edit-item" data-id="${item.id}" ${lock()}>Editar</button><button class="tiny-danger" data-action="price-delete-item" data-id="${item.id}" aria-label="Quitar ${e(item.description)}" ${lock()}>×</button></td></tr>${item.group ? renderChildren(item.id, depth + 1) : ""}`,
        )
        .join("");
    };
    return `<div class="price-detail-table"><table class="mini-table"><thead><tr><th>Descripción</th><th>Unidad</th><th>% participación</th><th>Cantidad</th><th>Precio</th><th>Total</th><th></th></tr></thead><tbody>${renderChildren(null) || '<tr><td colspan="7">Agregá grupos e ítems para detallar este concepto.</td></tr>'}</tbody></table></div>`;
  }
  function markup() {
    const calc = m.calculation;
    return `<main class="price-workspace"><div class="work-toolbar"><h1>Determinación de precio</h1><span class="grow"></span><button class="btn" data-action="price-back">← Presupuesto</button><button class="btn" data-action="agreement-open">Acuerdo de ajuste del presupuesto</button><button class="btn" data-action="price-reload">Recargar</button><button class="btn primary" data-action="price-save" ${lock()}>Guardar determinación</button></div><div class="price-status" role="status">${m.dirty ? "Cambios sin guardar · vista previa" : "Valores guardados"}${!editable() ? " · Presupuesto emitido" : ""}</div>${m.error ? `<p class="price-error" role="alert">${e(m.error)}</p>` : ""}<div class="price-columns"><aside class="price-left"><section class="price-card"><h2>Resumen de costos</h2><div class="summary-row"><strong>COSTO DIRECTO</strong><strong>${money(m.direct)}</strong></div>${(
      calc?.rows || []
    )
      .filter((r) => r.enabled)
      .map(
        (r) =>
          `<div class="summary-row ${r.kind === "subtotal" ? "price-subtotal" : ""}"><span>${e(r.label)}</span><strong>${money(r.amount)}</strong></div>`,
      )
      .join(
        "",
      )}<div class="summary-final"><span>PRESUPUESTO TOTAL</span><strong>${e(currentEstimate()?.currency)} ${calc ? money(calc.breakdown.total) : "—"}</strong></div></section><section class="price-card"><h2>Conceptos y orden de cálculo</h2><p class="small-muted">Arrastrá el asa para reordenar. Las flechas permiten mover cada línea.</p><div class="price-row-list">${m.definition.rows.map((row, index) => `<div class="price-row ${row.id === m.selectedId ? "selected" : ""}" data-price-row="${row.id}"><button type="button" class="price-drag" draggable="${editable()}" data-price-drag="${row.id}" aria-label="Arrastrar ${e(row.label)}" ${lock()}>⋮⋮</button><input type="checkbox" aria-label="Activar ${e(row.label)}" data-price-enabled="${row.id}" ${row.enabled ? "checked" : ""} ${lock()}><input class="price-label" name="price-label-${row.id}" data-price-label="${row.id}" aria-label="Nombre de línea ${index + 1}" value="${e(row.label)}" ${lock()}><button type="button" class="btn tiny" data-action="price-select" data-id="${row.id}">${e(row.kind === "detailed" ? { items: "Con detalle", manual: "Monto manual", reference: "% CD ref." }[row.detail_mode] : kinds.find(([kind]) => kind === row.kind)?.[1])}</button>${row.kind.startsWith("percent_") ? `<input class="price-number" name="price-percent-${row.id}" data-price-percent="${row.id}" aria-label="Porcentaje ${e(row.label)}" type="number" min="0" step="any" value="${e(row.percent)}" ${lock()}>` : row.kind === "fixed" ? `<input class="price-number" name="price-amount-${row.id}" data-price-amount="${row.id}" aria-label="Monto ${e(row.label)}" type="number" min="0" step="any" value="${e(row.amount)}" ${lock()}>` : ""}<button class="price-move" data-action="price-up" data-id="${row.id}" aria-label="Subir ${e(row.label)}" ${lock()}>↑</button><button class="price-move" data-action="price-down" data-id="${row.id}" aria-label="Bajar ${e(row.label)}" ${lock()}>↓</button><button class="tiny-danger" data-action="price-delete-row" data-id="${row.id}" aria-label="Quitar línea ${e(row.label)}" ${lock()}>×</button></div>`).join("")}</div><div class="price-add"><small>Agregar línea:</small>${kinds.map(([kind, label]) => `<button class="btn tiny" data-action="price-add-row" data-kind="${kind}" ${lock()}>${e(label)}</button>`).join("")}</div></section><section class="price-card"><h2>Plantillas y exportación</h2>${select("Plantilla de determinación o detalle", "price-template", [["", "Elegir plantilla"], ...m.templates.filter((t) => t.currency === currentEstimate()?.currency).map((t) => [t.id, (t.scope === "detail" ? "Detalle" : "Determinación") + " · " + t.name])], m.templateId)}<div class="price-add"><button class="btn" data-action="price-load-template" ${lock()}>Cargar plantilla</button><button class="btn" data-action="price-template">Guardar plantilla</button><button class="btn" data-action="price-export">Exportar</button></div>${m.lastExport ? `<p role="status">Archivo guardado en ${e(m.lastExport)}</p>` : ""}</section></aside><section class="price-right">${rowEditor()}</section></div>${modalMarkup()}</main>`;
  }
  function modalMarkup() {
    if (!m.modal) return "";
    const modal = m.modal,
      item = modal.item || {},
      row = selected();
    let title = "",
      body = "",
      form = "";
    if (modal.kind === "item") {
      title = item.group
        ? item.id
          ? "Editar grupo"
          : "Nuevo grupo"
        : item.id
          ? "Editar ítem"
          : "Nuevo ítem";
      const descendants = new Set([item.id]);
      let old = -1;
      while (old !== descendants.size) {
        old = descendants.size;
        for (const i of row.items)
          if (descendants.has(i.parent_id)) descendants.add(i.id);
      }
      body =
        field(
          "Descripción del detalle",
          "description",
          item.description || "",
          'required maxlength="500"',
        ) +
        select(
          "Grupo del detalle",
          "parentId",
          [
            ["", "Sin grupo"],
            ...row.items
              .filter((i) => i.group && !descendants.has(i.id))
              .map((i) => [i.id, i.description]),
          ],
          item.parent_id || "",
        ) +
        (item.group
          ? ""
          : `<div class="form-grid">${field("Unidad", "unit", item.unit || "un", "required")}${field("Participación %", "participation", item.participation_percent ?? "100", 'type="number" min="0" max="100" step="any" required')}${field("Cantidad del detalle", "quantity", item.quantity ?? "1", 'type="number" min="0" step="any" required')}${field("Precio del detalle " + currentEstimate()?.currency, "unitPrice", item.unit_price ?? "0", 'type="number" min="0" step="any" required')}</div><fieldset><legend>Gasto mensual / alquiler</legend><label><input type="checkbox" name="periodic" ${item.periodic ? "checked" : ""}> Calcular por período (por ejemplo, baños químicos)</label><div class="form-grid">${field("Inicio del alquiler", "rentalStart", item.periodic?.start || "", 'type="date"')}${field("Fin del alquiler", "rentalEnd", item.periodic?.end || "", 'type="date"')}${field("Día de vencimiento mensual", "paymentDay", item.periodic?.payment_day || "5", 'type="number" min="1" max="31"')}</div><label><input type="checkbox" name="prorate" ${item.periodic?.prorate !== false ? "checked" : ""}> Prorratear meses incompletos por días calendario</label></fieldset><p class="modal-help">Para alquileres: cantidad de unidades × tarifa mensual × meses × participación. El día 31 vence el último día de los meses más cortos. Las fechas son inclusivas. Sin alquiler, se aplica cantidad × precio × participación / 100.</p>`);
      form = "price-item-form";
    }
    if (modal.kind === "template") {
      title = "Guardar plantilla de Determinación de precio";
      body =
        field("Nombre de plantilla", "name", "", 'required maxlength="300"') +
        select(
          "Contenido de la plantilla",
          "scope",
          [
            ["definition", "Determinación completa"],
            ...(row?.kind === "detailed"
              ? [["detail", "Solo el detalle del concepto seleccionado"]]
              : []),
          ],
          "definition",
        );
      form = "price-template-form";
    }
    if (modal.kind === "export") {
      title = "Exportar Determinación de precio";
      body =
        select("Formato de exportación", "format", [
          ["xlsx", "Excel (.xlsx)"],
          ["pdf", "PDF"],
          ["csv", "CSV"],
          ["json", "JSON"],
        ]) +
        select("Contenido a exportar", "scope", [
          ["definition", "Determinación completa"],
          ["detail", "Concepto seleccionado y su detalle"],
        ]);
      form = "price-export-form";
    }
    return `<div class="modal-overlay price-modal"><section class="dialog-shell" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="dialog-header"><h2>${e(title)}</h2><button type="button" class="close-dialog" data-action="price-close-modal" aria-label="Cerrar ventana">×</button></div><form id="${form}" class="dialog-body">${body}<p class="feature-error modal-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn" data-action="price-close-modal">Cerrar</button><button type="submit" class="btn primary">${modal.kind === "export" ? "Exportar" : "Guardar"}</button></div></form></section></div>`;
  }
  async function open() {
    if (!state.estimateId) throw new Error("Abrí un presupuesto");
    const saved = await invoke("get_price_definition", {
      estimateId: state.estimateId,
    });
    m.definition = saved.definition;
    m.revision = saved.revision;
    m.direct = saved.direct;
    m.calculation = saved.calculation;
    m.error = saved.calculation_error || "";
    m.selectedId =
      m.definition.rows.find((r) => r.kind === "detailed")?.id ||
      m.definition.rows[0]?.id ||
      null;
    m.dirty = false;
    m.modal = null;
    m.templates = await invoke("list_price_templates");
    state.view = "price-determination";
    state.search = "";
    previewState();
    render();
  }
  async function act(button) {
    const action = button.dataset.action;
    if (action === "open-price-determination") {
      await open();
      return true;
    }
    if (!action.startsWith("price-")) return false;
    if (m.busy) return true;
    if (action === "price-back") {
      if (leave()) {
        state.view = "workspace";
        await loadEstimate();
      }
      return true;
    }
    if (action === "price-close-modal") {
      closeModal();
      return true;
    }
    if (action === "price-reload") {
      if (leave()) await open();
      return true;
    }
    if (action === "price-select") {
      m.selectedId = button.dataset.id;
      redraw();
      return true;
    }
    if (action === "price-template" || action === "price-export") {
      m.modal = {
        kind: action === "price-template" ? "template" : "export",
        dirty: false,
      };
      redraw();
      return true;
    }
    if (action === "price-save") {
      if (!editable()) return true;
      m.busy = true;
      const workspace = document.querySelector(".price-workspace");
      if (workspace) workspace.inert = true;
      try {
        const saved = await invoke("save_price_definition", {
          estimateId: state.estimateId,
          revision: m.revision,
          definition: m.definition,
        });
        m.revision = saved.revision;
        m.calculation = saved.calculation;
        m.direct = saved.direct;
        m.dirty = false;
        m.error = "";
        await loadEstimate();
        state.message = "Determinación de precio guardada";
      } catch (error) {
        m.error = String(error);
      } finally {
        m.busy = false;
        redraw();
      }
      return true;
    }
    if (!editable()) return true;
    const row = selected();
    if (action === "price-add-row") {
      const row = newRow(button.dataset.kind);
      m.definition.rows.push(row);
      m.selectedId = row.id;
      m.dirty = true;
      await preview();
    }
    if (action === "price-delete-row") {
      const row = m.definition.rows.find((r) => r.id === button.dataset.id);
      if (
        !window.confirm(
          `¿Quitar la línea «${row.label}» y su detalle de esta determinación?`,
        )
      )
        return true;
      m.definition.rows = m.definition.rows.filter((r) => r.id !== row.id);
      m.selectedId = m.definition.rows[0]?.id || null;
      m.dirty = true;
      await preview();
    }
    if (action === "price-up" || action === "price-down") {
      const i = m.definition.rows.findIndex((r) => r.id === button.dataset.id),
        j = i + (action === "price-up" ? -1 : 1);
      if (j >= 0 && j < m.definition.rows.length) {
        [m.definition.rows[i], m.definition.rows[j]] = [
          m.definition.rows[j],
          m.definition.rows[i],
        ];
        m.dirty = true;
        await preview();
      }
    }
    if (action === "price-mode") {
      row.detail_mode = button.dataset.mode;
      m.dirty = true;
      await preview();
    }
    if (action === "price-add-group" || action === "price-add-item") {
      m.modal = {
        kind: "item",
        item: { group: action === "price-add-group", parent_id: null },
        dirty: false,
      };
      redraw();
    }
    if (action === "price-edit-item") {
      m.modal = {
        kind: "item",
        item: structuredClone(
          row.items.find((i) => i.id === button.dataset.id),
        ),
        dirty: false,
      };
      redraw();
    }
    if (action === "price-delete-item") {
      const ids = new Set([button.dataset.id]);
      let old = -1;
      while (old !== ids.size) {
        old = ids.size;
        for (const i of row.items) if (ids.has(i.parent_id)) ids.add(i.id);
      }
      if (!window.confirm("¿Quitar este elemento y los ítems que contiene?"))
        return true;
      row.items = row.items.filter((i) => !ids.has(i.id));
      m.dirty = true;
      await preview();
    }
    if (action === "price-load-template") {
      const template = m.templates.find((t) => t.id === m.templateId);
      if (!template) {
        m.error = "Elegí una plantilla";
        redraw();
        return true;
      }
      if (
        m.dirty &&
        !window.confirm(
          "Cargar la plantilla reemplaza la determinación o el detalle seleccionado. ¿Continuar?",
        )
      )
        return true;
      if (template.scope === "definition") {
        m.definition = cloneDefinition(template.definition);
        m.selectedId = m.definition.rows[0]?.id || null;
      } else {
        if (row?.kind !== "detailed") {
          m.error = "Seleccioná un concepto con detalle";
          redraw();
          return true;
        }
        const copied = cloneDefinition(template.definition).rows[0];
        row.items = copied.items;
        row.amount = copied.amount;
        row.reference_percent = copied.reference_percent;
        row.detail_mode = copied.detail_mode;
      }
      m.dirty = true;
      await preview();
    }
    return true;
  }
  async function submit(form) {
    const data = new FormData(form),
      value = (k) => String(data.get(k) || "").trim();
    if (form.id === "price-item-form") {
      const definition = structuredClone(m.definition),
        row = definition.rows.find((r) => r.id === m.selectedId),
        old = m.modal.item;
      const item = {
        id: old.id || window.crypto.randomUUID(),
        parent_id: value("parentId") || null,
        group: old.group,
        description: value("description"),
        unit: old.group ? "" : value("unit"),
        participation_percent: old.group ? "100" : value("participation"),
        quantity: old.group ? "0" : value("quantity"),
        unit_price: old.group ? "0" : value("unitPrice"),
        periodic:
          !old.group && data.has("periodic")
            ? {
                start: value("rentalStart"),
                end: value("rentalEnd"),
                payment_day: Number(value("paymentDay")),
                prorate: data.has("prorate"),
              }
            : null,
      };
      const i = row.items.findIndex((r) => r.id === item.id);
      if (i >= 0) row.items[i] = item;
      else row.items.push(item);
      const calculation = await invoke("calculate_price_definition", {
        estimateId: state.estimateId,
        definition,
      });
      m.definition = definition;
      m.calculation = calculation;
      m.error = "";
      m.dirty = true;
      m.modal = null;
      redraw();
    }
    if (form.id === "price-template-form") {
      const definition =
        value("scope") === "detail"
          ? { rows: [structuredClone(selected())] }
          : m.definition;
      await invoke("save_price_template", {
        name: value("name"),
        currency: currentEstimate().currency,
        scope: value("scope"),
        definition,
      });
      m.templates = await invoke("list_price_templates");
      m.modal = null;
      state.message = "Plantilla de Determinación de precio guardada";
      redraw();
    }
    if (form.id === "price-export-form") {
      await preview();
      if (!m.calculation)
        throw new Error(m.error || "Revisá la determinación antes de exportar");
      m.lastExport = await exportPriceDetermination({
        invoke,
        definition: m.definition,
        calculation: m.calculation,
        currency: currentEstimate().currency,
        title: currentEstimate().title,
        format: value("format"),
        rowId: value("scope") === "detail" ? m.selectedId : null,
      });
      m.modal = null;
      redraw();
    }
  }
  function input(target) {
    if (state.view !== "price-determination") return;
    if (target.closest?.(".price-modal")) {
      m.modal.dirty = true;
      return;
    }
    if (!editable()) return;
    let changed = false;
    for (const [attr, key] of [
      ["priceLabel", "label"],
      ["pricePercent", "percent"],
      ["priceAmount", "amount"],
    ])
      if (target.dataset[attr]) {
        const row = m.definition.rows.find(
          (r) => r.id === target.dataset[attr],
        );
        row[key] = target.value;
        changed = true;
      }
    if (target.name === "price-reference") {
      selected().reference_percent = target.value;
      changed = true;
    }
    if (target.name === "price-manual") {
      selected().amount = target.value;
      changed = true;
    }
    if (changed) {
      m.dirty = true;
      schedule();
    }
  }
  async function change(target) {
    if (state.view !== "price-determination") return;
    if (target.closest?.(".price-modal")) {
      m.modal.dirty = true;
      return;
    }
    if (target.name === "price-template") {
      m.templateId = target.value;
      return;
    }
    if (!editable()) return;
    const row = selected();
    if (target.dataset.priceEnabled) {
      m.definition.rows.find(
        (r) => r.id === target.dataset.priceEnabled,
      ).enabled = target.checked;
      m.dirty = true;
      await preview();
    }
    if (target.name === "price-kind") {
      row.kind = target.value;
      m.dirty = true;
      await preview();
    }
    if (target.name === "price-role") {
      row.role = target.value;
      if (row.role === "discount") row.subtract = true;
      m.dirty = true;
      await preview();
    }
    if (target.name === "price-sign") {
      row.subtract = target.value === "true";
      m.dirty = true;
      await preview();
    }
  }
  function keyDown(evt) {
    if (state.view !== "price-determination" || !m.modal) return false;
    if (evt.key === "Tab") {
      const controls = [
        ...document.querySelectorAll(
          ".price-modal button:not(:disabled),.price-modal input:not(:disabled),.price-modal select:not(:disabled)",
        ),
      ];
      const first = controls[0],
        last = controls.at(-1);
      if (evt.shiftKey && document.activeElement === first) {
        evt.preventDefault();
        last?.focus();
      } else if (!evt.shiftKey && document.activeElement === last) {
        evt.preventDefault();
        first?.focus();
      }
      return true;
    }
    if (evt.key === "Escape") {
      evt.preventDefault();
      closeModal();
      return true;
    }
    return false;
  }
  async function doubleClick(evt) {
    const row = evt.target.closest?.("[data-price-item]");
    if (
      state.view === "price-determination" &&
      row &&
      !m.modal &&
      editable() &&
      !evt.target.closest("button,input,select")
    ) {
      await act({
        dataset: { action: "price-edit-item", id: row.dataset.priceItem },
      });
      return true;
    }
    return false;
  }
  function dragStart(evt) {
    const handle = evt.target.closest?.("[data-price-drag]");
    if (!handle) return false;
    if (!editable()) {
      evt.preventDefault();
      return true;
    }
    m.drag = handle.dataset.priceDrag;
    evt.dataTransfer.setData("application/x-cpobras-price", m.drag);
    evt.dataTransfer.effectAllowed = "move";
    return true;
  }
  function dragOver(evt) {
    if (!m.drag) return false;
    document
      .querySelectorAll(
        "[data-price-row].drop-before,[data-price-row].drop-after",
      )
      .forEach((r) => r.classList.remove("drop-before", "drop-after"));
    const target = evt.target.closest?.("[data-price-row]");
    if (target) {
      evt.preventDefault();
      const box = target.getBoundingClientRect();
      target.classList.add(
        evt.clientY > box.top + box.height / 2 ? "drop-after" : "drop-before",
      );
    }
    return true;
  }
  async function drop(evt) {
    if (!m.drag) return false;
    evt.preventDefault();
    const id = m.drag;
    document
      .querySelectorAll(
        "[data-price-row].drop-before,[data-price-row].drop-after",
      )
      .forEach((r) => r.classList.remove("drop-before", "drop-after"));
    m.drag = null;
    const target = evt.target.closest?.("[data-price-row]");
    if (target && id !== target.dataset.priceRow && editable()) {
      const from = m.definition.rows.findIndex((r) => r.id === id),
        [moving] = m.definition.rows.splice(from, 1),
        index = m.definition.rows.findIndex(
          (r) => r.id === target.dataset.priceRow,
        );
      m.definition.rows.splice(
        index +
          (evt.clientY >
          target.getBoundingClientRect().top +
            target.getBoundingClientRect().height / 2
            ? 1
            : 0),
        0,
        moving,
      );
      m.dirty = true;
      await preview();
    }
    return true;
  }
  return {
    markup,
    act,
    submit,
    input,
    change,
    keyDown,
    doubleClick,
    dragStart,
    dragOver,
    drop,
    dragEnd: () => {
      m.drag = null;
      document
        .querySelectorAll(
          "[data-price-row].drop-before,[data-price-row].drop-after",
        )
        .forEach((r) => r.classList.remove("drop-before", "drop-after"));
    },
    leave,
    afterRender,
    model: m,
  };
}
