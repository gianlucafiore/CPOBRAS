import {
  criticalWalk,
  fitViewport,
  worldPoint,
  automaticPositions,
  withDependency,
  expectedPertDuration,
} from "../services/pert.js";
import { createGantt } from "./gantt.js";
import { createCalendarPicker } from "./calendar-picker.js";
import { e, field, select, dateToday } from "./helpers.js";
import {
  splitTask,
  taskPercent,
  allocatedPercent,
} from "../services/task-segments.js";
import { money, numeric, percentageOf, sumDecimals } from "../decimal.js";

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
    calendarOpen: false,
    viewport: { x: 40, y: 40, zoom: 1 },
    splitting: null,
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
      exceptions: {},
    },
    segments: {},
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
    model.plan.segments ||= {};
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
  const calendarPicker = createCalendarPicker({ state, document });
  const ganttView = createGantt({
    state,
    model,
    document,
    save: () => save(),
    render,
  });
  function gantt() {
    return ganttView.markup();
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
    const pos = positions();
    const available = (model.lines || []).filter(
      (l) =>
        Number(allocatedPercent(model.plan, l.id)) < 100 &&
        l.description.toLowerCase().includes(model.pertQuery.toLowerCase()),
    );
    return `<section class="pert-workspace"><aside class="pert-palette"><h2>Partidas del presupuesto</h2><p>Arrastrá una partida al lienzo o usá «Añadir». Podés distribuir una partida entre varios tramos sin superar su cantidad.</p>${field("Buscar partida para PERT", "pert-query", model.pertQuery, 'type="search"')}<div class="pert-source-list">${
      available
        .slice(0, 200)
        .map(
          (l) =>
            `<div class="pert-source" draggable="${!state.remoteProject}" data-pert-line="${e(l.id)}"><span>${e(l.description)}</span><button class="btn tiny" data-action="plan-add-line" data-id="${e(l.id)}">Añadir</button></div>`,
        )
        .join("") || "<p>No hay partidas disponibles.</p>"
    }</div><p>${available.length} partidas disponibles</p></aside><section><div class="feature-toolbar"><p id="pert-instructions" role="status">${model.connectFrom ? "Elegí la entrada de la tarea sucesora, o cancelá la conexión." : "Mové los nodos desde su cabecera. Arrastrá una salida hacia una entrada para conectar tareas (fin → inicio)."}</p><button class="btn" data-action="plan-connect-cancel">Cancelar conexión</button><button class="btn" data-action="plan-arrange">Organizar nodos</button><div class="pert-camera" role="group" aria-label="Vista del PERT"><button class="btn" data-action="plan-zoom-out" aria-label="Alejar PERT">−</button><output data-pert-zoom>${Math.round(model.viewport.zoom * 100)} %</output><button class="btn" data-action="plan-zoom-in" aria-label="Acercar PERT">+</button><button class="btn" data-action="plan-center">Centrar / ver todo</button></div></div><div class="pert-scroll" data-pert-viewport aria-label="Lienzo PERT, arrastrá el fondo para desplazar"><div class="pert-canvas" data-pert-canvas style="transform:translate(${model.viewport.x}px,${model.viewport.y}px) scale(${model.viewport.zoom})"><svg class="pert-connections" width="1" height="1" aria-label="Conexiones de precedencia"><defs><marker id="pert-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#547387"/></marker></defs><g class="pert-edge-layer">${pertEdges(pos)}</g><path class="pert-wire-preview" hidden fill="none" stroke="#fb8a27" stroke-width="3"/></svg>${model.plan.tasks
      .map((t) => {
        const p = pos[t.id],
          scheduled = model.schedule?.tasks.find((v) => v.id === t.id);
        return `<article class="pert-node ${scheduled?.critical ? "critical" : ""}" data-pert-node="${e(t.id)}" style="left:${p.x}px;top:${p.y}px"><header data-pert-handle="${e(t.id)}" tabindex="0" aria-label="Mover nodo ${e(t.name)}">⋮⋮ ${e(t.name)}</header><div><span>${t.duration_days} días ${model.plan.segments?.[t.id] ? "· " + numeric(taskPercent(model.plan, t.id)) + " % de la partida" : ""} ${p.estimates ? "· estimación PERT" : ""}</span><small>${e(scheduled?.start || "")} → ${e(scheduled?.finish || "")}</small><button class="btn tiny" data-action="plan-edit" data-id="${e(t.id)}">Ver / editar tarea</button></div><button class="pert-port in" data-action="plan-connect-to" data-id="${e(t.id)}" data-pert-in="${e(t.id)}" aria-label="Entrada de ${e(t.name)}" title="Entrada: conectar predecesora">●</button><button class="pert-port out" data-action="plan-connect-from" data-id="${e(t.id)}" data-pert-out="${e(t.id)}" aria-label="Salida de ${e(t.name)}" title="Salida: conectar sucesora">●</button></article>`;
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
    if (!line || Number(allocatedPercent(model.plan, id)) >= 100)
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
    const remaining = sumDecimals([
      "100",
      "-" + allocatedPercent(model.plan, id),
    ]);
    const sibling = model.plan.tasks.find((t) => t.estimate_line_id === id);
    if (sibling) {
      model.plan.segments ||= {};
      model.plan.segments[task.id] = {
        group_id: model.plan.segments[sibling.id].group_id,
        percent: remaining,
        base_budget: model.plan.segments[sibling.id].base_budget,
      };
    }
    model.plan.tasks.push(task);
    model.plan.presentation ||= {};
    model.plan.presentation[task.id] = {
      x,
      y,
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
    return `<div class="modal-overlay task-editor-overlay"><section class="dialog-shell task-editor-dialog" role="dialog" aria-modal="true" aria-label="Editar tarea o hito"><form id="planning-task-form"><div class="dialog-header"><h2>Editar tarea / hito</h2><button class="close-dialog" type="button" data-action="plan-cancel" aria-label="Cerrar editor de tarea">×</button></div><div class="compact-editor-body"><div class="task-basic-grid">${field("Nombre", "name", task.name, "required")}${select("Tarea superior", "parent_id", [["", "Sin superior"], ...options(task.id)], task.parent_id)}${select("Partida presupuestaria", "estimate_line_id", [["", "Sin partida vinculada"], ...(model.lines || []).map((line) => [line.id, line.description])], task.estimate_line_id)}${field("Duración en días laborables (0 = hito)", "duration_days", task.duration_days, 'type="number" min="0" max="36500" required')}${field("No iniciar antes de", "not_before", task.not_before || "", 'type="date"')}${field("Fecha límite de finalización", "finish_by", task.finish_by || "", 'type="date"')}${field("Costo previsto (se toma de la partida cuando hay vínculo)", "budget", task.budget, 'type="number" min="0" step="any" required')}${field("Avance real %", "actual_progress", task.actual_progress, 'type="number" min="0" max="100" step="any" required')}
</div>${model.plan.segments?.[task.id] ? `<p class="segment-summary">Tramo: ${numeric(taskPercent(model.plan, task.id))} %${task.estimate_line_id ? " · Cantidad: " + numeric(percentageOf(model.lines.find((l) => l.id === task.estimate_line_id)?.quantity || "0", taskPercent(model.plan, task.id))) + " " + e(model.lines.find((l) => l.id === task.estimate_line_id)?.unit || "") : ""}. El costo se distribuye automáticamente.</p>` : ""}<details class="task-advanced" ${model.plan.presentation?.[task.id]?.estimates ? "open" : ""}><summary>Estimación PERT (opcional)</summary><fieldset class="pert-estimates"><legend>Estimación PERT (opcional)</legend><label><input type="checkbox" name="pert-estimated" ${task._pert || model.plan.presentation?.[task.id]?.estimates ? "checked" : ""}> Calcular duración con tres estimaciones</label><div class="form-grid">${["Optimista", "Probable", "Pesimista"].map((label, i) => field(label + " (días)", "pert-estimate-" + i, (task._pert || model.plan.presentation?.[task.id]?.estimates)?.[i] ?? task.duration_days, 'type="number" min="0" max="36500" step="1"')).join("")}</div><p>Duración = (optimista + 4 × probable + pesimista) / 6, redondeada hacia arriba a días laborables.</p></fieldset></details><details class="task-advanced" ${task.predecessors.length ? "open" : ""}><summary>Dependencias y desfases</summary>${task.predecessors
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
      )}<button class="btn" type="button" data-action="plan-add-dependency">Agregar dependencia</button></details><details class="task-advanced" ${task.assignments.length ? "open" : ""}><summary>Cuadrillas, equipos y recursos</summary>${task.assignments
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
      )}<button class="btn" type="button" data-action="plan-add-assignment">Asignar recurso</button></details><p class="feature-error" role="alert"></p></div><div class="compact-editor-actions"><button class="btn" type="button" data-action="plan-split" data-id="${e(task.id)}" ${model.plan.tasks.some((t) => t.id === task.id) ? "" : "disabled"}>Dividir en tramos</button><button class="btn primary" type="submit">Guardar tarea y recalcular</button><button class="btn" type="button" data-action="plan-cancel">Cancelar</button><button class="btn" type="button" data-action="plan-delete">Eliminar tarea</button></div></form></section></div>`;
  }
  function splitEditor() {
    const t = model.splitting;
    if (!t) return "";
    return `<div class="modal-overlay"><section class="dialog-shell split-task-dialog" role="dialog" aria-modal="true" aria-label="Dividir tarea en tramos"><form id="planning-split-form"><div class="dialog-header"><h2>Dividir ${e(t.name)}</h2><button class="close-dialog" type="button" data-action="plan-split-cancel" aria-label="Cerrar división">×</button></div><div class="compact-editor-body"><p>Se reparte la cantidad y el costo de esta tarea. Cada tramo tendrá su duración, dependencias y avance. Podés volver a dividir cualquier tramo.</p><div class="task-basic-grid">${field("Nombre del primer tramo", "first-name", t.name + " · tramo 1", "required")}${field("Nombre del segundo tramo", "second-name", t.name + " · tramo 2", "required")}${field("Porcentaje para el primer tramo", "first-share", "50", 'type="number" min="0.000001" max="99.999999" step="any" required')}${field("Duración del primer tramo", "first-days", Math.max(1, Math.ceil(t.duration_days / 2)), 'type="number" min="0" max="36500" required')}${field("Duración del segundo tramo", "second-days", Math.max(1, Math.floor(t.duration_days / 2)), 'type="number" min="0" max="36500" required')}</div><p>El segundo recibe el porcentaje restante. Se conectan fin → inicio; después podés separar sus etapas editando fechas o precedencias.</p><p class="feature-error" role="alert"></p></div><div class="compact-editor-actions"><button class="btn" type="button" data-action="plan-split-cancel">Cancelar</button><button class="btn primary" type="submit">Dividir tarea</button></div></form></section></div>`;
  }
  function criticalExplanation() {
    const walk = criticalWalk(model.plan, model.schedule);
    const tasks = model.plan.tasks.filter((t) =>
      model.schedule?.tasks.some((s) => s.id === t.id && s.critical),
    );
    return `<details class="planning-options"><summary>Cómo se calcula la duración · camino crítico</summary>${walk.simple ? `<p class="critical-walk"><strong>Un recorrido crítico:</strong> ${walk.tasks.map((t) => e(t.name) + " (" + t.duration_days + " d)").join(" → ")} = <strong>${model.schedule.duration_days} días laborables</strong>.</p>` : ""}<p>Las ramas en paralelo no se suman entre sí. El plazo incluye calendario, desfases y restricciones. Una tarea desconectada no retrasa a las demás salvo que termine después.</p><ul>${tasks.map((t) => `<li>${e(t.name)} · ${t.duration_days} días${t.predecessors.length ? " · depende de " + t.predecessors.map((d) => e(model.plan.tasks.find((p) => p.id === d.task_id)?.name || "") + " (" + e(d.kind) + (d.lag_days ? " " + d.lag_days + " d" : "") + ")").join(", ") : ""}</li>`).join("")}</ul><strong>Total del cronograma: ${model.schedule?.duration_days || 0} días laborables</strong></details>`;
  }
  function markup() {
    if (model.plan)
      calendarPicker.configure(
        model.plan.calendar,
        model.projectId + ":" + model.revision,
      );
    return `<main class="feature-page"><div class="feature-toolbar"><h1>Planificación de obras</h1><span class="scope-label">${e(state.projects.find((p) => p.id === state.projectId)?.name)}</span>${model.projectId ? '<button class="btn primary" data-action="plan-new">Nueva tarea / hito</button><button class="btn" data-action="plan-baseline">Guardar línea base</button>' : ""}</div>${
      !model.projectId
        ? "<p>Seleccioná una obra para planificar.</p>"
        : `
      <nav class="planning-tabs" aria-label="Vistas de planificación"><button class="btn ${model.tab === "gantt" ? "active" : ""}" role="tab" aria-selected="${model.tab === "gantt"}" data-action="plan-view" data-view="gantt">Gantt</button><button class="btn ${model.tab === "pert" ? "active" : ""}" role="tab" aria-selected="${model.tab === "pert"}" data-action="plan-view" data-view="pert">PERT</button></nav><div class="planning-overview-row"><details class="planning-options planning-calendar" ${model.calendarOpen ? "open" : ""}><summary>Calendario y seguimiento</summary><form id="planning-settings" class="feature-toolbar">${field("Inicio del proyecto", "start_date", model.plan.calendar.start_date, 'type="date" required')}${field("Fecha de seguimiento", "as_of", model.asOf, 'type="date" required')}<fieldset><legend>Días laborables</legend>${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day, index) => `<label><input type="checkbox" name="workday" value="${index}" ${model.plan.calendar.nonworking_weekdays.includes(index) ? "" : "checked"}>${day}</label>`).join("")}</fieldset><div data-calendar-picker>${calendarPicker.markup()}</div><button class="btn primary" type="submit">Guardar calendario</button><p class="feature-error" role="alert"></p></form></details>
      <div class="planning-metrics"><span>Duración <b>${model.schedule?.duration_days || 0} días laborables</b></span><span>Fin previsto <b>${e(model.schedule?.finish)}</b></span><span>Planificado <b>${numeric(model.schedule?.planned_progress)} %</b></span><span>Real <b>${numeric(model.schedule?.actual_progress)} %</b></span><span>${model.dirty ? "Cambios sin guardar" : "Revisión " + model.revision}</span></div></div>
      ${model.schedule?.warnings.map((warning) => `<p class="feature-error">${e(warning)}</p>`).join("") || ""}<details class="planning-options"><summary>Líneas base e historial de revisiones</summary>${select("Comparar línea base", "planning-baseline", [["", "Sin superposición"], ...model.baselines.map((baseline) => [baseline.id, baseline.name + " · revisión " + baseline.revision])], model.baselineId)}<div class="feature-toolbar">${select("Historial de reprogramaciones", "planning-history", [["", "Seleccionar revisión"], ...model.history.map((saved) => [String(saved.revision), "Revisión " + saved.revision + " · " + saved.plan.tasks.length + " tareas"])], model.historyRevision)}<button class="btn" data-action="plan-recover">Recuperar como nueva revisión</button></div></details>${criticalExplanation()}${editor()}${splitEditor()}${model.tab === "pert" ? pert() : gantt()}<div class="feature-columns">${chart()}</div>`
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
    if (action.startsWith("plan-calendar-")) {
      model.calendarOpen = true;
      calendarPicker.act(button);
      return;
    }
    if (action.startsWith("plan-gantt-")) {
      ganttView.act(action);
      return;
    }
    if (["plan-zoom-in", "plan-zoom-out", "plan-center"].includes(action)) {
      const viewport = document.querySelector("[data-pert-viewport]");
      if (!viewport) return;
      if (action === "plan-center")
        model.viewport = fitViewport(
          positions(),
          viewport.clientWidth,
          viewport.clientHeight,
        );
      else {
        const old = model.viewport,
          z = Math.max(
            0.1,
            Math.min(3, old.zoom * (action === "plan-zoom-in" ? 1.25 : 0.8)),
          ),
          cx = viewport.clientWidth / 2,
          cy = viewport.clientHeight / 2;
        model.viewport = {
          x: cx - ((cx - old.x) * z) / old.zoom,
          y: cy - ((cy - old.y) * z) / old.zoom,
          zoom: z,
        };
      }
      syncViewport();
      if (action === "plan-center")
        viewport.scrollIntoView({ block: "center" });
      return;
    }
    if (action === "plan-split") {
      if (state.pageDirty) {
        throw new Error(
          "Guardá o cancelá la edición antes de dividir la tarea.",
        );
      }
      model.splitting = structuredClone(
        model.plan.tasks.find((t) => t.id === button.dataset.id),
      );
      model.editing = null;
      render();
      return;
    }
    if (action === "plan-split-cancel") {
      if (
        state.pageDirty &&
        !window.confirm("¿Descartar la división sin guardar?")
      )
        return;
      model.splitting = null;
      state.pageDirty = false;
      render();
      return;
    }
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
      calendarPicker.reset();
      state.view = "planning";
      if (!state.projectId) throw new Error("Abrí una obra desde Inicio");
      if (model.projectId !== state.projectId)
        model.viewport = { x: 40, y: 40, zoom: 1 };
      model.projectId = state.projectId;
      model.splitting = null;
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
    if (action === "plan-cancel") {
      if (
        state.pageDirty &&
        !window.confirm("¿Descartar los cambios de la tarea?")
      )
        return;
      model.editing = null;
      state.pageDirty = false;
    }
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
      delete model.plan.segments?.[model.editing.id];
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
    if (calendarPicker.change(target)) return;
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
    if (form.id === "planning-split-form") {
      const previous = structuredClone(model.plan);
      model.plan = splitTask(model.plan, model.splitting.id, {
        newId: uuid(),
        firstName: value("first-name"),
        secondName: value("second-name"),
        share: value("first-share"),
        firstDays: Number(value("first-days")),
        secondDays: Number(value("second-days")),
      });
      try {
        await save();
        model.splitting = null;
        render();
      } catch (error) {
        model.plan = previous;
        model.dirty = false;
        throw error;
      }
      return;
    }
    if (form.id === "planning-settings") {
      const previous = structuredClone(model.plan),
        previousAsOf = model.asOf;
      model.calendarOpen = Boolean(form.closest("details")?.open);
      model.plan.calendar.start_date = value("start_date");
      const exceptions = calendarPicker.value();
      model.plan.calendar.exceptions = exceptions;
      model.plan.calendar.holidays = Object.entries(exceptions)
        .filter(([, v]) => !v.working)
        .map(([date]) => date)
        .sort();
      model.plan.calendar.nonworking_weekdays = [0, 1, 2, 3, 4, 5, 6].filter(
        (day) => !data.getAll("workday").includes(String(day)),
      );
      model.asOf = value("as_of");
      try {
        await save();
      } catch (error) {
        model.plan = previous;
        model.asOf = previousAsOf;
        model.dirty = false;
        throw error;
      }
      return;
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
  function pointerDown(event) {
    if (ganttView.pointerDown(event)) return;
    if (event.button !== 0) return;
    const background = event.target.closest?.("[data-pert-viewport]");
    if (background && !event.target.closest?.("[data-pert-node]")) {
      event.preventDefault();
      drag = {
        type: "pan",
        x: event.clientX,
        y: event.clientY,
        start: { ...model.viewport },
      };
      return;
    }
    if (state.remoteProject || state.pageDirty) return;
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
  }
  function pointerMove(event) {
    if (ganttView.pointerMove(event)) return;
    if (!drag) return;
    if (drag.type === "pan") {
      model.viewport = {
        ...drag.start,
        x: drag.start.x + event.clientX - drag.x,
        y: drag.start.y + event.clientY - drag.y,
      };
      syncViewport();
      return;
    }
    if (drag.type === "wire") {
      const rect = document
          .querySelector("[data-pert-viewport]")
          .getBoundingClientRect(),
        p = positions()[drag.id],
        path = drag.canvas.querySelector(".pert-wire-preview");
      if (path) {
        path.hidden = false;
        path.removeAttribute("hidden");
        path.setAttribute(
          "d",
          `M${p.x + 230},${p.y + 48} L${worldPoint(model.viewport, rect, event.clientX, event.clientY).x},${worldPoint(model.viewport, rect, event.clientX, event.clientY).y}`,
        );
      }
      return;
    }
    if (drag.type === "node") {
      const x = drag.start.x + (event.clientX - drag.x) / model.viewport.zoom,
        y = drag.start.y + (event.clientY - drag.y) / model.viewport.zoom;
      drag.position = { x, y };
      drag.node.style.left = x + "px";
      drag.node.style.top = y + "px";
      drag.positions[drag.id] = { ...drag.start, x, y };
      const layer = document.querySelector(".pert-edge-layer");
      if (layer) layer.innerHTML = pertEdges(drag.positions);
      return;
    }
  }
  async function pointerUp(event) {
    if (await ganttView.pointerUp(event)) return;
    if (!drag) return;
    if (drag.type === "pan") {
      drag = null;
      return;
    }
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
      const rect = document
          .querySelector("[data-pert-viewport]")
          .getBoundingClientRect(),
        point = worldPoint(model.viewport, rect, event.clientX, event.clientY);
      await addLine(
        event.dataTransfer.getData("application/x-cpobras-pert-line"),
        point.x,
        point.y,
      );
    }
    return true;
  }
  function syncViewport() {
    const view = document.querySelector("[data-pert-viewport]"),
      world = document.querySelector("[data-pert-canvas]");
    if (!view || !world) return;
    const v = model.viewport;
    world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.zoom})`;
    view.style.backgroundPosition = `${v.x}px ${v.y}px`;
    view.style.backgroundSize = `${18 * v.zoom}px ${18 * v.zoom}px`;
    const label = document.querySelector("[data-pert-zoom]");
    if (label) label.textContent = Math.round(v.zoom * 100) + " %";
  }
  const afterRender = () => {
    syncViewport();
    ganttView.afterRender();
  };
  const cancelPointer = () => {
    ganttView.cancel();
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
    afterRender,
    wheel: ganttView.wheel,
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
