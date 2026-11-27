import { uiText, uiHtml } from "../services/interface-language.js";
import {priceCostFactor,priceRowLabel} from "../services/price-summary.js";
import {estimateMonths,applyEstimateDuration,organizationCostAmount} from "../services/price-duration.js";
import {createPriceAutosave} from "../services/price-autosave.js";
import {resourcePicker} from "./resource-picker.js";
import { e, field, select } from "./helpers.js";
import { money, numeric, multiplyDecimals, sumDecimals } from "../decimal.js";
import { exportPriceDetermination } from "../services/price-export.js";
const localizedKinds = () => [
  ["detailed", uiText("Con detalle")],
  ["percent_direct", uiText("% costo directo")],
  ["percent_subtotal", uiText("% subtotal acumulado")],
  ["percent_profit", uiText("% utilidad anterior")],
  ["fixed", uiText("Monto fijo")],
  ["subtotal", uiText("Separador / subtotal")],
];
const localizedRoles = () => [
  ["overhead", uiText("Gastos indirectos")],
  ["finance", uiText("Gastos financieros")],
  ["profit", uiText("Beneficio / utilidad")],
  ["discount", uiText("Descuento")],
  ["tax", uiText("Impuestos")],
  ["other", uiText("Otros cargos")],
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
  const active = () => state.view === "price-determination" || (state.view === "workspace" && state.panel === "direct-costs");
  const autosave = createPriceAutosave({state,model:m,invoke,window,onStatus:()=>{
    for(const node of document.querySelectorAll?.('[data-price-save-status]')||[])node.textContent=saveLabel();
    for(const node of document.querySelectorAll?.('[data-price-error-message]')||[]){node.textContent=m.error||'';node.parentElement.hidden=!m.error;}
    for(const node of document.querySelectorAll?.('[data-price-retry]')||[])node.hidden=!['error','conflict'].includes(m.saveStatus);
    if(!m.dirty && m.calculation && state.estimateId===autosave.contextId()){
      state.totals={...m.calculation.breakdown,rows:m.calculation.rows};
      state.priceDefinition=m.definition;
      const total=document.querySelector('.total-head strong');if(total)total.textContent=money(m.calculation.breakdown.total);
    }
    previewState();
  }});
  function saveLabel(){return uiText(({pending:'Cambios pendientes de guardar…',saving:'Guardando…',saved:'Guardado automáticamente',error:'Error al guardar · se conserva un borrador local',conflict:'Conflicto: revisá el borrador recuperado'})[m.saveStatus]||'Guardado');}
  const directRow = () => m.definition.rows.find(r=>r.role==='direct_costs');
  function ensureDirect(){if(!directRow()){const r=newRow('detailed');Object.assign(r,{role:'direct_costs',label:'Gastos Directos'});m.definition.rows.unshift(r);}}
  const duration = () => estimateMonths(m.definition);
  function durationField(){return `<label class="estimate-duration"><span>${uiHtml("Plazo estimado de obra")}</span><input type="number" name="estimated-months" data-estimated-months required min="0.000001" max="1200" step="any" value="${e(duration())}" ${lock()} aria-label="${uiHtml("Plazo estimado de obra en meses")}"><span>${uiHtml("meses")}</span></label>`;}
  function monthsCell(item){
    if(item.months==null)return '—';
    const override=!item.use_estimate_duration;
    return `<label class="duration-choice"><input type="checkbox" data-direct-override="${item.id}" ${override?'checked':''} ${lock()}> ${uiHtml("Usar meses distintos")}</label>${override?`<input name="direct-months-${item.id}" data-direct-item="${item.id}" data-direct-field="months" value="${e(item.months)}" type="number" min="0.000001" max="1200" step="any" ${lock()} aria-label="${uiHtml("Meses propios {0}", [item.description])}">`:`<small>${uiHtml("Plazo de obra: {0} meses", [numeric(duration())])}</small>`}`;
  }
  function itemDurationEditor(item){
    if(item.months==null&&!item.use_estimate_duration)return '';
    const override=!item.use_estimate_duration;
    return `<fieldset><legend>${uiHtml("Duración del gasto · plazo de obra {0} meses", [numeric(duration())])}</legend><label><input type="checkbox" name="itemDurationOverride" ${override?'checked':''}> ${uiHtml("Usar meses distintos")}</label><div data-custom-item-months ${override?'':'hidden'}>${field(uiText("Meses propios"),'itemDurationMonths',item.months??duration(),`type="number" min="0.000001" max="1200" step="any" required ${override?'':'disabled'}`)}</div></fieldset>`;
  }
  function syncDirectDurationForm(){
    const form=document.querySelector('#price-direct-form');if(!form)return;
    const monthly=form.querySelector('[name="directPeriod"]').value==='monthly',override=form.querySelector('[name="directOverride"]').checked;
    form.querySelector('[data-direct-duration-options]').hidden=!monthly;
    form.querySelector('[data-direct-custom-months]').hidden=!monthly||!override;
    form.querySelector('[name="directMonths"]').disabled=!monthly||!override;
  }
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
      show_separately: false,
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
    if (active?.name && active.closest?.(".price-workspace,.direct-costs-panel"))
      m.focus = { name: active.name, start: active.selectionStart };
  }
  function redraw() {
    capture();
    if(m.dirty)autosave.changed();
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
    applyEstimateDuration(m.definition);
    if(m.dirty)autosave.changed();
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
    if (!m.modal && active()) redraw();
  }
  function schedule() {
    autosave.changed();
    if (m.timer) window.clearTimeout(m.timer);
    m.timer = window.setTimeout(() => preview(), 250);
  }
  async function leave() {
    if(m.busy || state.busy)return false;
    if(m.modal && !closeModal())return false;
    try{await autosave.flush();}catch{redraw();return false;}
    if(m.timer)window.clearTimeout(m.timer);m.sequence++;state.pricePreview=null;return true;
  }
  function closeModal() {
    if (state.busy || m.busy) return false;
    if (
      m.modal?.dirty &&
      !window.confirm(
        uiText("Tenés cambios sin guardar en esta ventana. ¿Descartarlos?"),
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
      return ("<div class=\"blank-state\"><strong>" + uiHtml("Seleccioná una línea") + "</strong><p>" + uiHtml("Podés agregar un concepto, porcentaje o subtotal desde la lista.") + "</p></div>");
    if(row.role==='direct_costs')return directPane();
    const calculated = result(row.id);
    return `${row.role==='overhead' && row.label==='Gastos generales'?("<p class=\"small-muted\">" + uiHtml("Concepto anterior conservado: revisá si corresponde a Gastos Directos de la obra o a Gastos indirectos de la organización.") + "</p>"):''}<div class="price-detail-heading"><h2>${e(priceRowLabel(row))}</h2><strong>${m.calculation ? money(calculated?.amount) : "—"}</strong></div>${row.role==='overhead'?`<p class="price-duration-note">${uiHtml("Plazo estimado de obra:")} <strong>${uiHtml("{0} meses", [numeric(duration())])}</strong>${uiHtml(". Los gastos vinculados se actualizan al cambiarlo desde Gastos Directos.")}</p>${row.label==='Gastos indirectos'&&row.items.some(i=>!i.group&&!i.periodic&&i.months==null&&['mes','año'].includes(i.unit))?`<button class="btn tiny" data-action="price-link-indirect-duration" ${lock()}>${uiHtml("Vincular gastos recurrentes anteriores al plazo de obra")}</button>`:''}`:''}<fieldset class="price-properties" ${lock()}><div class="form-grid">${select(uiText("Tipo de cálculo"), "price-kind", localizedKinds(), row.kind)}${select(uiText("Categoría del concepto"), "price-role", localizedRoles(), row.role)}${select(
      uiText("Operación"),
      "price-sign",
      [
        ["false", uiText("Sumar")],
        ["true", uiText("Restar")],
      ],
      String(row.subtract),
    )}${row.kind === "detailed" ? field(uiText("Referencia % del costo directo"), "price-reference", row.reference_percent, 'type="number" min="0" step="any" ' + lock()) : ""}</div><p class="small-muted">${uiHtml("La categoría Beneficio define la base de «% utilidad anterior». El subtotal es el acumulado inmediatamente anterior; los separadores no suman cargos.")}</p></fieldset>${row.kind === "detailed" ? `<div class="work-toolbar"><button class="btn ${row.detail_mode === "items" ? "primary" : ""}" data-action="price-mode" data-mode="items" ${lock()}>${uiHtml("Con detalle")}</button><button class="btn ${row.detail_mode === "manual" ? "primary" : ""}" data-action="price-mode" data-mode="manual" ${lock()}>${uiHtml("Monto manual")}</button><button class="btn ${row.detail_mode === "reference" ? "primary" : ""}" data-action="price-mode" data-mode="reference" ${lock()}>${uiHtml("% CD de referencia")}</button><span class="grow"></span><button class="btn" data-action="price-add-group" ${lock()}>${uiHtml("＋ Grupo")}</button><button class="btn" data-action="price-add-item" ${lock()}>${uiHtml("＋ Ítem")}</button></div>${row.detail_mode === "manual" ? field(uiText("Monto manual del concepto"), "price-manual", row.amount, 'type="number" min="0" step="any" ' + lock()) : ""}${row.detail_mode === "reference" ? `<p class="context-help">${uiHtml("Se aplica {0}% del costo directo. El detalle se conserva y no se suma en este modo.", [numeric(row.reference_percent)])}</p>` : ""}${details(row)}<div class="price-detail-totals"><span>${uiHtml("Total del detalle:")} <b>${calculated ? money(calculated.detail_total) : "—"}</b></span><span>${uiHtml("Referencia {0}% CD:", [numeric(row.reference_percent)])} <b>${calculated ? money(calculated.reference_total) : "—"}</b></span><span>${uiHtml("Aplicado:")} <b>${calculated ? money(calculated.amount) : "—"}</b></span></div>` : row.kind === "subtotal" ? ("<p class=\"context-help\">" + uiHtml("Esta línea muestra el acumulado a esta altura de la determinación. No vuelve a sumarlo.") + "</p>") : `<p class="context-help">${uiHtml("Base de cálculo:")} ${calculated ? money(calculated.base) : "—"}${uiHtml(". Importe aplicado:")} ${calculated ? money(calculated.amount) : "—"}.</p>`}`;
  }
  function details(row) {
    const calculation = result(row.id);
    const renderChildren = (parent, depth = 0) => {
      if (depth > 100) return "";
      return row.items
        .filter((i) => i.parent_id === parent)
        .map(
          (item) =>
            `<tr class="price-item-row ${item.group ? "price-group" : ""}" data-price-item="${item.id}"><td style="padding-left:${12 + depth * 18}px">${item.group ? "▾ " : ""}${e(item.description)}${item.months!=null?`<small class="muted"> · ${item.use_estimate_duration?uiHtml("Plazo de obra"):uiHtml("Meses propios")}: ${numeric(item.months)} ${uiHtml("meses")}${item.months_per_payment==='12'?uiHtml(" · tarifa anual prorrateada"): ''}</small>`:''}${item.periodic ? `<small class="muted"> ${uiHtml("· Alquiler mensual · {0} → {1}", [item.periodic.start, item.periodic.end])}</small>` : ""}</td><td>${item.group ? "" : e(item.unit)}</td><td class="number">${item.group ? "" : numeric(item.participation_percent) + "%"}</td><td class="number">${item.group ? "" : numeric(item.quantity)}</td><td class="number">${item.group ? "" : money(item.unit_price)}</td><td class="number">${calculation ? money(calculation.item_totals[item.id] ?? "0") : "—"}</td><td><button class="btn tiny" data-action="price-edit-item" data-id="${item.id}" ${lock()}>${uiHtml("Editar")}</button><button class="tiny-danger" data-action="price-delete-item" data-id="${item.id}" aria-label="${uiHtml("Quitar {0}", [item.description])}" ${lock()}>×</button></td></tr>${item.group ? renderChildren(item.id, depth + 1) : ""}`,
        )
        .join("");
    };
    return `<div class="price-detail-table"><table class="mini-table"><thead><tr><th>${uiHtml("Descripción")}</th><th>${uiHtml("Unidad")}</th><th>${uiHtml("% participación")}</th><th>${uiHtml("Cantidad")}</th><th>${uiHtml("Precio")}</th><th>${uiHtml("Total")}</th><th></th></tr></thead><tbody>${renderChildren(null) || ("<tr><td colspan=\"7\">" + uiHtml("Agregá grupos e ítems para detallar este concepto.") + "</td></tr>")}</tbody></table></div>`;
  }
  function errorMarkup(){return `<div class="price-error" role="alert" ${m.error?'':'hidden'}><span data-price-error-message>${e(m.error||'')}</span><button class="btn tiny" data-action="price-save" data-price-retry ${['error','conflict'].includes(m.saveStatus)?'':'hidden'}>${uiHtml("Reintentar guardado")}</button>${m.recoveryDraft?("<button class=\"btn\" data-action=\"price-restore-draft\">" + uiHtml("Recuperar borrador") + "</button><button class=\"btn\" data-action=\"price-reload\">" + uiHtml("Descartar borrador y recargar") + "</button>"):''}</div>`;}
  function markup() {
    const calc = m.calculation;
    return `<main class="price-workspace"><div class="work-toolbar"><h1>${uiHtml("Determinación de precio")}</h1><span class="grow"></span><button class="btn" data-action="price-back">${uiHtml("← Presupuesto")}</button><button class="btn" data-action="agreement-open">${uiHtml("Acuerdo de ajuste del presupuesto")}</button><button class="btn" data-action="price-reload">${uiHtml("Recargar")}</button><button class="btn primary" data-action="price-save" ${lock()}>${uiHtml("Guardar determinación")}</button></div><div class="price-status" role="status" data-price-save-status>${e(saveLabel())}${!editable() ? uiHtml(" · Presupuesto emitido") : ""}</div>${errorMarkup()}<div class="price-columns"><aside class="price-left"><section class="price-card"><h2>${uiHtml("Resumen de costos")}</h2><div class="summary-row"><strong>${uiHtml("COSTO DIRECTO")}</strong><strong>${money(m.direct)}</strong></div>${(
      calc?.rows || []
    )
      .filter((r) => r.enabled)
      .map(
        (r) =>
          `<div class="summary-row ${r.kind === "subtotal" ? "price-subtotal" : ""}"><span>${e(priceRowLabel(r))}${r.kind==='subtotal'?`<small class="price-cost-factor">${uiHtml("Factor precio / costo directo:")} <b>${priceCostFactor(r.amount,m.direct)}</b></small>`:''}</span><strong>${money(r.amount)}</strong></div>`,
      )
      .join(
        "",
      )}<div class="summary-final"><span>${uiHtml("PRESUPUESTO TOTAL")}</span><strong>${e(currentEstimate()?.currency)} ${calc ? money(calc.breakdown.total) : "—"}</strong></div></section><section class="price-card"><h2>${uiHtml("Conceptos y orden de cálculo")}</h2><p class="small-muted">${uiHtml("Arrastrá el asa para reordenar. Las flechas permiten mover cada línea.")}</p><div class="price-row-list">${m.definition.rows.map((row, index) => `<div class="price-row ${row.id === m.selectedId ? "selected" : ""}" data-price-row="${row.id}"><button type="button" class="price-drag" draggable="${editable()}" data-price-drag="${row.id}" aria-label="${uiHtml("Arrastrar {0}", [priceRowLabel(row)])}" ${lock()}>⋮⋮</button><input type="checkbox" aria-label="${uiHtml("Activar {0}", [priceRowLabel(row)])}" data-price-enabled="${row.id}" ${row.enabled ? "checked" : ""} ${lock()}><input class="price-label" name="price-label-${row.id}" data-price-label="${row.id}" aria-label="${uiHtml("Nombre de línea")} ${index + 1}" value="${e(priceRowLabel(row))}" data-stored-price-label="${e(row.label)}" ${lock()}>${row.kind!=="subtotal"&&row.role!=="tax"?`<label class="price-public-toggle"><input type="checkbox" name="price-public-${row.id}" data-price-public="${row.id}" aria-label="${uiHtml("Mostrar separado en la cotización: {0}", [priceRowLabel(row)])}" ${row.show_separately?"checked":""} ${lock()}><span class="price-public-hint">${uiHtml("Mostrar separado en la cotización")}</span></label>`:""}<button type="button" class="btn tiny" data-action="price-select" data-id="${row.id}">${e(row.kind === "detailed" ? { items: uiText("Con detalle"), manual: uiText("Monto manual"), reference: uiText("% CD ref.") }[row.detail_mode] : localizedKinds().find(([kind]) => kind === row.kind)?.[1])}</button>${row.kind.startsWith("percent_") ? `<input class="price-number" name="price-percent-${row.id}" data-price-percent="${row.id}" aria-label="${uiHtml("Porcentaje {0}", [priceRowLabel(row)])}" type="number" min="0" step="any" value="${e(row.percent)}" ${lock()}>` : row.kind === "fixed" ? `<input class="price-number" name="price-amount-${row.id}" data-price-amount="${row.id}" aria-label="${uiHtml("Monto {0}", [priceRowLabel(row)])}" type="number" min="0" step="any" value="${e(row.amount)}" ${lock()}>` : ""}<button class="price-move" data-action="price-up" data-id="${row.id}" aria-label="${uiHtml("Subir {0}", [priceRowLabel(row)])}" ${lock()}>↑</button><button class="price-move" data-action="price-down" data-id="${row.id}" aria-label="${uiHtml("Bajar {0}", [priceRowLabel(row)])}" ${lock()}>↓</button><button class="tiny-danger" data-action="price-delete-row" data-id="${row.id}" aria-label="${row.role==='direct_costs'?uiHtml("Desactivar"):uiHtml("Quitar línea")} ${e(priceRowLabel(row))}" ${lock()}>×</button></div>`).join("")}</div><div class="price-add"><small>${uiHtml("Agregar línea:")}</small><button class="btn tiny" data-action="price-add-indirect" ${lock()}>${uiHtml("Gastos indirectos de la organización")}</button>${localizedKinds().map(([kind, label]) => `<button class="btn tiny" data-action="price-add-row" data-kind="${kind}" ${lock()}>${e(label)}</button>`).join("")}</div></section><section class="price-card"><h2>${uiHtml("Plantillas y exportación")}</h2>${select(uiText("Plantilla de determinación o detalle"), "price-template", [["", uiText("Elegir plantilla")], ...m.templates.filter((t) => t.currency === currentEstimate()?.currency).map((t) => [t.id, (t.scope === "detail" ? uiText("Detalle") : uiText("Determinación")) + " · " + t.name])], m.templateId)}<div class="price-add"><button class="btn" data-action="price-load-template" ${lock()}>${uiHtml("Cargar plantilla")}</button><button class="btn" data-action="price-template">${uiHtml("Guardar plantilla")}</button><button class="btn" data-action="price-export">${uiHtml("Exportar")}</button></div>${m.lastExport ? `<p role="status">${uiHtml("Archivo guardado en {0}", [m.lastExport])}</p>` : ""}</section></aside><section class="price-right">${rowEditor()}</section></div>${modalMarkup()}</main>`;
  }
  function modalMarkup() {
    if (!m.modal) return "";
    const modal = m.modal,
      item = modal.item || {},
      row = selected();
    let title = "",
      body = "",
      form = "";
    if(modal.kind==='direct-item'){
      title='Agregar insumo a Gastos Directos';form='price-direct-form';
      body=`<div class="component-row direct-cost-resource" data-resource-context="direct-costs">${resourcePicker(state.resources.filter(r=>r.active!==false),'',0)}${field(uiText("Cantidad"),'directQuantity','1','type="number" min="0" step="any" required')}${field('Precio por unidad / mes '+currentEstimate()?.currency,'unitPrice','0','type="number" min="0" step="any" required')}</div>${select(uiText("Periodicidad"),'directPeriod',[['once',uiText("Puntual")],['monthly',uiText("Mensual")]])}<div data-direct-duration-options hidden><p>${uiHtml("Plazo estimado de obra:")} <strong>${uiHtml("{0} meses", [numeric(duration())])}</strong></p><label><input name="directOverride" type="checkbox"> ${uiHtml("Usar meses distintos")}</label><div data-direct-custom-months hidden>${field(uiText("Meses propios"),'directMonths',duration(),'type="number" min="0.000001" max="1200" step="any" required disabled')}</div></div><p class="modal-help">${uiHtml("Puntual: cantidad × precio. Mensual: cantidad × precio mensual × plazo estimado de obra. Marcá «Usar meses distintos» para indicar una duración propia.")}</p>`;
    }
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
          uiText("Descripción del detalle"),
          "description",
          item.description || "",
          'required maxlength="500"',
        ) +
        select(
          uiText("Grupo del detalle"),
          "parentId",
          [
            ["", uiText("Sin grupo")],
            ...row.items
              .filter((i) => i.group && !descendants.has(i.id))
              .map((i) => [i.id, i.description]),
          ],
          item.parent_id || "",
        ) +
        (item.group
          ? ""
          : `<div class="form-grid">${field(uiText("Unidad"), "unit", item.unit || "un", "required")}${field(uiText("Participación %"), "participation", item.participation_percent ?? "100", 'type="number" min="0" max="100" step="any" required')}${field(uiText("Cantidad del detalle"), "quantity", item.quantity ?? "1", 'type="number" min="0" step="any" required')}${field("Precio del detalle " + currentEstimate()?.currency, "unitPrice", item.unit_price ?? "0", 'type="number" min="0" step="any" required')}</div>${itemDurationEditor(item)}<fieldset ${item.months!=null||item.use_estimate_duration?'hidden':''}><legend>${uiHtml("Gasto mensual / alquiler")}</legend><label><input type="checkbox" name="periodic" ${item.periodic ? "checked" : ""}> ${uiHtml("Calcular por período (por ejemplo, baños químicos)")}</label><div class="form-grid">${field(uiText("Inicio del alquiler"), "rentalStart", item.periodic?.start || "", 'type="date"')}${field(uiText("Fin del alquiler"), "rentalEnd", item.periodic?.end || "", 'type="date"')}${field(uiText("Día de vencimiento mensual"), "paymentDay", item.periodic?.payment_day || "5", 'type="number" min="1" max="31"')}</div><label><input type="checkbox" name="prorate" ${item.periodic?.prorate !== false ? "checked" : ""}> ${uiHtml("Prorratear meses incompletos por días calendario")}</label></fieldset><p class="modal-help">${uiHtml("Para alquileres: cantidad de unidades × tarifa mensual × meses × participación. El día 31 vence el último día de los meses más cortos. Las fechas son inclusivas. Sin alquiler, se aplica cantidad × precio × participación / 100.")}</p>`);
      form = "price-item-form";
    }
    if(modal.kind==='indirect'){
      title='Incluir gastos indirectos de la organización';form='price-indirect-form';
      const base=sumDecimals(modal.plan.items.map(i=>organizationCostAmount(i,duration())));
      body=`<p>${uiHtml("{0} · Plazo estimado de obra:", [modal.organizationName])} <strong>${uiHtml("{0} meses", [numeric(duration())])}</strong></p><p>${uiHtml("Base para este plazo: {0} {1}", [currentEstimate().currency, money(base)])}</p><ul>${modal.plan.items.map(i=>`<li>${e(i.description)} · ${e({once:'Pago único',monthly:'Mensual',yearly:'Anual prorrateado'}[i.periodicity])} · ${money(organizationCostAmount(i,duration()))}</li>`).join('')}</ul>${field(uiText("Porcentaje de participación para este presupuesto"),'allocation','100','type="number" min="0" max="100" step="any" required')}<p>${uiHtml("Los gastos mensuales y anuales se vinculan al plazo estimado de obra. Los pagos puntuales se suman una vez. Cambiar el plazo actualiza este detalle; los importes de la organización se conservan como una copia del momento en que los incorporaste.")}</p>`;
    }
    if (modal.kind === "template") {
      title = "Guardar plantilla de Determinación de precio";
      body =
        field(uiText("Nombre de plantilla"), "name", "", 'required maxlength="300"') +
        select(
          uiText("Contenido de la plantilla"),
          "scope",
          [
            ["definition", uiText("Determinación completa")],
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
        select(uiText("Formato de exportación"), "format", [
          ["xlsx", uiText("Excel (.xlsx)")],
          ["pdf", "PDF"],
          ["csv", "CSV"],
          ["json", "JSON"],
        ]) +
        select(uiText("Contenido a exportar"), "scope", [
          ["definition", uiText("Determinación completa")],
          ["detail", uiText("Concepto seleccionado y su detalle")],
        ]);
      form = "price-export-form";
    }
    return `<div class="modal-overlay price-modal"><section class="dialog-shell" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="dialog-header"><h2>${e(title)}</h2><button type="button" class="close-dialog" data-action="price-close-modal" aria-label="${uiHtml("Cerrar ventana")}">×</button></div><form id="${form}" class="dialog-body">${body}<p class="feature-error modal-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn" data-action="price-close-modal">${uiHtml("Cerrar")}</button><button type="submit" class="btn primary">${modal.kind === "export" ? uiHtml("Exportar") : uiHtml("Guardar")}</button></div></form></section></div>`;
  }
  async function open() {
    if (!state.estimateId) throw new Error(uiText("Abrí un presupuesto"));
    const saved = await invoke("get_price_definition", {
      estimateId: state.estimateId,
    });
    m.definition = applyEstimateDuration(saved.definition);
    ensureDirect();
    m.revision = saved.revision;
    m.direct = saved.direct;
    m.calculation = saved.calculation;
    m.error = saved.calculation_error || "";
    m.selectedId =
      m.definition.rows.find((r) => r.kind === "detailed" && r.role!=="direct_costs")?.id ||
      m.definition.rows[0]?.id ||
      null;
    m.dirty = false;
    autosave.bind(saved,state.estimateId,editable());
    if(!m.definition.rows.some(r=>r.id===m.selectedId))m.selectedId=m.definition.rows.find(r=>r.role==='overhead')?.id||m.definition.rows[0]?.id;
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
      if (await leave()) {
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
      if(m.dirty && ['error','conflict'].includes(m.saveStatus)){
        if(window.confirm(uiText("¿Descartar el borrador local y recargar los valores guardados?"))){autosave.discard();await open();}
        return true;
      }
      if (await leave()) await open();
      return true;
    }
    if(action==='price-restore-draft'){
      if(window.confirm(uiText("¿Usar el borrador recuperado en lugar de los valores actuales?"))){autosave.restore();await preview();await autosave.flush();redraw();}return true;
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
      try{await autosave.flush();await loadEstimate();redraw();}catch{redraw();}
      return true;
    }
    if (!editable()) return true;
    const row = selected();
    if(action==='price-add-indirect'){
      const orgId=state.projects.find(p=>p.id===state.projectId)?.organization_id;
      if(!orgId)throw Error(uiText("La obra no tiene organización asignada"));
      const plan=await invoke('get_organization_indirect_costs',{organizationId:orgId});
      if(!plan.data.items.length)throw Error(uiText("Cargá primero los gastos en Inicio → Organizaciones → Gastos indirectos"));
      const currency=v=>['Usd','USD'].includes(v)?'USD':'ARS';
      if(currency(plan.data.currency)!==currency(currentEstimate().currency))throw Error(uiText("La moneda de los gastos de la organización debe coincidir con la del presupuesto"));
      m.modal={kind:'indirect',dirty:false,plan:plan.data,organizationName:state.organizations.find(o=>o.id===orgId)?.name||'Organización'};redraw();return true;
    }
    if(action==='price-link-indirect-duration'){
      const row=selected();
      for(const item of row.items){
        if(item.group||item.periodic||item.months!=null||!['mes','año'].includes(item.unit))continue;
        item.quantity='1';item.months=duration();item.use_estimate_duration=true;item.months_per_payment=item.unit==='año'?'12':null;
      }
      m.dirty=true;await preview();return true;
    }
    if (action === "price-add-row") {
      const row = newRow(button.dataset.kind);
      m.definition.rows.push(row);
      m.selectedId = row.id;
      m.dirty = true;
      await preview();
    }
    if(action==='price-add-direct'){
      m.selectedId=directRow().id;m.modal={kind:'direct-item',item:{id:window.crypto.randomUUID()},dirty:false};redraw();return true;
    }
    if (action === "price-delete-row") {
      const row = m.definition.rows.find((r) => r.id === button.dataset.id);
      if(row.role==='direct_costs'){row.enabled=false;m.dirty=true;await preview();return true;}
      if (
        !window.confirm(
          uiText("¿Quitar la línea «{0}» y su detalle de esta determinación?", [priceRowLabel(row)]),
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
      if(row.role==='direct_costs')return true;
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
      if (!window.confirm(uiText("¿Quitar este elemento y los ítems que contiene?")))
        return true;
      row.items = row.items.filter((i) => !ids.has(i.id));
      m.dirty = true;
      await preview();
    }
    if (action === "price-load-template") {
      const template = m.templates.find((t) => t.id === m.templateId);
      if (!template) {
        m.error = uiText("Elegí una plantilla");
        redraw();
        return true;
      }
      if (
        (m.dirty || directRow()?.items.length) &&
        !window.confirm(
          uiText("Cargar la plantilla reemplaza la determinación o el detalle seleccionado. ¿Continuar?"),
        )
      )
        return true;
      if (template.scope === "definition") {
        const composition=structuredClone(directRow()),months=duration();
        m.definition = cloneDefinition(template.definition);
        m.definition.estimated_months=months;applyEstimateDuration(m.definition);
        if(!m.definition.rows.some(r=>r.role==='direct_costs'))m.definition.rows.unshift(composition);
        m.selectedId = m.definition.rows[0]?.id || null;
      } else {
        if (row?.kind !== "detailed" || row.role==='direct_costs') {
          m.error = uiText("Seleccioná un concepto con detalle");
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
    if(form.id==='price-indirect-form'){
      if(!editable())throw Error(uiText("El presupuesto es de solo lectura"));
      const existing=m.definition.rows.find(r=>r.role==='overhead'&&r.label==='Gastos indirectos');
      if(existing&&(existing.items.length||existing.kind!=='detailed'||existing.detail_mode!=='items')&&!window.confirm(uiText("Ya hay Gastos indirectos. ¿Reemplazar ese detalle con esta nueva distribución?")))return;
      const definition=structuredClone(m.definition),row=newRow('detailed');
      Object.assign(row,{role:'overhead',label:'Gastos indirectos',items:m.modal.plan.items.map(i=>({id:window.crypto.randomUUID(),parent_id:null,group:false,description:i.description,unit:{once:'un',monthly:'mes',yearly:'año'}[i.periodicity],quantity:'1',unit_price:i.amount,participation_percent:value('allocation'),periodic:null,months:i.periodicity==='once'?null:duration(),use_estimate_duration:i.periodicity!=='once',months_per_payment:i.periodicity==='yearly'?'12':null,resource_id:null,resource_kind:null}))});
      if(existing)definition.rows.splice(definition.rows.findIndex(r=>r.id===existing.id),1,row);else definition.rows.unshift(row);
      const calc=await invoke('calculate_price_definition',{estimateId:state.estimateId,definition});
      m.definition=definition;m.calculation=calc;m.selectedId=row.id;m.dirty=true;autosave.changed();await autosave.flush();m.modal=null;redraw();return;
    }
    if(form.id==='price-direct-form'){
      if(!editable())throw Error(uiText("El presupuesto es de solo lectura"));
      const resource=state.resources.find(r=>r.id===value('resource')&&r.active!==false);
      if(!resource)throw Error(uiText("Seleccioná un insumo del catálogo"));
      const definition=structuredClone(m.definition),row=definition.rows.find(r=>r.role==='direct_costs');
      const item={id:m.modal.item.id,parent_id:null,group:false,description:resource.description,unit:resource.unit,resource_id:resource.id,resource_kind:resource.kind,months:value('directPeriod')==='monthly'?(data.has('directOverride')?value('directMonths'):duration()):null,use_estimate_duration:value('directPeriod')==='monthly'&&!data.has('directOverride'),months_per_payment:null,periodic:null,participation_percent:'100',quantity:value('directQuantity'),unit_price:value('unitPrice')};
      const index=row.items.findIndex(i=>i.id===item.id);if(index<0)row.items.push(item);else row.items[index]=item;
      const calc=await invoke('calculate_price_definition',{estimateId:state.estimateId,definition});
      m.definition=definition;m.calculation=calc;m.dirty=true;autosave.changed();await autosave.flush();m.modal=null;redraw();return;
    }
    if (form.id === "price-item-form") {
      const definition = structuredClone(m.definition),
        row = definition.rows.find((r) => r.id === m.selectedId),
        old = m.modal.item;
      const item = {
        resource_id: old.resource_id??null,
        resource_kind: old.resource_kind??null,
        months: old.months!=null||old.use_estimate_duration?(data.has('itemDurationOverride')?value('itemDurationMonths'):duration()):null,
        use_estimate_duration: (old.months!=null||old.use_estimate_duration)&&!data.has('itemDurationOverride'),
        months_per_payment: old.months_per_payment??null,
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
      state.message = uiText("Plantilla de Determinación de precio guardada");
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
    if (!active()) return;
    if (target.closest?.(".price-modal")) {
      m.modal.dirty = true;
      return;
    }
    if (!editable()) return;
    let changed = false;
    if(target.name==='estimated-months'){
      m.definition.estimated_months=target.value;applyEstimateDuration(m.definition);changed=true;
    }
    if(target.dataset.directItem){const item=directRow().items.find(i=>i.id===target.dataset.directItem);item[target.dataset.directField]=target.value;changed=true;}

    for (const [attr, key] of [
      ["priceLabel", "label"],
      ["pricePercent", "percent"],
      ["priceAmount", "amount"],
    ])
      if (target.dataset[attr]) {
        const row = m.definition.rows.find(
          (r) => r.id === target.dataset[attr],
        );
        const value = key === "label" && target.value === target.defaultValue
          ? target.dataset.storedPriceLabel
          : target.value;
        if (row[key] !== value) {
          row[key] = value;
          changed = true;
        }
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
    if (!active()) return;
    if (target.closest?.(".price-modal")) {
      m.modal.dirty = true;
      if(['directPeriod','directOverride'].includes(target.name))syncDirectDurationForm();
      if(target.name==='itemDurationOverride'){
        const field=document.querySelector('[data-custom-item-months]');if(field){field.hidden=!target.checked;field.querySelector('input').disabled=!target.checked;}
      }
      return;
    }
    if (target.name === "price-template") {
      m.templateId = target.value;
      return;
    }
    if (!editable()) return;
    const row = selected();
    if(target.name==='estimated-months'){m.definition.estimated_months=target.value;applyEstimateDuration(m.definition);m.dirty=true;await preview();return;}
    if(target.dataset.directOverride){const item=directRow().items.find(i=>i.id===target.dataset.directOverride);item.use_estimate_duration=!target.checked;if(!target.checked)item.months=duration();m.dirty=true;await preview();return;}
    if(target.dataset.directPeriod){const item=directRow().items.find(i=>i.id===target.dataset.directPeriod);item.months=target.value==='monthly'?duration():null;item.use_estimate_duration=target.value==='monthly';item.months_per_payment=null;m.dirty=true;await preview();return;}
    if(row?.role==='direct_costs' && ['price-kind','price-role','price-sign'].includes(target.name))return;
    if(target.dataset.pricePublic){
      const concept=m.definition.rows.find(r=>r.id===target.dataset.pricePublic);
      if(concept&&concept.kind!=='subtotal'&&concept.role!=='tax'){
        concept.show_separately=target.checked;m.dirty=true;await preview();
      }
      return;
    }
    if (target.dataset.priceEnabled) {
      m.definition.rows.find(
        (r) => r.id === target.dataset.priceEnabled,
      ).enabled = target.checked;
      m.dirty = true;
      await preview();
    }
    if (target.name === "price-kind") {
      row.kind = target.value;
      if(row.kind==='subtotal')row.show_separately=false;
      m.dirty = true;
      await preview();
    }
    if (target.name === "price-role") {
      row.role = target.value;
      if(row.role==='tax')row.show_separately=false;
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
    if(document.querySelector(".quick-resource-overlay"))return false;
    if (!active() || !m.modal) return false;
    if(evt.key === "Escape" && evt.target.closest?.(".resource-picker")?.querySelector(".resource-results:not([hidden])"))return false;
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
  async function openDirect(){
    if(autosave.active()&&m.dirty)await autosave.flush();
    const view=state.view;await open();state.view=view;state.panel='direct-costs';m.selectedId=directRow().id;render();
  }
  function directPane(){
    const row=directRow();if(!row)return ("<p>" + uiHtml("Cargando Gastos Directos…") + "</p>");
    return `<section class="direct-costs-panel"><div class="detail-heading"><b>${uiHtml("Gastos Directos del presupuesto")}</b>${durationField()}<button class="btn tiny primary" data-action="price-add-direct" ${lock()}>${uiHtml("＋ Agregar insumo")}</button></div><p role="status" data-price-save-status>${e(saveLabel())}</p>${errorMarkup()}<label><input type="checkbox" data-price-enabled="${row.id}" ${row.enabled?'checked':''} ${lock()}> ${uiHtml("Incluir Gastos Directos en el presupuesto")}</label><div class="table-scroll"><table class="mini-table"><thead><tr><th>${uiHtml("Insumo")}</th><th>${uiHtml("Unidad")}</th><th>${uiHtml("Cantidad")}</th><th>${uiHtml("Precio / período")}</th><th>${uiHtml("Periodicidad")}</th><th>${uiHtml("Meses")}</th><th>${uiHtml("Total")}</th><th></th></tr></thead><tbody>${row.items.map(i=>`<tr><td>${e(i.description)}</td><td>${e(i.unit)}</td><td><input name="direct-quantity-${i.id}" data-direct-item="${i.id}" data-direct-field="quantity" value="${e(i.quantity)}" type="number" min="0" step="any" ${lock()} aria-label="${uiHtml("Cantidad {0}", [i.description])}"></td><td><input name="direct-price-${i.id}" data-direct-item="${i.id}" data-direct-field="unit_price" value="${e(i.unit_price)}" type="number" min="0" step="any" ${lock()} aria-label="${uiHtml("Precio {0}", [i.description])}"></td><td><select data-direct-period="${i.id}" ${lock()} aria-label="${uiHtml("Periodicidad {0}", [i.description])}"><option value="once" ${i.months==null?'selected':''}>${uiHtml("Puntual")}</option><option value="monthly" ${i.months!=null?'selected':''}>${uiHtml("Mensual")}</option></select></td><td>${monthsCell(i)}</td><td class="number">${m.calculation?money(result(row.id)?.item_totals?.[i.id]??'0'):'—'}</td><td><button class="tiny-danger" data-action="price-delete-item" data-id="${i.id}" ${lock()} aria-label="${uiHtml("Quitar {0}", [i.description])}">×</button></td></tr>`).join('')||("<tr><td colspan=\"8\">" + uiHtml("Agregá equipos, mano de obra, materiales o subcontratos de uso general.") + "</td></tr>")}</tbody></table></div><p>${uiHtml("Total del detalle:")} <strong>${m.calculation?money(result(row.id)?.detail_total??'0'):'—'}</strong> ${uiHtml("· Aplicado:")} <strong>${m.calculation?money(result(row.id)?.amount??'0'):'—'}</strong></p></section>`;
  }
  return {
    markup,
    directPane,
    modalMarkup,
    openDirect,
    flush: autosave.flush,
    hasUnsavedForm:()=>Boolean(m.modal?.dirty),
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
