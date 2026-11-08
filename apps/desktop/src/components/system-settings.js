import { e, field, dateToday } from "./helpers.js";
import { numeric } from "../decimal.js";
import { createCalendarPicker } from "./calendar-picker.js";
export function createSystemSettings({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
}) {
  const model = {
    calendar: { revision: 0, nonworking_weekdays: [5, 6], exceptions: {} },
    points: [],
    point: null,
    calendarDirty: false,
    indexDirty: false,
  };
  const picker = createCalendarPicker({ state, document });
  function capture() {
    const calendar = document.querySelector("#system-calendar");
    if (calendar) {
      const data = new FormData(calendar);
      model.calendar.nonworking_weekdays = [0, 1, 2, 3, 4, 5, 6].filter(
        (i) => !data.getAll("workday").includes(String(i)),
      );
    }
    const index = document.querySelector("#system-index");
    if (index) {
      const data = new FormData(index);
      model.point = Object.fromEntries(
        ["series", "period", "value", "publication_date", "source"].map((k) => [
          k,
          String(data.get(k) || ""),
        ]),
      );
    }
  }
  function markup() {
    picker.configure(
      { ...model.calendar, start_date: dateToday(), holidays: [] },
      "general:" + model.calendar.revision,
    );
    const p = model.point || {};
    return `<main class="feature-page"><h1>Datos generales del sistema</h1><p>El calendario y las publicaciones se comparten entre tus obras. Cada obra puede definir excepciones y cada presupuesto conserva su propio acuerdo de ajuste.</p><section class="settings-card"><h2>Calendario general</h2><form id="system-calendar"><fieldset><legend>Semana laborable habitual</legend>${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d, i) => `<label><input type="checkbox" name="workday" value="${i}" ${model.calendar.nonworking_weekdays.includes(i) ? "" : "checked"}> ${d}</label>`).join("")}</fieldset><p>Podés declarar un feriado laborable para todas las obras. Las excepciones propias de cada obra tienen prioridad.</p><div data-calendar-picker>${picker.markup()}</div><button class="btn primary" type="submit">Guardar calendario general</button><p class="feature-error" role="alert"></p></form></section><section class="settings-card"><h2>Índices y publicaciones mensuales</h2><p>Cargá puntajes publicados, no porcentajes de variación. Una corrección se guarda como una nueva publicación y conserva el historial. Los certificados emitidos mantienen sus valores originales.</p><form id="system-index" class="form-grid three">${field("Serie del índice", "series", p.series || "CAC", 'required maxlength="80" list="known-index-series"')}<datalist id="known-index-series">${[...new Set(["CAC", "IPC", "INDEC", ...model.points.map((x) => x.series)])].map((s) => `<option value="${e(s)}"></option>`).join("")}</datalist>${field("Mes del puntaje", "period", p.period || dateToday().slice(0, 7), 'type="month" required')}${field("Puntaje publicado", "value", p.value || "", 'type="number" min="0.00000001" step="any" required')}${field("Fecha de publicación", "publication_date", p.publication_date || dateToday(), 'type="date" required')}${field("Enlace de la fuente", "source", p.source || "", 'type="url" required')}<button class="btn primary" type="submit">Registrar publicación</button><p class="feature-error" role="alert"></p></form><table class="data-grid"><thead><tr><th>Serie</th><th>Mes</th><th>Puntaje</th><th>Publicado</th><th>Fuente</th><th></th></tr></thead><tbody>${
      [...model.points]
        .reverse()
        .map(
          (p) =>
            `<tr><td>${e(p.series)}</td><td>${e(p.period)}</td><td>${numeric(p.value)}</td><td>${e(p.publication_date)}</td><td><a href="${e(p.source)}" target="_blank" rel="noreferrer">Ver fuente</a></td><td><button class="btn tiny" data-action="system-copy-index" data-id="${p.id}">Nueva publicación / corrección</button></td></tr>`,
        )
        .join("") || '<tr><td colspan="6">Sin puntajes registrados.</td></tr>'
    }</tbody></table></section></main>`;
  }
  async function act(button) {
    const action = button.dataset.action;
    if (action !== "open-system-settings") capture();
    if (action === "open-system-settings") {
      if (state.projectId)
        throw new Error("Los datos generales se administran desde Inicio");
      [model.calendar, model.points] = await Promise.all([
        invoke("get_general_calendar"),
        invoke("list_index_points"),
      ]);
      state.view = "system-settings";
    } else if (action.startsWith("plan-calendar-")) {
      if (["plan-calendar-toggle", "plan-calendar-remove"].includes(action))
        model.calendarDirty = true;
      picker.act(button);
      return;
    } else if (action === "system-copy-index") {
      const p = model.points.find((p) => p.id === button.dataset.id);
      if (
        model.indexDirty &&
        !window.confirm("¿Descartar la publicación sin guardar?")
      )
        return;
      model.point = { ...p, publication_date: dateToday() };
      model.indexDirty = false;
    }
    render();
  }
  async function submit(form) {
    capture();
    const data = new FormData(form),
      v = (k) => String(data.get(k) || "").trim();
    if (form.id === "system-calendar") {
      model.calendar = await invoke("save_general_calendar", {
        calendar: {
          revision: model.calendar.revision,
          nonworking_weekdays: [0, 1, 2, 3, 4, 5, 6].filter(
            (i) => !data.getAll("workday").includes(String(i)),
          ),
          exceptions: picker.value(),
        },
      });
      picker.reset();
      model.calendarDirty = false;
      state.message =
        "Calendario general guardado. Las obras lo heredarán al abrir su planificación.";
    }
    if (form.id === "system-index") {
      await invoke("save_index_point", {
        point: {
          id: window.crypto.randomUUID(),
          series: v("series").toUpperCase(),
          period: v("period"),
          value: v("value"),
          publication_date: v("publication_date"),
          source: v("source"),
        },
      });
      model.points = await invoke("list_index_points");
      model.point = null;
      model.indexDirty = false;
      state.message =
        "Publicación registrada. Ya puede aplicarse a certificados y diferencias pendientes.";
    }
    state.pageDirty = model.calendarDirty || model.indexDirty;
    render();
  }
  return {
    model,
    markup,
    act,
    submit,
    change: (target) => {
      const result = picker.change(target);
      if (
        target.name !== "calendar-month" &&
        target.closest?.("#system-calendar")
      )
        model.calendarDirty = true;
      if (target.closest?.("#system-index")) model.indexDirty = true;
      return result;
    },
  };
}
