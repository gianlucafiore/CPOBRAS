import { e, field, select, dateToday } from "./helpers.js";
import { money, numeric } from "../decimal.js";

export function createPlanningWorkspace({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
}) {
  const model = {
    revision: 0,
    history: [],
    historyRevision: "",
    projectId: null,
    plan: null,
    schedule: null,
    baselines: [],
    baselineId: "",
    editing: null,
    crews: [],
    asOf: dateToday(),
    dirty: false,
  };
  let drag = null;
  const uuid = () => window.crypto.randomUUID();
  const empty = () => ({
    calendar: {
      start_date: dateToday(),
      nonworking_weekdays: [5, 6],
      holidays: [],
    },
    tasks: [],
  });
  async function refresh() {
    if (!model.projectId) {
      model.plan = empty();
      model.schedule = null;
      return;
    }
    const [saved, baselines, crews, history] = await Promise.all([
      invoke("get_project_plan", { projectId: model.projectId }),
      invoke("list_plan_baselines", { projectId: model.projectId }),
      invoke("list_management_records", { kind: "crew", projectId: null }),
      invoke("list_plan_revisions", { projectId: model.projectId }),
    ]);
    model.plan = saved?.plan || empty();
    model.revision = saved?.revision || 0;
    model.baselines = baselines;
    model.history = history;
    model.crews = crews.filter(
      (c) => !c.project_id || c.project_id === model.projectId,
    );
    model.editing = null;
    model.dirty = false;
    model.schedule = await invoke("calculate_schedule", {
      plan: model.plan,
      asOf: model.asOf,
    });
  }
  async function save() {
    model.dirty = true;
    const saved = await invoke("save_project_plan", {
      projectId: model.projectId,
      revision: model.revision,
      plan: model.plan,
      asOf: model.asOf,
    });
    model.plan = saved.plan;
    model.revision = saved.revision;
    model.dirty = false;
    model.history = await invoke("list_plan_revisions", {
      projectId: model.projectId,
    });
    model.schedule = await invoke("calculate_schedule", {
      plan: model.plan,
      asOf: model.asOf,
    });
    render();
  }
  const options = (exclude = null) =>
    model.plan.tasks
      .filter((task) => task.id !== exclude)
      .map((task) => [task.id, task.name]);
  function chart() {
    const curve = model.schedule?.curve || [];
    if (!curve.length) return "";
    const total = Number(model.schedule.budget) || 1;
    const path = curve
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${curve.length === 1 ? 500 : (index / (curve.length - 1)) * 1000},${200 - (Number(point.cumulative_cost) / total) * 180}`,
      )
      .join(" ");
    return `<section class="curve-panel"><h2>Curva S · Costo planificado acumulado</h2><svg viewBox="0 0 1000 220" role="img" aria-label="Curva de costos acumulados"><path d="${path}" fill="none" stroke="#1976a3" stroke-width="3"/><path d="M0,200 L1000,200" stroke="#bbb"/></svg><div class="curve-dates"><span>${e(curve[0].date)}</span><b>${money(model.schedule.budget)}</b><span>${e(curve.at(-1).date)}</span></div><details><summary>Flujo previsto por día laborable</summary><table class="data-grid"><thead><tr><th>Fecha</th><th>Período</th><th>Acumulado</th></tr></thead><tbody>${curve.map((point) => `<tr><td>${e(point.date)}</td><td>${money(point.period_cost)}</td><td>${money(point.cumulative_cost)}</td></tr>`).join("")}</tbody></table></details></section>`;
  }
  function gantt() {
    if (!model.schedule) return "";
    const baseline = model.baselines.find(
      (item) => item.id === model.baselineId,
    );
    const width = Math.max(700, (model.schedule.duration_days + 5) * 24);
    return `<section class="gantt-scroll"><div class="gantt" style="width:${width + 280}px"><div class="gantt-heading"><span>Tareas · Arrastrá la barra para reprogramar; el extremo cambia la duración</span><span>Rojo: ruta crítica</span></div>${model.plan.tasks
      .map((task) => {
        const scheduled = model.schedule.tasks.find(
            (row) => row.id === task.id,
          ),
          previous = baseline?.schedule.tasks.find((row) => row.id === task.id);
        return `<div class="gantt-row"><button class="gantt-label" data-action="plan-edit" data-id="${e(task.id)}">${e(task.parent_id ? "↳ " : "")}${e(task.name)}<small>${e(scheduled.start)} → ${e(scheduled.finish)} · holgura ${scheduled.float_days} d</small></button><div class="gantt-track" style="width:${width}px">${previous ? `<span class="gantt-baseline" style="left:${previous.start_day * 24}px;width:${Math.max(8, (previous.finish_day - previous.start_day) * 24)}px"></span>` : ""}<button class="gantt-bar ${scheduled.critical ? "critical" : ""}" data-task-id="${e(task.id)}" data-action="plan-edit" data-id="${e(task.id)}" style="left:${scheduled.start_day * 24}px;width:${Math.max(10, task.duration_days * 24)}px" title="${e(task.name)} · ${task.duration_days} días"><span>${e(task.name)}</span><i data-resize="true" aria-label="Cambiar duración">↔</i></button></div></div>`;
      })
      .join("")}</div></section>`;
  }
  function editor() {
    const task = model.editing;
    if (!task) return "";
    const resources = [
      ...state.resources.map((resource) => [resource.id, resource.description]),
      ...model.crews.map((crew) => [crew.id, crew.name]),
    ];
    return `<form id="planning-task-form" class="feature-editor"><h2>Editar tarea / hito</h2>${field("Nombre", "name", task.name, "required")}${select("Tarea superior", "parent_id", [["", "Sin superior"], ...options(task.id)], task.parent_id)}${select("Partida presupuestaria", "estimate_line_id", [["", "Sin partida vinculada"], ...(model.lines || []).map((line) => [line.id, line.description])], task.estimate_line_id)}${field("Duración en días laborables (0 = hito)", "duration_days", task.duration_days, 'type="number" min="0" max="36500" required')}${field("No iniciar antes de", "not_before", task.not_before || "", 'type="date"')}${field("Fecha límite de finalización", "finish_by", task.finish_by || "", 'type="date"')}${field("Costo previsto (se toma de la partida cuando hay vínculo)", "budget", task.budget, 'type="number" min="0" step="any" required')}${field("Avance real %", "actual_progress", task.actual_progress, 'type="number" min="0" max="100" step="any" required')}
      <h3>Dependencias</h3>${task.predecessors
        .map(
          (dep, index) =>
            `<div class="dependency-row">${select("Tarea", "predecessor-" + index, options(task.id), dep.task_id)}${select(
              "Relación",
              "dependency-kind-" + index,
              [
                ["FS", "Fin → inicio"],
                ["SS", "Inicio → inicio"],
                ["FF", "Fin → fin"],
                ["SF", "Inicio → fin"],
              ],
              dep.kind,
            )}${field("Desfase laborable", "lag-" + index, dep.lag_days, 'type="number" min="-36500" max="36500"')}<button type="button" class="btn" data-action="plan-remove-dependency" data-index="${index}">Quitar</button></div>`,
        )
        .join(
          "",
        )}<button class="btn" type="button" data-action="plan-add-dependency">Agregar dependencia</button>
      <h3>Cuadrillas, equipos y recursos</h3>${task.assignments
        .map(
          (assignment, index) =>
            `<div class="dependency-row">${select("Recurso", "assignment-" + index, resources, assignment.resource_id)}${select(
              "Tipo",
              "assignment-kind-" + index,
              [
                ["crew", "Cuadrilla"],
                ["equipment", "Equipo"],
                ["resource", "Recurso"],
              ],
              assignment.kind,
            )}${field("Unidades por día", "units-" + index, assignment.units_per_day, 'type="number" min="0" step="any"')}<button type="button" class="btn" data-action="plan-remove-assignment" data-index="${index}">Quitar</button></div>`,
        )
        .join(
          "",
        )}<button class="btn" type="button" data-action="plan-add-assignment">Asignar recurso</button><button class="btn primary" type="submit">Guardar tarea y recalcular</button><button class="btn" type="button" data-action="plan-cancel">Cancelar</button><button class="btn" type="button" data-action="plan-delete">Eliminar tarea</button><p class="feature-error" role="alert"></p></form>`;
  }
  function markup() {
    return `<main class="feature-page"><div class="feature-toolbar"><h1>Planificación de obras</h1><span class="scope-label">${e(state.projects.find((p) => p.id === state.projectId)?.name)}</span>${model.projectId ? '<button class="btn primary" data-action="plan-new">Nueva tarea / hito</button><button class="btn" data-action="plan-baseline">Guardar línea base</button>' : ""}</div>${
      !model.projectId
        ? "<p>Seleccioná una obra para planificar.</p>"
        : `
      <form id="planning-settings" class="feature-toolbar">${field("Inicio del proyecto", "start_date", model.plan.calendar.start_date, 'type="date" required')}${field("Fecha de seguimiento", "as_of", model.asOf, 'type="date" required')}${field("Feriados (fechas separadas por comas)", "holidays", model.plan.calendar.holidays.join(", "))}<fieldset><legend>Días laborables</legend>${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day, index) => `<label><input type="checkbox" name="workday" value="${index}" ${model.plan.calendar.nonworking_weekdays.includes(index) ? "" : "checked"}>${day}</label>`).join("")}</fieldset><button class="btn primary" type="submit">Guardar calendario</button><p class="feature-error" role="alert"></p></form>
      <div class="planning-metrics"><span>Duración <b>${model.schedule?.duration_days || 0} días laborables</b></span><span>Fin previsto <b>${e(model.schedule?.finish)}</b></span><span>Planificado <b>${numeric(model.schedule?.planned_progress)} %</b></span><span>Real <b>${numeric(model.schedule?.actual_progress)} %</b></span><span>${model.dirty ? "Cambios sin guardar" : "Revisión " + model.revision}</span></div>
      ${model.schedule?.warnings.map((warning) => `<p class="feature-error">${e(warning)}</p>`).join("") || ""}${select("Comparar línea base", "planning-baseline", [["", "Sin superposición"], ...model.baselines.map((baseline) => [baseline.id, baseline.name + " · revisión " + baseline.revision])], model.baselineId)}<div class="feature-toolbar">${select("Historial de reprogramaciones", "planning-history", [["", "Seleccionar revisión"], ...model.history.map((saved) => [String(saved.revision), "Revisión " + saved.revision + " · " + saved.plan.tasks.length + " tareas"])], model.historyRevision)}<button class="btn" data-action="plan-recover">Recuperar como nueva revisión</button></div>${gantt()}<div class="feature-columns">${chart()}${editor()}</div>`
    }</main>`;
  }
  async function loadLines() {
    const estimates = await invoke("list_project_estimates", {
      projectId: model.projectId,
    });
    const arrays = await Promise.all(
      estimates.map(async (estimate) =>
        (await invoke("list_estimate_lines", { estimateId: estimate.id })).map(
          (line) => ({
            ...line,
            description:
              line.description +
              " · " +
              estimate.title +
              (estimate.issued ? " (emitido)" : " (borrador)"),
          }),
        ),
      ),
    );
    model.lines = arrays.flat();
  }
  function readTask(form) {
    const data = new FormData(form),
      value = (name) => String(data.get(name) || "").trim();
    const task = {
      ...model.editing,
      name: value("name"),
      parent_id: value("parent_id") || null,
      estimate_line_id: value("estimate_line_id") || null,
      duration_days: Number(value("duration_days")),
      not_before: value("not_before") || null,
      finish_by: value("finish_by") || null,
      budget: value("budget"),
      actual_progress: value("actual_progress"),
    };
    task.predecessors = task.predecessors.map((_, index) => ({
      task_id: value("predecessor-" + index),
      kind: value("dependency-kind-" + index),
      lag_days: Number(value("lag-" + index)),
    }));
    task.assignments = task.assignments.map((_, index) => ({
      resource_id: value("assignment-" + index),
      kind: value("assignment-kind-" + index),
      units_per_day: value("units-" + index),
    }));

    return task;
  }
  async function act(button) {
    const action = button.dataset.action;
    if (
      (action.startsWith("plan-add-") || action.startsWith("plan-remove-")) &&
      model.editing
    ) {
      const form = document.querySelector("#planning-task-form");
      if (form) model.editing = readTask(form);
    }
    if (action === "open-planning") {
      state.view = "planning";
      if (!state.projectId) throw new Error("Abrí una obra desde Inicio");
      model.projectId = state.projectId;
      model.baselineId = "";
      model.historyRevision = "";
      model.plan = empty();
      model.schedule = null;
      model.baselines = [];
      model.history = [];
      model.lines = [];
      model.editing = null;
      await refresh();
    }
    if (action === "plan-new") {
      await loadLines();
      model.editing = {
        id: uuid(),
        name: "Nueva tarea",
        parent_id: null,
        estimate_line_id: null,
        duration_days: 1,
        predecessors: [],
        assignments: [],
        not_before: null,
        finish_by: null,
        budget: "0",
        actual_progress: "0",
      };
    }
    if (action === "plan-edit") {
      await loadLines();
      model.editing = structuredClone(
        model.plan.tasks.find((task) => task.id === button.dataset.id),
      );
    }
    if (action === "plan-cancel") model.editing = null;
    if (action === "plan-delete") {
      if (
        model.plan.tasks.some(
          (task) =>
            task.parent_id === model.editing.id ||
            task.predecessors.some((dep) => dep.task_id === model.editing.id),
        )
      )
        throw new Error("Quitá primero las dependencias o tareas hijas");
      if (
        !window.confirm(
          "¿Eliminar la tarea del cronograma actual? Las revisiones y líneas base anteriores se conservan.",
        )
      )
        return;
      const previous = structuredClone(model.plan);
      model.plan.tasks = model.plan.tasks.filter(
        (task) => task.id !== model.editing.id,
      );
      try {
        await save();
        model.editing = null;
      } catch (error) {
        model.plan = previous;
        throw error;
      }
    }
    if (action === "plan-recover") {
      const previous = model.history.find(
        (saved) => String(saved.revision) === model.historyRevision,
      );
      if (!previous) throw new Error("Seleccioná una revisión");
      if (
        !window.confirm(
          "¿Recuperar esta revisión? Se guardará como una nueva versión; el historial se conserva.",
        )
      )
        return;
      const current = structuredClone(model.plan);
      model.plan = structuredClone(previous.plan);
      try {
        await save();
      } catch (error) {
        model.plan = current;
        throw error;
      }
    }
    if (action === "plan-add-dependency" && options(model.editing.id).length)
      model.editing.predecessors.push({
        task_id: options(model.editing.id)[0][0],
        kind: "FS",
        lag_days: 0,
      });
    if (action === "plan-remove-dependency")
      model.editing.predecessors.splice(Number(button.dataset.index), 1);
    if (action === "plan-add-assignment") {
      const id = state.resources[0]?.id || model.crews[0]?.id;
      if (id)
        model.editing.assignments.push({
          resource_id: id,
          kind: state.resources.length ? "resource" : "crew",
          units_per_day: "1",
        });
    }
    if (action === "plan-remove-assignment")
      model.editing.assignments.splice(Number(button.dataset.index), 1);
    if (action === "plan-baseline") {
      const name = window.prompt(
        "Nombre de la línea base",
        "Línea base " + (model.baselines.length + 1),
      );
      if (!name) return;
      await save();
      await invoke("create_plan_baseline", {
        projectId: model.projectId,
        name,
        asOf: model.asOf,
      });
      model.baselines = await invoke("list_plan_baselines", {
        projectId: model.projectId,
      });
    }
    render();
  }
  async function change(target) {
    if (target.name === "planning-history")
      model.historyRevision = target.value;
    if (target.name === "planning-baseline") {
      model.baselineId = target.value;
      render();
    }
  }
  async function submit(form) {
    const data = new FormData(form),
      value = (name) => String(data.get(name) || "").trim();
    if (form.id === "planning-settings") {
      model.plan.calendar.start_date = value("start_date");
      model.plan.calendar.holidays = value("holidays")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      model.plan.calendar.nonworking_weekdays = [0, 1, 2, 3, 4, 5, 6].filter(
        (day) => !data.getAll("workday").includes(String(day)),
      );
      model.asOf = value("as_of");
    } else {
      const task = readTask(form);
      const previous = structuredClone(model.plan);
      const index = model.plan.tasks.findIndex((old) => old.id === task.id);
      if (index < 0) model.plan.tasks.push(task);
      else model.plan.tasks[index] = task;
      try {
        await save();
        model.editing = null;
        render();
      } catch (error) {
        model.plan = previous;
        model.editing = task;
        model.dirty = false;
        throw error;
      }
      return;
    }
    await save();
  }
  function dateForDay(index) {
    const date = new Date(model.plan.calendar.start_date + "T12:00:00Z");
    let count = 0;
    for (let checked = 0; checked < 365000; checked++) {
      const iso = date.toISOString().slice(0, 10),
        weekday = (date.getUTCDay() + 6) % 7;
      if (
        !model.plan.calendar.nonworking_weekdays.includes(weekday) &&
        !model.plan.calendar.holidays.includes(iso)
      ) {
        if (count === index) return iso;
        count++;
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }
    throw new Error("Fecha fuera del calendario admitido");
  }
  function pointerDown(event) {
    if(state.remoteProject)return;
    const bar = event.target.closest?.(".gantt-bar");
    if (!bar) return;
    const task = model.plan.tasks.find(
      (item) => item.id === bar.dataset.taskId,
    );
    drag = {
      id: task.id,
      x: event.clientX,
      resize: Boolean(event.target.dataset.resize),
      start: model.schedule.tasks.find((row) => row.id === task.id).start_day,
      duration: task.duration_days,
    };
  }
  async function pointerUp(event) {
    if (!drag) return;
    const item = drag;
    drag = null;
    const delta = Math.round((event.clientX - item.x) / 24);
    if (!delta) return;
    const task = model.plan.tasks.find((task) => task.id === item.id);
    if (item.resize)
      task.duration_days = Math.max(0, Math.min(36500, item.duration + delta));
    else task.not_before = dateForDay(Math.max(0, item.start + delta));
    await save();
  }
  return { markup, act, change, submit, pointerDown, pointerUp, model };
}
