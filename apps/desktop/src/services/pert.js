// Gantt and PERT share one task graph; coordinates affect presentation only.
export function automaticPositions(tasks) {
  const levels = new Map(tasks.map((t) => [t.id, 0])),
    successors = new Map(tasks.map((t) => [t.id, []])),
    pending = new Map();
  for (const t of tasks) {
    const known = t.predecessors.filter((d) => levels.has(d.task_id));
    pending.set(t.id, known.length);
    for (const d of known) successors.get(d.task_id).push(t.id);
  }
  const queue = tasks.filter((t) => pending.get(t.id) === 0).map((t) => t.id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const next of successors.get(id)) {
      levels.set(next, Math.max(levels.get(next), levels.get(id) + 1));
      pending.set(next, pending.get(next) - 1);
      if (pending.get(next) === 0) queue.push(next);
    }
  }
  const rows = new Map();
  return Object.fromEntries(
    tasks.map((t) => {
      const l = levels.get(t.id),
        row = rows.get(l) || 0;
      rows.set(l, row + 1);
      return [t.id, { x: 35 + l * 290, y: 35 + row * 145 }];
    }),
  );
}
export function withDependency(plan, from, to) {
  if (from === to) throw new Error("Una tarea no puede depender de sí misma.");
  const copy = structuredClone(plan),
    target = copy.tasks.find((t) => t.id === to);
  if (!target || !copy.tasks.some((t) => t.id === from))
    throw new Error("Tarea inexistente.");
  if (target.predecessors.some((d) => d.task_id === from))
    throw new Error("Estas tareas ya están conectadas.");
  const successors = new Map(copy.tasks.map((t) => [t.id, []]));
  for (const t of copy.tasks)
    for (const d of t.predecessors) successors.get(d.task_id)?.push(t.id);
  const seen = new Set(),
    queue = [to];
  while (queue.length) {
    const id = queue.pop();
    if (id === from) throw new Error("La conexión generaría un ciclo.");
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(successors.get(id) || []));
  }
  target.predecessors.push({ task_id: from, kind: "FS", lag_days: 0 });
  return copy;
}
export function expectedPertDuration(o, m, p) {
  if (
    ![o, m, p].every((n) => Number.isInteger(n) && n >= 0 && n <= 36500) ||
    o > m ||
    m > p
  )
    throw new Error(
      "Usá duraciones enteras: optimista ≤ probable ≤ pesimista.",
    );
  return Math.ceil((o + 4 * m + p) / 6);
}

export function fitViewport(positions, width, height) {
  const list = Object.values(positions);
  if (!list.length) return { x: 40, y: 40, zoom: 1 };
  const minX = Math.min(...list.map((p) => p.x)),
    minY = Math.min(...list.map((p) => p.y)),
    maxX = Math.max(...list.map((p) => p.x + 230)),
    maxY = Math.max(...list.map((p) => p.y + 120));
  const zoom = Math.max(
    0.1,
    Math.min(
      1,
      (width - 80) / (maxX - minX || 1),
      (height - 80) / (maxY - minY || 1),
    ),
  );
  return {
    x: width / 2 - ((minX + maxX) / 2) * zoom,
    y: height / 2 - ((minY + maxY) / 2) * zoom,
    zoom,
  };
}
export function worldPoint(view, rect, x, y) {
  return {
    x: (x - rect.left - view.x) / view.zoom,
    y: (y - rect.top - view.y) / view.zoom,
  };
}

export function criticalWalk(plan, schedule) {
  if (!schedule) return { tasks: [], simple: false };
  const scheduled = new Map(schedule.tasks.map((s) => [s.id, s])),
    byId = new Map(plan.tasks.map((t) => [t.id, t]));
  let current = schedule.tasks.find(
    (s) => s.critical && s.finish_day === schedule.duration_days,
  );
  const result = [],
    seen = new Set();
  let simple = true;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const task = byId.get(current.id);
    if (!task) break;
    result.push(task);
    const next = task.predecessors
      .filter((d) => d.kind === "FS" && d.lag_days === 0)
      .map((d) => scheduled.get(d.task_id))
      .find((s) => s?.critical && s.finish_day === current.start_day);
    if (!next && current.start_day > 0) simple = false;
    current = next;
  }
  const tasks = result.reverse();
  if (
    tasks.reduce((sum, t) => sum + t.duration_days, 0) !==
    schedule.duration_days
  )
    simple = false;
  return { tasks, simple };
}
