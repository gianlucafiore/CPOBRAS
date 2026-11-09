import { e, field, dateToday } from "./helpers.js";
import { multiplyDecimals, percentageOf, sumDecimals, money, compareDecimals } from "../decimal.js";
export function createAdjustmentAgreement({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
  currentEstimate,
  onSaved,
}) {
  const model = {
    open: false,
    revision: 0,
    definition: null,
    points: [],
    advanceSummary: null,
    enabled: false,
    terms: {
      advance_recovery_percent: "0",
      retention_percent: "0",
      collection_delay_days: 3,
    },
  };
  const read = () => {
    const form = document.querySelector("#adjustment-agreement-form");
    if (!form) return;
    const data = new FormData(form);
    model.enabled = data.has("enabled");
    model.terms = {
      advance_recovery_percent: String(
        data.get("advance_recovery_percent") || "0",
      ),
      retention_percent: String(data.get("retention_percent") || "0"),
      collection_delay_days: Number(data.get("collection_delay_days") || 0),
    };
    if (!model.enabled) return;
    model.definition = {
      base_month: String(data.get("base_month") ?? model.definition.base_month),
      lag_months: Number(data.get("lag_months") ?? model.definition.lag_months),
      weights: [...form.querySelectorAll("[data-agreement-weight]")].map(
        (row) => ({
          series: row
            .querySelector('[name="series"]')
            .value.trim()
            .toUpperCase(),
          base_month: row.querySelector('[name="index_base_month"]').value,
          weight: percentageOf(
            row.querySelector('[name="weight"]').value || "0",
            "1",
          ),
        }),
      ),
    };
    model.definition.base_month =
      model.definition.weights
        .map((w) => w.base_month)
        .filter(Boolean)
        .sort()[0] || model.definition.base_month;
  };
  const options = (values, current) =>
    '<option value="">Seleccionar…</option>' +
    values
      .map(
        (value) =>
          `<option value="${e(value)}" ${value === current ? "selected" : ""}>${e(value)}</option>`,
      )
      .join("");
  function indexRow(w, i, disabled) {
    const series = [...new Set(model.points.map((p) => p.series))].sort();
    const periods = [
      ...new Set(
        model.points.filter((p) => p.series === w.series).map((p) => p.period),
      ),
    ]
      .sort()
      .reverse();
    const base = w.base_month || model.definition.base_month;
    const point = model.points
      .filter((p) => p.series === w.series && p.period === base)
      .sort((a, b) => b.publication_date.localeCompare(a.publication_date))[0];
    return `<div class="index-weight" data-agreement-weight><label>Índice<select aria-label="Índice" name="series" required ${disabled}>${options(series, w.series)}</select></label><label>Período base del índice<select aria-label="Período base del índice" name="index_base_month" required ${disabled}>${options(periods, base)}</select></label><label>Puntaje base<input readonly value="${e(point?.value || "Sin publicación")}"></label>${field("Peso %", "weight", multiplyDecimals(w.weight, "100"), 'type="number" min="0.000001" max="100" step="any" required ' + disabled)}<button class="btn" type="button" data-action="agreement-remove" data-index="${i}" ${disabled}>Quitar índice</button></div>`;
  }
  function markup() {
    if (!model.open) return "";
    const a = model.definition,
      disabled =
        currentEstimate()?.issued || state.remoteProject ? "disabled" : "";
    return `<div class="modal-overlay"><section class="dialog-shell" role="dialog" aria-modal="true" aria-label="Acuerdo de ajuste del presupuesto" style="width:min(760px,94vw)"><form id="adjustment-agreement-form"><div class="dialog-header"><h2>Acuerdo de ajuste del presupuesto</h2><button class="close-dialog" type="button" data-action="agreement-close" aria-label="Cerrar acuerdo">×</button></div><div class="compact-editor-body"><p>${currentEstimate()?.issued ? "Presupuesto emitido: el acuerdo es de solo lectura. Volvé a borrador o creá una nueva versión para cambiarlo. " : ""}Este acuerdo pertenece únicamente al presupuesto activo. Los puntajes mensuales se cargan en Inicio → Datos generales. Al emitir se conserva la fórmula y los valores utilizados.</p>${model.advanceSummary ? `<div class="agreement-advance-summary"><b>Anticipo del comitente · ${e(model.advanceSummary.currency)}</b><span>Recibido: ${money(model.advanceSummary.received)}</span><span>Recuperado: ${money(model.advanceSummary.recovered)}</span><span>Pendiente de recuperar: ${money(model.advanceSummary.pending)}</span></div>` : ""}<div class="form-grid">${field("Recuperación de anticipo % (antes del ajuste)", "advance_recovery_percent", model.terms.advance_recovery_percent, 'type="number" min="0" max="100" step="any" ' + disabled)}${field("Fondo de reparo %", "retention_percent", model.terms.retention_percent, 'type="number" min="0" max="100" step="any" ' + disabled)}${field("Días desde emisión hasta cobro", "collection_delay_days", model.terms.collection_delay_days, 'type="number" min="0" max="365" ' + disabled)}</div><label><input type="checkbox" name="enabled" ${model.enabled ? "checked" : ""} ${disabled}> Aplicar ajuste de índices</label><div class="form-grid">${field("Meses de desfase respecto del corte", "lag_months", a.lag_months, 'type="number" min="0" max="24" required ' + disabled)}</div>${a.weights.map((w, i) => indexRow(w, i, disabled || (!model.enabled ? "disabled" : ""))).join("")}<button class="btn" type="button" data-action="agreement-add" ${disabled}>Agregar índice</button><p>Los pesos deben sumar 100 %. Si falta una publicación, se toma el último mes común disponible y queda un ajuste provisorio. Las diferencias posteriores se proponen para otro certificado.</p><p class="feature-error" role="alert"></p></div><div class="dialog-actions"><button class="btn" type="button" data-action="agreement-close">Cerrar</button><button class="btn primary" type="submit" ${disabled}>Guardar acuerdo</button></div></form></section></div>`;
  }
  async function act(button) {
    const a = button.dataset.action;
    if (a === "agreement-open") {
      if (state.pageDirty) {
        window.alert(
          "Guardá primero los cambios del formulario abierto. Así no se pierden al configurar el acuerdo.",
        );
        return;
      }
      const [saved, points, metadata] = await Promise.all([
        invoke("get_adjustment_agreement", { estimateId: state.estimateId }),
        invoke("list_index_points"),
        invoke("get_estimate_metadata", { estimateId: state.estimateId }),
      ]);
      const operations = await invoke("list_operations",{projectId:state.projectId});
      const currency=currentEstimate()?.currency || "ARS";
      const related=operations.filter(o=>o.estimate_id===state.estimateId&&o.currency===currency&&o.date<=dateToday());
      const received=sumDecimals(related.filter(o=>o.kind==="advance_received").map(o=>o.amount));
      const recovered=sumDecimals(related.filter(o=>o.kind==="certificate").map(o=>o.advance||"0"));
      const pending=sumDecimals([received,multiplyDecimals(recovered,"-1")]);
      model.advanceSummary={received,recovered,pending:compareDecimals(pending,"0")<0?"0":pending,currency};
      model.revision = saved?.revision || 0;
      model.terms = saved?.terms || {
        advance_recovery_percent: "0",
        retention_percent: "0",
        collection_delay_days: 3,
      };
      model.enabled = Boolean(saved?.definition);
      model.definition = saved?.definition || {
        base_month:
          metadata?.created_at?.slice(0, 7) || dateToday().slice(0, 7),
        lag_months: 0,
        weights: [{ series: "CAC", weight: "1" }],
      };
      model.points = points || [];
      model.open = true;
      model.dirty = false;
    } else if (a === "agreement-close") {
      if (model.dirty && !window.confirm("¿Descartar los cambios del acuerdo?"))
        return;
      model.open = false;
      model.dirty = false;
    } else {
      read();
      if (a === "agreement-add")
        model.definition.weights.push({ series: "", weight: "0" });
      if (a === "agreement-remove")
        model.definition.weights.splice(Number(button.dataset.index), 1);
      model.dirty = true;
    }
    render();
  }
  async function submit() {
    read();
    const saved = await invoke("save_adjustment_agreement", {
      estimateId: state.estimateId,
      revision: model.revision,
      definition: model.enabled ? model.definition : null,
      terms: model.terms,
    });
    model.revision = saved.revision;
    model.open = false;
    model.dirty = false;
    state.message =
      "Acuerdo guardado. Los certificados emitidos conservarán el acuerdo con el que salieron.";
    try {
      await onSaved?.();
    } catch (error) {
      state.message += " No se pudo actualizar la previsión: " + error;
    }
    render();
  }
  return {
    model,
    markup,
    act,
    submit,
    change: (target) => {
      if (target.closest?.("#adjustment-agreement-form")) {
        model.dirty = true;
        if (["series", "index_base_month"].includes(target.name)) {
          read();
          if (target.name === "series") {
            const row = [
              ...document.querySelectorAll("[data-agreement-weight]"),
            ].indexOf(target.closest("[data-agreement-weight]"));
            model.definition.weights[row].base_month = "";
          }
          render();
        }
        if (target.name === "enabled") {
          read();
          render();
        }
      }
    },
  };
}
