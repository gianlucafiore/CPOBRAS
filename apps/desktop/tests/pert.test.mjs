import test from "node:test";
import assert from "node:assert/strict";
import {
  automaticPositions,
  withDependency,
  expectedPertDuration,
} from "../src/services/pert.js";
const plan = () => ({
  calendar: {},
  tasks: [
    { id: "a", predecessors: [] },
    { id: "b", predecessors: [] },
    { id: "c", predecessors: [] },
  ],
  presentation: {},
});
test("PERT and Gantt use a single graph; connecting validates cycles without mutating source", () => {
  const p = plan(),
    a = withDependency(p, "a", "b"),
    b = withDependency(a, "b", "c");
  assert.deepEqual(p.tasks[1].predecessors, []);
  assert.equal(b.tasks[2].predecessors[0].kind, "FS");
  assert.throws(() => withDependency(b, "c", "a"), /ciclo/);
  assert.throws(() => withDependency(b, "a", "b"), /conectadas/);
  assert.throws(() => withDependency(b, "a", "a"), /sí misma/);
  const positions = automaticPositions(b.tasks);
  assert.ok(positions.a.x < positions.b.x && positions.b.x < positions.c.x);
});
test("three-point PERT duration validates ordering and rounds to working days", () => {
  assert.equal(expectedPertDuration(1, 2, 6), 3);
  assert.equal(expectedPertDuration(0, 0, 0), 0);
  assert.throws(() => expectedPertDuration(5, 2, 6));
  assert.throws(() => expectedPertDuration(1, 2, 36501));
  assert.throws(() => expectedPertDuration(1, 2.5, 4));
});
