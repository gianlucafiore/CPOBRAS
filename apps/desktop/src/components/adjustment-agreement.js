import { e, field, dateToday } from "./helpers.js";
import { multiplyDecimals, percentageOf } from "../decimal.js";
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
    enabled: false,
  };
  const read = () => {
    const form = document.querySelector("#adjustment-agreement-form");
    if (!form) return;
    const data = new FormData(form);
    model.enabled = data.has("enabled");
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
          weight: percentageOf(
            row.querySelector('[name="weight"]').value || "0",
            "1",
          ),
        }),
      ),
    };
  };
  function markup() {
    if (!model.open) return "";
    const a = model.definition,
      disabled =
        currentEstimate()?.issued || state.remoteProject ? "disabled" : "";
    return `<div class="modal-overlay"><section class="dialog-shell" role="dialog" aria-modal="true" aria-label="Acuerdo de ajuste del presupuesto" style="width:min(760px,94vw)"><form id="adjustment-agreement-form"><div class="dialog-header"><h2>Acuerdo de ajuste del presupuesto</h2><button class="close-dialog" type="button" data-action="agreement-close" aria-label="Cerrar acuerdo">×</button></div><div class="compact-editor-body"><p>${currentEstimate()?.issued ? "Presupuesto emitido: el acuerdo es de solo lectura. Volvé a borrador o creá una nueva versión para cambiarlo. " : ""}Este acuerdo pertenece únicamente al presupuesto activo. Los puntajes mensuales se cargan en Inicio → Datos generales. Al emitir se conserva la fórmula y los valores utilizados.</p><label><input type="checkbox" name="enabled" ${model.enabled ? "checked" : ""} ${disabled}> Aplicar ajuste de índices</label><div class="form-grid">${field("Mes base del presupuesto", "base_month", a.base_month, 'type="month" required ' + disabled)}${field("Meses de desfase respecto del corte", "lag_months", a.lag_months, 'type="number" min="0" max="24" required ' + disabled)}</div><datalist id="agreement-series">${[...new Set(["CAC", "IPC", "INDEC", ...model.points.map((p) => p.series), ...a.weights.map((w) => w.series)])].map((s) => `<option value="${e(s)}"></option>`).join("")}</datalist>${a.weights.map((w, i) => `<div class="index-weight" data-agreement-weight>${field("Índice", "series", w.series, 'list="agreement-series" required maxlength="80" ' + disabled)}${field("Peso %", "weight", multiplyDecimals(w.weight, "100"), 'type="number" min="0.000001" max="100" step="any" required ' + disabled)}<button class="btn" type="button" data-action="agreement-remove" data-index="${i}" ${disabled}>Quitar índice</button></div>`).join("")}<button class="btn" type="button" data-action="agreement-add" ${disabled}>Agregar índice</button><p>Los pesos deben sumar 100 %. Si falta una publicación, se toma el último mes común disponible y queda un ajuste provisorio. Las diferencias posteriores se proponen para otro certificado.</p><p class="feature-error" role="alert"></p></div><div class="dialog-actions"><button class="btn" type="button" data-action="agreement-close">Cerrar</button><button class="btn primary" type="submit" ${disabled}>Guardar acuerdo</button></div></form></section></div>`;
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
      model.revision = saved?.revision || 0;
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
        if (target.name === "enabled") {
          model.enabled = target.checked;
          for (const input of document.querySelectorAll(
            "#adjustment-agreement-form [required]",
          ))
            input.required = model.enabled;
        }
      }
    },
  };
}
