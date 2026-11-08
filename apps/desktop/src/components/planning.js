import {
  automaticPositions,
  withDependency,
  expectedPertDuration,
} from "../services/pert.js";
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
    tab: "gantt",
    connectFrom: null,
    pertQuery: "",
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
    presentation: {},
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
    model.plan.presentation ||= {};
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
    state.message = "";
    model.history = await invoke("list_plan_revisions", {
      projectId: model.projectId,
    }).catch(() => model.history);
    model.schedule = await invoke("calculate_schedule", {
      plan: model.plan,
      asOf: model.asOf,
    }).catch((error) => {
      state.message = "Plan guardado. No se pudo actualizar la vista: " + error;
      return null;
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

  const positions = () => {
    const defaults = automaticPositions(model.plan.tasks);
    return Object.fromEntries(
      model.plan.tasks.map((t) => [
        t.id,
        { ...defaults[t.id], ...model.plan.presentation?.[t.id] },
      ]),
    );
  };
  function pertEdges(pos) {
    return model.plan.tasks
      .flatMap((t) =>
        t.predecessors.map((d) => {
          if (!pos[d.task_id] || !pos[t.id]) return "";
          const a = pos[d.task_id],
            b = pos[t.id],
            x = a.x + 230,
            y = a.y + 48,
            tx = b.x,
            ty = b.y + 48,
            curve = Math.max(55, Math.abs(tx - x) / 2);
          const critical =
            model.schedule?.tasks.find((v) => v.id === t.id)?.critical &&
            model.schedule?.tasks.find((v) => v.id === d.task_id)?.critical;
          return `<g class="pert-edge ${critical ? "critical" : ""}"><path d="M${x},${y} C${x + curve},${y} ${tx - curve},${ty} ${tx},${ty}" marker-end="url(#pert-arrow)"/><text x="${(x + tx) / 2}" y="${(y + ty) / 2 - 7}">${e(d.kind)}${d.lag_days ? " " + d.lag_days + " d" : ""}</text></g>`;
        }),
      )
      .join("");
  }
  function pert() {
    const pos = positions(),
      width = Math.max(1100, ...Object.values(pos).map((p) => p.x + 300)),
      height = Math.max(530, ...Object.values(pos).map((p) => p.y + 150));
    const available = (model.lines || []).filter(
      (l) =>
        !model.plan.tasks.some((t) => t.estimate_line_id === l.id) &&
        l.description.toLowerCase().includes(model.pertQuery.toLowerCase()),
    );
    return `<section class="pert-workspace"><aside class="pert-palette"><h2>Partidas del presupuesto</h2><p>Arrastrá una partida al lienzo o usá «Añadir». Cada partida se vincula a una sola tarea.</p>${field("Buscar partida para PERT", "pert-query", model.pertQuery, 'type="search"')}<div class="pert-source-list">${
      available
        .slice(0, 200)
        .map(
          (l) =>
            `<div class="pert-source" draggable="${!state.remoteProject}" data-pert-line="${e(l.id)}"><span>${e(l.description)}</span><button class="btn tiny" data-action="plan-add-line" data-id="${e(l.id)}">Añadir</button></div>`,
        )
        .join("") || "<p>No hay partidas disponibles.</p>"
    }</div><p>${available.length} partidas disponibles</p></aside><section><div class="feature-toolbar"><p id="pert-instructions" role="status">${model.connectFrom ? "Elegí la entrada de la tarea sucesora, o cancelá la conexión." : "Mové los nodos desde su cabecera. Arrastrá una salida hacia una entrada para conectar tareas (fin → inicio)."}</p><button class="btn" data-action="plan-connect-cancel">Cancelar conexión</button><button class="btn" data-action="plan-arrange">Organizar nodos</button></div><div class="pert-scroll"><div class="pert-canvas" data-pert-canvas style="width:${width}px;height:${height}px"><svg class="pert-connections" width="${width}" height="${height}" aria-label="Conexiones de precedencia"><defs><marker id="pert-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#547387"/></marker></defs><g class="pert-edge-layer">${pertEdges(pos)}</g><path class="pert-wire-preview" hidden fill="none" stroke="#fb8a27" stroke-width="3"/></svg>${model.plan.tasks
      .map((t) => {
        const p = pos[t.id],
          scheduled = model.schedule?.tasks.find((v) => v.id === t.id);
        return `<article class="pert-node ${scheduled?.critical ? "critical" : ""}" data-pert-node="${e(t.id)}" style="left:${p.x}px;top:${p.y}px"><header data-pert-handle="${e(t.id)}" tabindex="0" aria-label="Mover nodo ${e(t.name)}">⋮⋮ ${e(t.name)}</header><div><span>${t.duration_days} días ${p.estimates ? "· estimación PERT" : ""}</span><small>${e(scheduled?.start || "")} → ${e(scheduled?.finish || "")}</small><button class="btn tiny" data-action="plan-edit" data-id="${e(t.id)}">Ver / editar tarea</button></div><button class="pert-port in" data-action="plan-connect-to" data-id="${e(t.id)}" data-pert-in="${e(t.id)}" aria-label="Entrada de ${e(t.name)}" title="Entrada: conectar predecesora">●</button><button class="pert-port out" data-action="plan-connect-from" data-id="${e(t.id)}" data-pert-out="${e(t.id)}" aria-label="Salida de ${e(t.name)}" title="Salida: conectar sucesora">●</button></article>`;
      })
      .join("")}</div></div></section></section>`;
  }
  async function connect(from, to) {
    const previous = structuredClone(model.plan);
    model.connectFrom = null;
    model.plan = withDependency(model.plan, from, to);
    try {
      await save();
    } catch (error) {
      model.plan = previous;
      render();
      throw error;
    }
  }
  async function addLine(id, x = 35, y = 35) {
    if (state.remoteProject) return;
    const line = model.lines.find((l) => l.id === id);
    if (!line || model.plan.tasks.some((t) => t.estimate_line_id === id))
      throw new Error("La partida no está disponible o ya tiene una tarea.");
    const previous = structuredClone(model.plan),
      task = {
        id: uuid(),
        name: line.name || line.description,
        parent_id: null,
        estimate_line_id: id,
        duration_days: 1,
        predecessors: [],
        assignments: [],
        not_before: null,
        finish_by: null,
        budget: line.total || "0",
        actual_progress: "0",
      };
    model.plan.tasks.push(task);
    model.plan.presentation ||= {};
    model.plan.presentation[task.id] = {
      x: Math.max(10, x),
      y: Math.max(10, y),
    };
    try {
      await save();
    } catch (error) {
      model.plan = previous;
      render();
      throw error;
    }
  }
  function editor() {
    const task = model.editing;
    if (!task) return "";
    const resources = [
      ...state.resources.map((resource) => [resource.id, resource.description]),
      ...model.crews.map((crew) => [crew.id, crew.name]),
    ];
    return `<form id="planning-task-form" class="feature-editor"><h2>Editar tarea / hito</h2>${field("Nombre", "name", task.name, "required")}${select("Tarea superior", "parent_id", [["", "Sin superior"], ...options(task.id)], task.parent_id)}${select("Partida presupuestaria", "estimate_line_id", [["", "Sin partida vinculada"], ...(model.lines || []).map((line) => [line.id, line.description])], task.estimate_line_id)}${field("Duración en días laborables (0 = hito)", "duration_days", task.duration_days, 'type="number" min="0" max="36500" required')}${field("No iniciar antes de", "not_before", task.not_before || "", 'type="date"')}${field("Fecha límite de finalización", "finish_by", task.finish_by || "", 'type="date"')}${field("Costo previsto (se toma de la partida cuando hay vínculo)", "budget", task.budget, 'type="number" min="0" step="any" required')}${field("Avance real %", "actual_progress", task.actual_progress, 'type="number" min="0" max="100" step="any" required')}
      <fieldset class="pert-estimates"><legend>Estimación PERT (opcional)</legend><label><input type="checkbox" name="pert-estimated" ${task._pert || model.plan.presentation?.[task.id]?.estimates ? "checked" : ""}> Calcular duración con tres estimaciones</label><div class="form-grid">${["Optimista", "Probable", "Pesimista"].map((label, i) => field(label + " (días)", "pert-estimate-" + i, (task._pert || model.plan.presentation?.[task.id]?.estimates)?.[i] ?? task.duration_days, 'type="number" min="0" max="36500" step="1"')).join("")}</div><p>Duración = (optimista + 4 × probable + pesimista) / 6, redondeada hacia arriba a días laborables.</p></fieldset><h3>Dependencias</h3>${task.predecessors
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
      <nav class="planning-tabs" aria-label="Vistas de planificación"><button class="btn ${model.tab === "gantt" ? "active" : ""}" role="tab" aria-selected="${model.tab === "gantt"}" data-action="plan-view" data-view="gantt">Gantt</button><button class="btn ${model.tab === "pert" ? "active" : ""}" role="tab" aria-selected="${model.tab === "pert"}" data-action="plan-view" data-view="pert">PERT</button></nav><details class="planning-options"><summary>Calendario y seguimiento</summary><form id="planning-settings" class="feature-toolbar">${field("Inicio del proyecto", "start_date", model.plan.calendar.start_date, 'type="date" required')}${field("Fecha de seguimiento", "as_of", model.asOf, 'type="date" required')}${field("Feriados (fechas separadas por comas)", "holidays", model.plan.calendar.holidays.join(", "))}<fieldset><legend>Días laborables</legend>${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day, index) => `<label><input type="checkbox" name="workday" value="${index}" ${model.plan.calendar.nonworking_weekdays.includes(index) ? "" : "checked"}>${day}</label>`).join("")}</fieldset><button class="btn primary" type="submit">Guardar calendario</button><p class="feature-error" role="alert"></p></form></details>
      <div class="planning-metrics"><span>Duración <b>${model.schedule?.duration_days || 0} días laborables</b></span><span>Fin previsto <b>${e(model.schedule?.finish)}</b></span><span>Planificado <b>${numeric(model.schedule?.planned_progress)} %</b></span><span>Real <b>${numeric(model.schedule?.actual_progress)} %</b></span><span>${model.dirty ? "Cambios sin guardar" : "Revisión " + model.revision}</span></div>
      ${model.schedule?.warnings.map((warning) => `<p class="feature-error">${e(warning)}</p>`).join("") || ""}<details class="planning-options"><summary>Líneas base e historial de revisiones</summary>${select("Comparar línea base", "planning-baseline", [["", "Sin superposición"], ...model.baselines.map((baseline) => [baseline.id, baseline.name + " · revisión " + baseline.revision])], model.baselineId)}<div class="feature-toolbar">${select("Historial de reprogramaciones", "planning-history", [["", "Seleccionar revisión"], ...model.history.map((saved) => [String(saved.revision), "Revisión " + saved.revision + " · " + saved.plan.tasks.length + " tareas"])], model.historyRevision)}<button class="btn" data-action="plan-recover">Recuperar como nueva revisión</button></div></details>${editor()}${model.tab === "pert" ? pert() : gantt()}<div class="feature-columns">${chart()}</div>`
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
            name: line.description,
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

    if (data.get("pert-estimated")) {
      task._pert = [0, 1, 2].map((i) => Number(value("pert-estimate-" + i)));
      task.duration_days = expectedPertDuration(...task._pert);
    } else task._pert = null;
    return task;
  }
  async function act(button) {
    const action = button.dataset.action;
    if (
      state.pageDirty &&
      [
        "plan-add-line",
        "plan-arrange",
        "plan-connect-from",
        "plan-connect-to",
      ].includes(action)
    ) {
      if (
        !window.confirm(
          "¿Descartar los cambios de la tarea antes de modificar el diagrama?",
        )
      )
        return;
      model.editing = null;
      state.pageDirty = false;
    }
    if (
      state.remoteProject &&
      ![
        "open-planning",
        "plan-view",
        "plan-edit",
        "plan-cancel",
        "plan-connect-cancel",
      ].includes(action)
    )
      throw new Error("La obra externa es de solo lectura.");
    if (action === "plan-view") {
      if (
        state.pageDirty &&
        !window.confirm(
          "¿Descartar los cambios de la tarea antes de cambiar de vista?",
        )
      )
        return;
      model.tab = button.dataset.view;
      model.editing = null;
      state.pageDirty = false;
      model.connectFrom = null;
    }
    if (action === "plan-add-line") {
      await addLine(button.dataset.id, 35, 35 + model.plan.tasks.length * 145);
      return;
    }
    if (action === "plan-arrange") {
      const auto = automaticPositions(model.plan.tasks);
      for (const t of model.plan.tasks) {
        model.plan.presentation[t.id] = {
          ...model.plan.presentation[t.id],
          ...auto[t.id],
        };
      }
      await save();
      return;
    }
    if (action === "plan-connect-from") {
      model.connectFrom = button.dataset.id;
    }
    if (action === "plan-connect-to") {
      if (model.connectFrom) {
        await connect(model.connectFrom, button.dataset.id);
        return;
      }
    }
    if (action === "plan-connect-cancel") model.connectFrom = null;
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
      await loadLines();
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
      delete model.plan.presentation?.[model.editing.id];
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
    if (target.name === "pert-query") {
      model.pertQuery = target.value;
      render();
      return;
    }
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
      model.plan.presentation ||= {};
      model.plan.presentation[task.id] = {
        ...(positions()[task.id] || {
          x: 35,
          y:
            Math.max(-110, ...Object.values(positions()).map((p) => p.y)) + 145,
        }),
        estimates: task._pert,
      };
      delete task._pert;
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
    if (state.remoteProject || event.button !== 0 || state.pageDirty) return;
    const out = event.target.closest?.("[data-pert-out]");
    if (out) {
      const canvas = out.closest("[data-pert-canvas]");
      drag = {
        type: "wire",
        id: out.dataset.pertOut,
        x: event.clientX,
        y: event.clientY,
        canvas,
      };
      return;
    }
    const handle = event.target.closest?.("[data-pert-handle]");
    if (handle) {
      event.preventDefault();
      const id = handle.dataset.pertHandle,
        p = positions()[id];
      drag = {
        type: "node",
        id,
        x: event.clientX,
        y: event.clientY,
        start: p,
        positions: positions(),
        node: handle.closest("[data-pert-node]"),
      };
      return;
    }
    if (state.remoteProject) return;
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
  function pointerMove(event) {
    if (!drag) return;
    if (drag.type === "wire") {
      const rect = drag.canvas.getBoundingClientRect(),
        p = positions()[drag.id],
        path = drag.canvas.querySelector(".pert-wire-preview");
      if (path) {
        path.hidden = false;
        path.removeAttribute("hidden");
        path.setAttribute(
          "d",
          `M${p.x + 230},${p.y + 48} L${event.clientX - rect.left},${event.clientY - rect.top}`,
        );
      }
      return;
    }
    if (drag.type === "node") {
      const x = Math.max(
          10,
          Math.min(100000, drag.start.x + event.clientX - drag.x),
        ),
        y = Math.max(
          10,
          Math.min(100000, drag.start.y + event.clientY - drag.y),
        );
      drag.position = { x, y };
      drag.node.style.left = x + "px";
      drag.node.style.top = y + "px";
      drag.positions[drag.id] = { ...drag.start, x, y };
      const layer = document.querySelector(".pert-edge-layer");
      if (layer) layer.innerHTML = pertEdges(drag.positions);
      return;
    }
    const bar = document.querySelector(`[data-task-id="${drag.id}"]`);
    if (bar) {
      const delta = Math.round((event.clientX - drag.x) / 24);
      if (drag.resize)
        bar.style.width = Math.max(10, (drag.duration + delta) * 24) + "px";
      else bar.style.left = Math.max(0, drag.start + delta) * 24 + "px";
      bar.classList.add("drag-preview");
    }
  }
  async function pointerUp(event) {
    if (!drag) return;
    if (drag.type === "wire") {
      const item = drag;
      drag = null;
      const target = event.target.closest?.("[data-pert-in]");
      const preview = document.querySelector(".pert-wire-preview");
      if (preview) preview.setAttribute("hidden", "");
      if (
        target &&
        Math.hypot(event.clientX - item.x, event.clientY - item.y) > 3
      ) {
        await connect(item.id, target.dataset.pertIn);
      }
      return;
    }
    if (drag.type === "node") {
      const item = drag;
      drag = null;
      if (
        !item.position ||
        Math.hypot(event.clientX - item.x, event.clientY - item.y) < 3
      ) {
        render();
        return;
      }
      const previous = structuredClone(model.plan);
      model.plan.presentation ||= {};
      model.plan.presentation[item.id] = { ...item.start, ...item.position };
      try {
        await save();
      } catch (error) {
        model.plan = previous;
        render();
        throw error;
      }
      return;
    }
    const item = drag;
    drag = null;
    const delta = Math.round((event.clientX - item.x) / 24);
    if (!delta) return;
    const previous = structuredClone(model.plan);
    const task = model.plan.tasks.find((task) => task.id === item.id);
    if (item.resize && model.plan.presentation?.[task.id])
      model.plan.presentation[task.id].estimates = null;
    if (item.resize)
      task.duration_days = Math.max(0, Math.min(36500, item.duration + delta));
    else task.not_before = dateForDay(Math.max(0, item.start + delta));
    try {
      await save();
    } catch (error) {
      model.plan = previous;
      render();
      throw error;
    }
  }
  function dragStart(event) {
    const source = event.target.closest?.("[data-pert-line]");
    if (!source) return false;
    if (state.remoteProject) {
      event.preventDefault();
      return true;
    }
    event.dataTransfer.setData(
      "application/x-cpobras-pert-line",
      source.dataset.pertLine,
    );
    event.dataTransfer.effectAllowed = "copy";
    return true;
  }
  function dragOver(event) {
    if (!event.dataTransfer?.types.includes("application/x-cpobras-pert-line"))
      return false;
    const canvas = event.target.closest?.("[data-pert-canvas]");
    if (canvas && !state.remoteProject) {
      event.preventDefault();
      canvas.classList.add("drop-section");
    }
    return true;
  }
  async function drop(event) {
    if (!event.dataTransfer?.types.includes("application/x-cpobras-pert-line"))
      return false;
    event.preventDefault();
    const canvas = event.target.closest?.("[data-pert-canvas]");
    if (canvas && !state.remoteProject) {
      canvas.classList.remove("drop-section");
      const rect = canvas.getBoundingClientRect();
      await addLine(
        event.dataTransfer.getData("application/x-cpobras-pert-line"),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    }
    return true;
  }
  const cancelPointer = () => {
    if (drag) {
      drag = null;
      render();
    }
  };
  const dragEnd = () =>
    document
      .querySelectorAll("[data-pert-canvas].drop-section")
      .forEach((c) => c.classList.remove("drop-section"));
  return {
    markup,
    act,
    change,
    submit,
    pointerDown,
    cancelPointer,
    pointerMove,
    pointerUp,
    dragStart,
    dragOver,
    drop,
    dragEnd,
    model,
  };
}
