import test from "node:test";
import assert from "node:assert/strict";
import { aiFormReply, appendSuggestedTasks, createItemsBatch, durationFromAcu, estimateRecipePrice, itemRecipe, itemProposals, planningProposals } from "../src/services/ai-form-proposals.js";

test("PERT duration uses the slowest included ACU resource and rounds up working days exactly", () => {
  const components = [
    {description:"Cuadrilla", quantity:"0.3", daily_output:"1"},
    {description:"Equipo", quantity:"0.7", daily_output:"2"},
    {description:"Excluido", quantity:"18", daily_output:"1", included:false},
    {description:"Sin rendimiento", quantity:"3"},
  ];
  assert.deepEqual(durationFromAcu("10", components), {days:4, resource:"Equipo", demand:"7.0", rate:"2"});
  assert.equal(durationFromAcu("0", components), null);
  assert.equal(durationFromAcu("10", [components[3]]), null);
  assert.equal(durationFromAcu("10.000000000000000000000001", components.slice(0,1)).days, 4);
});

test("item proposals keep recipes and leave catalog prices pending, without rejecting a blank quantity", () => {
  const resource = {id:"r",ref:"R1",description:"Acero",unit:"kg",kind:"material",price:"10",price_source:"catálogo:prueba"};
  const pending = {id:"m",ref:"R2",description:"Madera",unit:"m",kind:"material",price:null,price_source:"sin precio"};
  const reply = {items:[{description:"Deck", unit:"m²", section:"Estructura", quantity:null}]};
  const [row] = itemProposals(reply);
  const shortcode = new Map([["R1",resource],["R2",pending]]);
  const proposal = {components:[
    {resource:"R1",quantity:"2",unit:"kg",price:"1000"},
    {resource:"R2",quantity:"6",unit:"m"},
    {resource:"R1",quantity:"1",unit:"bolsa"},
  ]};
  Object.assign(row,itemRecipe(row,{proposal, shortlist:shortcode}));
  assert.deepEqual(estimateRecipePrice(row.components,true), {pending:1, amount:"20"});
  let next = 0;
  const uuid = () => "uuid-" + (++next);
  const batch = createItemsBatch([row], [], "estimate", "ARS", "2026-11-26", true, uuid);
  assert.equal(batch.creates[0].quantity, "0");
  assert.equal(batch.creates[0].id, batch.acus[0].line_id);
  assert.equal(batch.acus[0].pricing, "catalog");
  assert.deepEqual(batch.acus[0].components.map(component => component.expected_resource.price), ["10",null]);
  const unpriced = createItemsBatch([row], [], "estimate", "ARS", "2026-11-26", false, uuid);
  assert.equal(unpriced.acus[0].pricing, "budget_only");
  assert.deepEqual(estimateRecipePrice(row.components,false), {pending:2, amount:null});
  assert.throws(() => createItemsBatch([row], [{description:"Deck", unit:"m²"}], "estimate", "ARS", "2026-11-26", true, uuid), /ya existe/);
  row.quantity = "-1";
  assert.throws(() => createItemsBatch([row], [], "estimate", "ARS", "2026-11-26", true, uuid), /Revisá la cantidad/);
});

test("PERT proposals resolve known IDs, retain existing tasks and accept an edited duration", () => {
  const existing = [{id:"current", ref:"E1", name:"Preparación", predecessors:[]}];
  const candidates = [{id:"line",ref:"P1",description:"Colocar deck",duration:{days:3}}];
  const reply = aiFormReply(JSON.stringify({tasks:[
    {key:"P1",name:"Colocar deck",days:20,after:[{key:"E1",kind:"FS",lag:0}]},
    {key:"N1",name:"Revisión",days:1,after:[{key:"P1",kind:"FS",lag:0}]},
  ]}));
  const tasks = planningProposals(reply, candidates, existing);
  assert.equal(tasks[0].days, 3);
  tasks[0].days = 4;
  let sequence = 0;
  const plan = {tasks:existing, presentation:{current:{x:80,y:40}}};
  const next = appendSuggestedTasks(plan, tasks, existing, () => "new-" + (++sequence));
  assert.equal(plan.tasks.length, 1);
  assert.equal(next.tasks[1].estimate_line_id, "line");
  assert.equal(next.tasks[1].duration_days, 4);
  assert.equal(next.tasks[2].predecessors[0].task_id, next.tasks[1].id);
  assert.throws(() => planningProposals({tasks:[{key:"P1",after:[{key:"Z1"}]}]}, candidates, existing), /precedencia inválida/);
});
