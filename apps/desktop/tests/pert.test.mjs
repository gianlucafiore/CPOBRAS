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

test('critical explanation selects one parallel branch rather than adding both',async()=>{
 const {criticalWalk}=await import('../src/services/pert.js');
 const p={tasks:[{id:'a',name:'Inicio',duration_days:1,predecessors:[]},{id:'b',name:'Rama B',duration_days:1,predecessors:[{task_id:'a',kind:'FS',lag_days:0}]},{id:'c',name:'Rama C',duration_days:1,predecessors:[{task_id:'a',kind:'FS',lag_days:0}]},{id:'d',name:'Fin',duration_days:2,predecessors:[{task_id:'b',kind:'FS',lag_days:0},{task_id:'c',kind:'FS',lag_days:0}]}]};
 const schedule={duration_days:4,tasks:[{id:'a',start_day:0,finish_day:1,critical:true},{id:'b',start_day:1,finish_day:2,critical:true},{id:'c',start_day:1,finish_day:2,critical:true},{id:'d',start_day:2,finish_day:4,critical:true}]};
 const walk=criticalWalk(p,schedule);assert.equal(walk.simple,true);assert.deepEqual(walk.tasks.map(t=>t.id),['a','b','d']);
});
