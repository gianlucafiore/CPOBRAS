import { percentageOf, sumDecimals } from "../decimal.js";
export const taskPercent = (plan, id) => plan.segments?.[id]?.percent || "100";
export const allocatedPercent = (plan, lineId) =>
  sumDecimals(
    plan.tasks
      .filter((t) => t.estimate_line_id === lineId)
      .map((t) => taskPercent(plan, t.id)),
  );
export function splitTask(
  plan,
  id,
  { newId, firstName, secondName, share, firstDays, secondDays },
) {
  const copy = structuredClone(plan),
    original = copy.tasks.find((t) => t.id === id);
  if (!original || copy.tasks.some((t) => t.id === newId))
    throw new Error("Tarea inexistente o identificador repetido.");
  if (
    !firstName.trim() ||
    !secondName.trim() ||
    !Number.isFinite(Number(share)) ||
    Number(share) <= 0 ||
    Number(share) >= 100 ||
    ![firstDays, secondDays].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 36500,
    )
  )
    throw new Error(
      "Completá los nombres, duraciones y un porcentaje mayor a 0 y menor a 100.",
    );
  const old = copy.segments?.[id],
    percent = taskPercent(copy, id),
    first = percentageOf(percent, share),
    second = sumDecimals([percent, "-" + first]),
    base = old?.base_budget || original.budget;
  const firstTask = {
    ...original,
    name: firstName.trim(),
    duration_days: firstDays,
    finish_by: null,
    predecessors: original.predecessors.filter((d) =>
      ["FS", "SS"].includes(d.kind),
    ),
  };
  const secondTask = {
    ...structuredClone(original),
    id: newId,
    name: secondName.trim(),
    duration_days: secondDays,
    not_before: null,
    predecessors: [
      { task_id: id, kind: "FS", lag_days: 0 },
      ...original.predecessors.filter((d) => ["FF", "SF"].includes(d.kind)),
    ],
  };
  firstTask.budget = percentageOf(base, first);
  secondTask.budget = percentageOf(base, second);
  for (const t of copy.tasks)
    if (t.id !== id)
      for (const d of t.predecessors)
        if (d.task_id === id && ["FS", "FF"].includes(d.kind))
          d.task_id = newId;
  const index = copy.tasks.findIndex((t) => t.id === id);
  copy.tasks.splice(index, 1, firstTask, secondTask);
  copy.segments ||= {};
  const group_id = old?.group_id || id;
  copy.segments[id] = { group_id, percent: first, base_budget: base };
  copy.segments[newId] = { group_id, percent: second, base_budget: base };
  copy.presentation ||= {};
  const p = copy.presentation[id] || { x: 35, y: 35 };
  copy.presentation[id] = { ...p, estimates: null };
  copy.presentation[newId] = { x: p.x + 290, y: p.y, estimates: null };
  return copy;
}
