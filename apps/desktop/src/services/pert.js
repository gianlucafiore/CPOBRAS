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
