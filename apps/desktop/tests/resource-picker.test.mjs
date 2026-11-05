import test from "node:test";
import assert from "node:assert/strict";
import { searchResources } from "../src/components/resource-picker.js";
const resources = [
  { id: "a", code: "MAT-1", description: "Acero inoxidable", unit: "kg" },
  { id: "b", code: "CAL", description: "Cal apagada", unit: "kg" },
  { id: "c", code: "CEM", description: "Cemento pórtland", unit: "bolsa" },
  {
    id: "d",
    code: "OLD",
    description: "Acero viejo",
    unit: "kg",
    active: false,
  },
];
test("resource search tolerates transposition and accents and matches multiple terms", () => {
  assert.equal(searchResources(resources, "acreo")[0].id, "a");
  assert.equal(searchResources(resources, "portland cem")[0].id, "c");
  assert.equal(
    searchResources(resources, "MAT-1 · Acero inoxidable")[0].id,
    "a",
  );
  assert.equal(searchResources(resources, "recurso inexistente").length, 0);
  assert.equal(searchResources(resources, "").length, 3);
});
