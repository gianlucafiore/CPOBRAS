import test from "node:test";
import assert from "node:assert/strict";
import { splitTask, allocatedPercent } from "../src/services/task-segments.js";
import { sumDecimals } from "../src/decimal.js";
import {
  projectPoint,
  unprojectPoint,
  validLocation,
} from "../src/services/map-coordinates.js";
const fixture = () => ({
  calendar: {},
  presentation: { a: { x: -30, y: 20 } },
  tasks: [
    {
      id: "a",
      name: "Trabajo",
      duration_days: 4,
      estimate_line_id: "line",
      budget: "123.45",
      actual_progress: "50",
      predecessors: [],
      assignments: [],
      not_before: null,
      finish_by: null,
    },
    {
      id: "b",
      name: "Después",
      duration_days: 1,
      estimate_line_id: null,
      budget: "0",
      predecessors: [{ task_id: "a", kind: "FS", lag_days: 0 }],
      assignments: [],
    },
  ],
});
test("splitting allocates quantity and cost once and routes successors to the final stage", () => {
  const p = fixture(),
    split = splitTask(p, "a", {
      newId: "c",
      firstName: "Etapa 1",
      secondName: "Etapa 2",
      share: "30",
      firstDays: 1,
      secondDays: 3,
    });
  assert.equal(p.tasks.length, 2);
  assert.equal(split.tasks.length, 3);
  assert.equal(Number(allocatedPercent(split, "line")), 100);
  assert.equal(
    Number(
      sumDecimals(
        split.tasks.filter((t) => t.estimate_line_id).map((t) => t.budget),
      ),
    ),
    123.45,
  );
  assert.equal(
    split.tasks.find((t) => t.id === "b").predecessors[0].task_id,
    "c",
  );
  const again = splitTask(split, "c", {
    newId: "d",
    firstName: "Etapa 2a",
    secondName: "Etapa 2b",
    share: "50",
    firstDays: 1,
    secondDays: 2,
  });
  assert.equal(Number(allocatedPercent(again, "line")), 100);
  assert.equal(Number(again.segments.d.percent), 35);
  assert.equal(
    Number(
      sumDecimals(
        again.tasks.filter((t) => t.estimate_line_id).map((t) => t.budget),
      ),
    ),
    123.45,
  );
});
test("map coordinates round trip over Argentina and reject invalid points", () => {
  const point = { lat: -38.4161, lon: -63.6167 };
  for (const z of [2, 4, 14, 19]) {
    const out = unprojectPoint(projectPoint(point, z), z);
    assert.ok(Math.abs(out.lat - point.lat) < 1e-8);
    assert.ok(Math.abs(out.lon - point.lon) < 1e-8);
  }
  assert.equal(validLocation("", 0), null);
  assert.equal(validLocation(91, 10), null);
  assert.deepEqual(validLocation(0, 0), { lat: 0, lon: 0 });
});
